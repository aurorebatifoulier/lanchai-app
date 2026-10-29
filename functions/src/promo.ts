import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { priceLine, depositPercentFor, type PricedProduct } from './shared/pricing';
import { isLoyaltyExcluded } from './shared/loyalty';
import {
  evaluatePromo, normalizePromoCode, promoErrorText, PROMO_ATTEMPTS_PER_HOUR, PROMO_CODE_RE,
  NOT_FIRST_RENTAL_STATUSES, type PromoCode, type PromoError, type PromoLine,
} from './shared/promo';

// Promo codes — see functions/src/shared/promo.ts. Renters never read promoCodes
// (firestore.rules): the app checks a code through validatePromoCode (rate-limited, no
// listing), and createReservations re-validates it in its transaction (readPromoInTx).

const REGION = 'asia-southeast1';
const HOUR_MS = 60 * 60 * 1000;
const db = () => admin.firestore();

/** Everything evaluatePromo needs that lives in Firestore (inside a transaction or not). */
export async function readPromo(
  get: <T>(ref: admin.firestore.DocumentReference<T>) => Promise<admin.firestore.DocumentSnapshot<T>>,
  query: (q: admin.firestore.Query) => Promise<admin.firestore.QuerySnapshot>,
  code: string,
  uid: string,
): Promise<{ promo: PromoCode; usesByRenter: number; hasPriorBooking: boolean } | null> {
  const ref = db().collection('promoCodes').doc(code);
  const snap = await get(ref);
  if (!snap.exists) return null;
  const promo = snap.data() as PromoCode;
  const uses = await get(ref.collection('uses').doc(uid));
  let hasPriorBooking = false;
  if (promo.firstRentalOnly) {
    // Equality only (no composite index) — statuses filtered in code.
    const mine = await query(db().collection('reservations').where('renterId', '==', uid));
    hasPriorBooking = mine.docs.some(d => NOT_FIRST_RENTAL_STATUSES.includes(d.get('status')));
  }
  return { promo, usesByRenter: Number(uses.get('count') ?? 0), hasPriorBooking };
}

/** Promo line from a product doc + its priced subtotal. */
export const promoLine = (productId: string, product: Record<string, unknown>, subtotal: number): PromoLine => ({
  subtotal, productId, categoryId: typeof product.category === 'string' ? product.category : null,
});

const promoError = (error: PromoError, minLak?: number) =>
  new HttpsError('failed-precondition', promoErrorText(error, minLak), { code: 'promo-invalid', promoError: error, minLak });
const fail = (error: PromoError, minLak?: number): never => { throw promoError(error, minLak); };

// { code, items: [{ productId, pickupAtMs, returnAtMs, quantity }] } → { code, discountTotal, perLine }
export const validatePromoCode = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const d = (request.data ?? {}) as { code?: unknown; items?: unknown };
  const code = normalizePromoCode(d.code);
  const items = Array.isArray(d.items) ? d.items.slice(0, 10) as Record<string, unknown>[] : [];
  if (items.length === 0) fail('not-in-scope');

  // Rate limit: PROMO_ATTEMPTS_PER_HOUR FAILED tries per account (sliding hour) — the
  // re-checks of a valid code (dates / quantity changed) never count; guessing does.
  const attemptsRef = db().collection('promoAttempts').doc(uid);
  const now = Date.now();
  const recent = (((await attemptsRef.get()).get('at') as number[] | undefined) ?? []).filter(t => now - t < HOUR_MS);
  if (recent.length >= PROMO_ATTEMPTS_PER_HOUR) fail('too-many-attempts');
  const failAndCount = async (error: PromoError, minLak?: number): Promise<never> => {
    await attemptsRef.set({ at: [...recent, now].slice(-PROMO_ATTEMPTS_PER_HOUR) }).catch(() => {});
    throw promoError(error, minLak);
  };

  const [userSnap, pricingSnap, loyaltySnap] = await Promise.all([
    db().collection('users').doc(uid).get(),
    db().collection('config').doc('pricing').get(),
    db().collection('config').doc('loyalty').get(),
  ]);
  const profile = userSnap.data() ?? {};
  const exchangeRate = pricingSnap.get('exchangeRate');
  if (typeof exchangeRate !== 'number' || exchangeRate <= 0) throw new HttpsError('failed-precondition', 'Pricing is not available right now.');
  const depositPercent = depositPercentFor(profile.customerType, profile.loyaltyTier, loyaltySnap.data() ?? null);

  if (!PROMO_CODE_RE.test(code)) return failAndCount('not-found');
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

  const ctx = await readPromo(r => r.get(), q => q.get(), code, uid);
  if (!ctx) return failAndCount('not-found');
  const res = evaluatePromo(ctx.promo, {
    lines, nowMs: now, isBusiness: isLoyaltyExcluded(profile),
    hasPriorBooking: ctx.hasPriorBooking, usesByRenter: ctx.usesByRenter,
  });
  if (!res.ok) return failAndCount(res.error, res.minLak);
  return { code, discountTotal: (res as { total: number }).total, perLine: (res as { perLine: number[] }).perLine };
});

// ── Cancellation gives the use back (renter / admin cancellation only) ───────────
// Once EVERY line of the order carrying the promo is cancelled (not admin_release; a
// no-show never gives it back): usedCount −1, discountGivenLak − the discount,
// uses/{uid}.count −1, promoRestored on the lines (idempotent). Partial → kept.
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

      const promoRef = db().collection('promoCodes').doc(code);
      const usesRef = promoRef.collection('uses').doc(after.renterId);
      await db().runTransaction(async tx => {
        const lineSnaps = await Promise.all(carrying.map(d => tx.get(d.ref)));
        if (lineSnaps.some(l => l.get('promoRestored'))) return;
        const [promoSnap, usesSnap] = await Promise.all([tx.get(promoRef), tx.get(usesRef)]);
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
            restoredOrderIds: FieldValue.arrayUnion(after.orderId ?? event.params.reservationId),
          });
        }
        for (const l of lineSnaps) tx.update(l.ref, { promoRestored: true });
      });
      logger.info('[promo] use restored', { code, orderId: after.orderId ?? null });
    } catch (err) {
      logger.error('[restoreCancelledPromo] failed', { err: String(err) });
    }
  },
);
