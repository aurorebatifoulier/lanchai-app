import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { BREVO_API_KEY } from './email/config';
import { sendAccountEmail, promoGrantedEmail, promoExpiringEmail } from './email/triggers';
import { priceLine, depositPercentFor, type PricedProduct } from './shared/pricing';
import { isLoyaltyExcluded } from './shared/loyalty';
import { vteDay } from './shared/dates';
import {
  evaluatePromo, normalizePromoCode, promoErrorText, promoStatus, promoValueText, promoConditionsText, grantId,
  grantExpiryMs, PROMO_ATTEMPTS_PER_HOUR, PROMO_CODE_RE, NOT_FIRST_RENTAL_STATUSES, EXPIRY_REMINDER_DAYS,
  REFERRAL_WELCOME_CODE, type PromoCode, type PromoError, type PromoLine, type PromoGrantInfo, type GrantSource,
  type PromoType,
} from './shared/promo';

// Promo codes + personal wallet — see functions/src/shared/promo.ts. Renters never read
// promoCodes (firestore.rules); promoGrants/{CODE}_{uid} (the wallet) is server-written,
// renter-readable for their own. validatePromoCode / savePromoCode count FAILED tries
// (no code guessing); evaluateMyCodes only evaluates the renter's own codes;
// createReservations re-validates everything in its transaction (readPromo).

const REGION = 'asia-southeast1';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const db = () => admin.firestore();

const promoError = (error: PromoError, minLak?: number) =>
  new HttpsError('failed-precondition', promoErrorText(error, minLak), { code: 'promo-invalid', promoError: error, minLak });
const fail = (error: PromoError, minLak?: number): never => { throw promoError(error, minLak); };

async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  if (!(await db().collection('admins').doc(uid).get()).exists) throw new HttpsError('permission-denied', 'Admins only.', { code: 'admins-only' });
  return uid;
}

const grantRefOf = (code: string, uid: string) => db().collection('promoGrants').doc(grantId(code, uid));
const tsMs = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : null);

function grantInfo(snap: admin.firestore.DocumentSnapshot): PromoGrantInfo | null {
  if (!snap.exists) return null;
  return {
    used: snap.get('used') === true,
    expiresAtMs: tsMs(snap.get('expiresAt')),
    override: (snap.get('override') as PromoGrantInfo['override']) ?? null,
  };
}

/** Everything evaluatePromo needs that lives in Firestore (inside a transaction or not). */
export async function readPromo(
  get: <T>(ref: admin.firestore.DocumentReference<T>) => Promise<admin.firestore.DocumentSnapshot<T>>,
  query: (q: admin.firestore.Query) => Promise<admin.firestore.QuerySnapshot>,
  code: string,
  uid: string,
): Promise<{
  promo: PromoCode; usesByRenter: number; hasPriorBooking: boolean;
  grant: PromoGrantInfo | null; grantRef: admin.firestore.DocumentReference;
} | null> {
  const ref = db().collection('promoCodes').doc(code);
  const snap = await get(ref);
  if (!snap.exists) return null;
  const promo = snap.data() as PromoCode;
  const grantRef = grantRefOf(code, uid);
  const [uses, grantSnap] = [await get(ref.collection('uses').doc(uid)), await get(grantRef)];
  let hasPriorBooking = false;
  if (promo.firstRentalOnly) {
    // Equality only (no composite index) — statuses filtered in code.
    const mine = await query(db().collection('reservations').where('renterId', '==', uid));
    hasPriorBooking = mine.docs.some(d => NOT_FIRST_RENTAL_STATUSES.includes(d.get('status')));
  }
  return { promo, usesByRenter: Number(uses.get('count') ?? 0), hasPriorBooking, grant: grantInfo(grantSnap), grantRef };
}

/** Promo line from a product doc + its priced subtotal. */
export const promoLine = (productId: string, product: Record<string, unknown>, subtotal: number): PromoLine => ({
  subtotal, productId, categoryId: typeof product.category === 'string' ? product.category : null,
});

/** Server-priced lines for a booking being prepared (same rule as createReservations). */
async function priceItems(uid: string, raw: unknown): Promise<{ lines: PromoLine[]; isBusiness: boolean }> {
  const items = Array.isArray(raw) ? raw.slice(0, 10) as Record<string, unknown>[] : [];
  if (items.length === 0) fail('not-in-scope');
  const [userSnap, pricingSnap, loyaltySnap] = await Promise.all([
    db().collection('users').doc(uid).get(),
    db().collection('config').doc('pricing').get(),
    db().collection('config').doc('loyalty').get(),
  ]);
  const profile = userSnap.data() ?? {};
  const exchangeRate = pricingSnap.get('exchangeRate');
  if (typeof exchangeRate !== 'number' || exchangeRate <= 0) throw new HttpsError('failed-precondition', 'Pricing is not available right now.');
  const depositPercent = depositPercentFor(profile.customerType, profile.loyaltyTier, loyaltySnap.data() ?? null);
  const lines: PromoLine[] = [];
  for (const it of items) {
    const productId = typeof it.productId === 'string' ? it.productId : '';
    const pickupAtMs = Number(it.pickupAtMs), returnAtMs = Number(it.returnAtMs), quantity = Number(it.quantity);
    if (!productId || !Number.isFinite(pickupAtMs) || !Number.isFinite(returnAtMs) || returnAtMs <= pickupAtMs
      || !Number.isInteger(quantity) || quantity < 1) fail('not-in-scope');
    const p = (await db().collection('products').doc(productId).get()).data();
    if (!p) fail('not-in-scope');
    const priced = priceLine({ product: p as unknown as PricedProduct, pickupAtMs, returnAtMs, quantity, exchangeRate, depositPercent });
    lines.push(promoLine(productId, p!, priced?.subtotal ?? 0));
  }
  return { lines, isBusiness: isLoyaltyExcluded(profile) };
}

/** Failed-attempt limiter (guessing protection) for validatePromoCode / savePromoCode. */
async function attemptLimiter(uid: string) {
  const ref = db().collection('promoAttempts').doc(uid);
  const now = Date.now();
  const recent = (((await ref.get()).get('at') as number[] | undefined) ?? []).filter(t => now - t < HOUR_MS);
  if (recent.length >= PROMO_ATTEMPTS_PER_HOUR) fail('too-many-attempts');
  return async (error: PromoError, minLak?: number): Promise<never> => {
    await ref.set({ at: [...recent, now].slice(-PROMO_ATTEMPTS_PER_HOUR) }).catch(() => {});
    throw promoError(error, minLak);
  };
}

// { code, items } → { code, discountTotal, perLine }
export const validatePromoCode = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const d = (request.data ?? {}) as { code?: unknown; items?: unknown };
  const code = normalizePromoCode(d.code);
  const failAndCount = await attemptLimiter(uid);
  const { lines, isBusiness } = await priceItems(uid, d.items);
  if (!PROMO_CODE_RE.test(code)) return failAndCount('not-found');
  const ctx = await readPromo(r => r.get(), q => q.get(), code, uid);
  if (!ctx) return failAndCount('not-found');
  const res = evaluatePromo(ctx.promo, {
    lines, nowMs: Date.now(), isBusiness, hasPriorBooking: ctx.hasPriorBooking, usesByRenter: ctx.usesByRenter, grant: ctx.grant,
  });
  if (!res.ok) return failAndCount(res.error, res.minLak);
  return { code, discountTotal: res.total, perLine: res.perLine };
});

// { items } → { codes: [{ code, discountTotal, perLine, valueText, expiresAtMs }], notApplicable }
// The renter's OWN wallet codes for the booking being prepared — no attempt counting.
export const evaluateMyCodes = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const now = Date.now();
  const grants = (await db().collection('promoGrants').where('uid', '==', uid).get()).docs
    .filter(g => g.get('used') !== true && !((tsMs(g.get('expiresAt')) ?? Infinity) <= now));
  if (grants.length === 0) return { codes: [], notApplicable: 0 };
  const { lines, isBusiness } = await priceItems(uid, (request.data as { items?: unknown } | undefined)?.items);
  const codes: { code: string; discountTotal: number; perLine: number[]; valueText: string; expiresAtMs: number | null }[] = [];
  let notApplicable = 0;
  for (const g of grants) {
    const code = String(g.get('code'));
    const ctx = await readPromo(r => r.get(), q => q.get(), code, uid);
    const res = ctx && evaluatePromo(ctx.promo, {
      lines, nowMs: now, isBusiness, hasPriorBooking: ctx.hasPriorBooking, usesByRenter: ctx.usesByRenter, grant: ctx.grant,
    });
    if (!ctx || !res || !res.ok) { notApplicable++; continue; }
    const o = ctx.grant?.override;
    codes.push({
      code, discountTotal: res.total, perLine: res.perLine,
      valueText: promoValueText(o?.type ?? ctx.promo.type, o?.value ?? ctx.promo.value),
      expiresAtMs: grantExpiryMs(ctx.promo, ctx.grant?.expiresAtMs ?? null),
    });
  }
  codes.sort((a, b) => b.discountTotal - a.discountTotal);
  return { codes, notApplicable };
});

// ── Wallet writes ───────────────────────────────────────────────────────────────

async function notify(uid: string, title: string, body: string): Promise<void> {
  await db().collection('notifications').doc(uid).collection('items').add({
    type: 'code', icon: 'gift', iconColor: 'amber', title, body, deepLink: '/profile/loyalty?section=codes',
    createdAt: FieldValue.serverTimestamp(), readAt: null,
  }).catch(() => {});
}

/**
 * Puts a code in a renter's wallet (admin / referral) — creates or refreshes the grant
 * (never one already used), then in-app notification + email (respects
 * emailRemindersOptOut). Returns false when skipped (already used).
 */
export async function grantPromo(uid: string, promo: PromoCode, opts: {
  source: GrantSource; personalExpiryMs: number | null; override?: { type: PromoType; value: number } | null; notifyRenter: boolean;
}): Promise<boolean> {
  const ref = grantRefOf(promo.code, uid);
  const existing = await ref.get();
  if (existing.exists && existing.get('used') === true) return false;
  const expiresAtMs = grantExpiryMs(promo, opts.personalExpiryMs);
  await ref.set({
    code: promo.code, uid, source: opts.source,
    // Display copy for the renter's wallet (renters never read promoCodes).
    valueText: promoValueText(opts.override?.type ?? promo.type, opts.override?.value ?? promo.value),
    conditions: promoConditionsText(promo),
    grantedAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAtMs != null ? Timestamp.fromMillis(expiresAtMs) : null,
    used: false, usedAt: null, usedOrderId: null, reminderSentAt: null,
    ...(opts.override ? { override: opts.override } : {}),
  }, { merge: true });
  if (opts.notifyRenter) {
    const value = promoValueText(opts.override?.type ?? promo.type, opts.override?.value ?? promo.value);
    const conditions = promoConditionsText(promo);
    const expiresLabel = expiresAtMs != null ? vteDay(expiresAtMs - 1) : null;
    const referral = opts.source === 'referral';
    await notify(uid,
      referral ? 'Your welcome gift' : 'A promo code for you',
      `${value}${referral ? ' your first rental' : ''} · ${conditions}${expiresLabel ? ` · until ${expiresLabel}` : ''}. Find it in Loyalty › Your codes.`);
    await sendAccountEmail(uid, (shop, r) => promoGrantedEmail(shop, {
      firstName: r.firstName || r.name || 'there', code: promo.code, valueText: value, conditions,
      expiresLabel, source: referral ? 'referral' : 'admin',
    }), 'promo-granted', { respectOptOut: true });
  }
  return true;
}

// { code } → { code, saved: true, alreadySaved } — "Save to my codes" / wallet "Add a code".
export const savePromoCode = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const code = normalizePromoCode((request.data as { code?: unknown } | undefined)?.code);
  const failAndCount = await attemptLimiter(uid);
  if (!PROMO_CODE_RE.test(code)) return failAndCount('not-found');
  const snap = await db().collection('promoCodes').doc(code).get();
  if (!snap.exists) return failAndCount('not-found');
  const promo = snap.data() as PromoCode;
  const grant = await grantRefOf(code, uid).get();
  if (promo.personal && !grant.exists) return failAndCount('not-found');
  const status = promoStatus(promo, Date.now());
  if (status === 'inactive') return failAndCount('inactive');
  if (status === 'expired') return failAndCount('expired');
  if (status === 'exhausted') return failAndCount('exhausted');
  if (grant.exists) return { code, saved: true, alreadySaved: true };
  await grantPromo(uid, promo, { source: 'saved', personalExpiryMs: null, notifyRenter: false });
  return { code, saved: true, alreadySaved: false };
});

// { code, uids: string[], expiresAtMs?: number|null } → { granted, skipped } — admin only.
export const adminGrantPromo = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as { code?: unknown; uids?: unknown; expiresAtMs?: unknown };
  const code = normalizePromoCode(d.code);
  const uids = Array.isArray(d.uids) ? [...new Set(d.uids.filter((u): u is string => typeof u === 'string' && /^[A-Za-z0-9]{6,128}$/.test(u)))].slice(0, 50) : [];
  const expiresAtMs = typeof d.expiresAtMs === 'number' && d.expiresAtMs > Date.now() ? d.expiresAtMs : null;
  if (!PROMO_CODE_RE.test(code) || uids.length === 0) throw new HttpsError('invalid-argument', 'Choose a code and at least one renter.');
  const snap = await db().collection('promoCodes').doc(code).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'This code doesn’t exist.');
  const promo = snap.data() as PromoCode;
  if (promo.system) throw new HttpsError('failed-precondition', 'This code is given automatically.');
  const status = promoStatus(promo, Date.now());
  if (status === 'inactive' || status === 'expired' || status === 'exhausted') throw new HttpsError('failed-precondition', 'This code can’t be given right now.');
  let granted = 0, skipped = 0;
  for (const uid of uids) {
    if (!(await db().collection('users').doc(uid).get()).exists) { skipped++; continue; }
    if (await grantPromo(uid, promo, { source: 'admin', personalExpiryMs: expiresAtMs, notifyRenter: true })) granted++;
    else skipped++;
  }
  logger.info('[promo] granted by admin', { code, granted, skipped });
  return { granted, skipped };
});

// { code, uid } → { ok } — admin only; never a grant already used.
export const adminRevokeGrant = onCall({ region: REGION }, async request => {
  await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as { code?: unknown; uid?: unknown };
  const code = normalizePromoCode(d.code);
  const uid = typeof d.uid === 'string' ? d.uid : '';
  if (!PROMO_CODE_RE.test(code) || !uid) throw new HttpsError('invalid-argument', 'Invalid request.');
  const ref = grantRefOf(code, uid);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (snap.get('used') === true) throw new HttpsError('failed-precondition', 'This code was already used — it can’t be removed.');
  await ref.delete();
  return { ok: true };
});

// ── Cancellation gives the use back (renter / admin cancellation only) ───────────
// Once EVERY line of the order carrying the promo is cancelled (not admin_release; a
// no-show never gives it back): usedCount −1, discountGivenLak − the discount,
// uses/{uid}.count −1, the wallet grant back to unused, promoRestored on the lines.
export const restoreCancelledPromo = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: REGION },
  async event => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;
      if (before.status === 'cancelled' || after.status !== 'cancelled') return;
      if (after.cancelledBy === 'admin_release') return;
      const code: string | undefined = after.promoApplied?.code;
      if (!code || after.promoRestored) return;

      const lines = after.orderId
        ? (await db().collection('reservations').where('orderId', '==', after.orderId).get()).docs
        : [event.data!.after as admin.firestore.QueryDocumentSnapshot];
      const carrying = lines.filter(d => d.get('promoApplied')?.code === code);
      if (carrying.some(d => d.get('status') !== 'cancelled')) return;

      const orderKey = after.orderId ?? event.params.reservationId;
      const promoRef = db().collection('promoCodes').doc(code);
      const usesRef = promoRef.collection('uses').doc(after.renterId);
      const grantRef = grantRefOf(code, after.renterId);
      await db().runTransaction(async tx => {
        const lineSnaps = await Promise.all(carrying.map(d => tx.get(d.ref)));
        if (lineSnaps.some(l => l.get('promoRestored'))) return;
        const [promoSnap, usesSnap, grantSnap] = await Promise.all([tx.get(promoRef), tx.get(usesRef), tx.get(grantRef)]);
        const discount = lineSnaps.reduce((s, l) => s + Number(l.get('promoApplied')?.discountAmount ?? 0), 0);
        if (promoSnap.exists) {
          tx.update(promoRef, {
            usedCount: Math.max(0, Number(promoSnap.get('usedCount') ?? 0) - 1),
            discountGivenLak: Math.max(0, Number(promoSnap.get('discountGivenLak') ?? 0) - discount),
          });
        }
        if (usesSnap.exists) {
          tx.update(usesRef, {
            count: Math.max(0, Number(usesSnap.get('count') ?? 0) - 1),
            restoredOrderIds: FieldValue.arrayUnion(orderKey),
          });
        }
        if (grantSnap.exists && grantSnap.get('usedOrderId') === orderKey) {
          tx.update(grantRef, { used: false, usedAt: null, usedOrderId: null });
        }
        for (const l of lineSnaps) tx.update(l.ref, { promoRestored: true });
      });
      logger.info('[promo] use restored', { code, orderId: after.orderId ?? null });
    } catch (err) {
      logger.error('[restoreCancelledPromo] failed', { err: String(err) });
    }
  },
);

// ── Expiry reminder: 10:00 Vientiane, unused codes expiring within 3 days, once ──
export const promoWalletDaily = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'Asia/Vientiane', region: REGION, secrets: [BREVO_API_KEY] },
  async () => {
    const now = Date.now();
    const horizon = now + EXPIRY_REMINDER_DAYS * DAY_MS;
    // Equality only (no composite index) — dates filtered in code.
    const snap = await db().collection('promoGrants').where('used', '==', false).get();
    let sent = 0;
    for (const g of snap.docs) {
      const exp = tsMs(g.get('expiresAt'));
      if (exp == null || exp <= now || exp > horizon || g.get('reminderSentAt')) continue;
      const promoSnap = await db().collection('promoCodes').doc(String(g.get('code'))).get();
      if (!promoSnap.exists) continue;
      const promo = promoSnap.data() as PromoCode;
      if (promoStatus(promo, now) !== 'active') continue;
      await g.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
      const o = g.get('override') as PromoGrantInfo['override'];
      const value = promoValueText(o?.type ?? promo.type, o?.value ?? promo.value);
      const expiresLabel = vteDay(exp - 1);
      const uid = String(g.get('uid'));
      await notify(uid, 'Your code expires soon', `${promo.code} · ${value} — use it before ${expiresLabel}.`);
      await sendAccountEmail(uid, (shop, r) => promoExpiringEmail(shop, {
        firstName: r.firstName || r.name || 'there', code: promo.code, valueText: value,
        conditions: promoConditionsText(promo), expiresLabel,
      }), 'promo-expiring', { respectOptOut: true });
      sent++;
    }
    logger.info('[promoWalletDaily] reminders', { sent });
  },
);

/** The system welcome code for invited friends (created on first use; % frozen per grant). */
export async function ensureReferralWelcomeCode(): Promise<PromoCode> {
  const ref = db().collection('promoCodes').doc(REFERRAL_WELCOME_CODE);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as PromoCode;
  const promo: PromoCode = {
    code: REFERRAL_WELCOME_CODE, description: 'Welcome gift for invited friends (automatic)',
    type: 'percent', value: 10, firstRentalOnly: true, maxUsesPerRenter: 1, personal: true, system: true,
    businessAllowed: false, active: true, usedCount: 0, discountGivenLak: 0,
  };
  await ref.set({ ...promo, createdAt: FieldValue.serverTimestamp(), createdBy: 'system' });
  return promo;
}
