import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireRole, type AdminCaller } from './adminAuth';
import { canDo } from './shared/reservationMachine';
import { auditData, newAuditRef, writeAudit } from './audit';
import { alertOwners } from './ownerAlerts';
import { BREVO_API_KEY } from './email/config';
import { sanitizeGraceHours } from './shared/latePenalty';
import { returnStockMoves } from './shared/returnStock';
import {
  computeReturnCharges, lateReasonText, damageReasonText, depositHeldOf, currencyToLak,
  CHECKLIST_CATEGORY_IDS, CHECKLIST_RATINGS, type ChargeCurrency, type ChecklistRating,
} from './shared/returnCharges';

// Staff / owner counter operations that touch money or need an owner afterwards. The
// SERVER decides every amount here: staff never send a figure (anything that looks like
// one is ignored), never reduce or waive a fee, never decide a deposit retention.
//
// Return = 3 steps in the app (Condition → Settlement → Client confirms, app/admin/return.tsx):
//   • quoteReturn — the Settlement step: the server's figures (quoteFor), no write;
//   • submitReturn — Client confirms: recomputes the SAME quote in its transaction,
//     refuses `quote-changed` when it differs from what was shown, then records the
//     return + the client's signature and settles it: refund / collected → closed;
//     open → balance left for an owner; review (staff-declared damage) → deposit HELD
//     (`chargeReviewPending`), owners alerted. Owners may waive / lower fees on the
//     Settlement step (`adjustments`, never above the suggestion; refused for staff).
// refusePickup — staff don't hand the item over (reason recorded), optionally flag the
//   renter's ID for an owner review; owners are alerted.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'not-found' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};
const DEFAULT_DAMAGED_PERCENT = 60;
/** "4,272,000 LAK" — audit notes / history. */
const fmtMoney = (n: number, cur: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`;
const MAX_PHOTOS = 20;

interface ReturnItemInput {
  reservationId: string;
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  chargeUnits: number;
}

function parseItem(raw: unknown, opts: { requirePhotos: boolean }): ReturnItemInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const reservationId = typeof r.reservationId === 'string' ? r.reservationId : '';
  if (!reservationId) fail('invalid-request', 'Missing booking.', 'invalid-argument');
  const cats = (r.categories ?? {}) as Record<string, { rating?: unknown; note?: unknown }>;
  const categories: ReturnItemInput['categories'] = {};
  for (const id of CHECKLIST_CATEGORY_IDS) {
    const c = cats[id];
    if (!c || !CHECKLIST_RATINGS.includes(c.rating as ChecklistRating)) fail('checklist-incomplete', 'Rate every part of the item first.', 'invalid-argument');
    const note = typeof c!.note === 'string' ? c!.note.trim().slice(0, 500) : '';
    categories[id] = { rating: c!.rating as ChecklistRating, ...(note ? { note } : {}) };
  }
  const photos = Array.isArray(r.photos) ? r.photos.filter((p): p is string => typeof p === 'string') : [];
  if (photos.length > MAX_PHOTOS) fail('too-many-photos', 'Too many photos.', 'invalid-argument');
  // Only photos uploaded for THIS booking's return (storage.rules path).
  const pathMark = `reservations%2F${reservationId}%2Freturn%2F`;
  if (photos.some(p => p.length > 2000 || !p.includes(pathMark))) fail('invalid-photo', 'A photo is not from this return.', 'invalid-argument');
  // A condition other than Good needs at least one photo (evidence).
  if (opts.requirePhotos && Object.values(categories).some(c => c.rating !== 'good') && photos.length === 0) {
    fail('photos-required', 'Add at least one photo: a part isn’t in good condition.', 'invalid-argument');
  }
  const chargeUnits = typeof r.chargeUnits === 'number' && Number.isFinite(r.chargeUnits) ? Math.floor(r.chargeUnits) : 1;
  return { reservationId, categories, photos, chargeUnits };
}

async function returnConfig() {
  const [late, loyalty, pricing] = await Promise.all([
    db().doc('config/latePolicy').get(),
    db().doc('config/loyalty').get(),
    db().doc('config/pricing').get(),
  ]);
  const pos = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
  const pct = loyalty.get('damagedChargePercent');
  return {
    graceHours: sanitizeGraceHours(late.get('graceHours')),
    damagedChargePercent: typeof pct === 'number' && pct >= 0 && pct <= 100 ? pct : DEFAULT_DAMAGED_PERCENT,
    usdRate: pos(pricing.get('exchangeRate')),
    thbRate: pos(pricing.get('thbToLakRate')),
  };
}
type ReturnConfig = Awaited<ReturnType<typeof returnConfig>>;

/** Owner-only decisions on a line, made on the Settlement step (never for staff). */
export interface OwnerAdjustment { waiveLate?: boolean; lateAmount?: number; waiveDamage?: boolean; damageAmount?: number }

export interface QuoteLine {
  reservationId: string;
  productName: string;
  quantity: number;
  condition: 'good' | 'fair' | 'damaged' | 'unusable';
  depositHeld: number;
  lateDays: number;
  lateSuggested: number | null;
  late: number | null;          // after the owner's decision
  lateWaived: boolean;
  damageSuggested: number | null;
  damage: number | null;        // after the owner's decision
  damageWaived: boolean;
  damagePercent: number | null;
  chargeUnits: number;
  needsReview: boolean;
  applied: number;
  outstanding: number;
  refund: number;
}
export type QuoteResult = 'refund' | 'collect' | 'review';
export interface ReturnQuote {
  currency: ChargeCurrency;
  lines: QuoteLine[];
  depositHeld: number;
  charges: number;
  /** Order level: what the client gets back (refund) or pays on top (collect). */
  refund: number;
  collect: number;
  result: QuoteResult;
  refundLak: number | null;
  collectLak: number | null;
}

/**
 * The ONE settlement computation of a return (one item or a whole order), shared by
 * quoteReturn (Settlement step) and submitReturn (writes) — so what staff see is
 * exactly what is recorded. Deposit = what was received at handover (depositHeldOf).
 */
function quoteFor(
  items: ReturnItemInput[],
  docs: FirebaseFirestore.DocumentSnapshot[],
  products: Map<string, FirebaseFirestore.DocumentSnapshot>,
  cfg: ReturnConfig,
  nowMs: number,
  caller: AdminCaller,
  adjustments: Record<string, OwnerAdjustment>,
): ReturnQuote {
  const lines: QuoteLine[] = [];
  let currency: ChargeCurrency | null = null;
  docs.forEach((snap, idx) => {
    const item = items[idx];
    if (!snap.exists) fail('not-found', 'Booking not found.', 'not-found');
    const r = snap.data()!;
    // State machine: only an item that is out can be returned.
    if (!canDo(r, 'return', caller.role, 'server')) fail('not-active', 'This item isn’t out on a rental (already returned?).');
    const held = depositHeldOf(r, cfg.usdRate, cfg.thbRate);
    if (currency && held.currency !== currency) {
      fail('mixed-currencies', 'Return these items separately: their deposits were paid in different currencies.', 'invalid-argument');
    }
    currency = held.currency;
    const retail = products.get(String(r.productId))?.get('retailPrice');
    const c = computeReturnCharges({
      ratings: Object.values(item.categories).map(x => x.rating),
      chargeUnits: item.chargeUnits,
      quantity: Number(r.quantity ?? 1),
      retailPriceUsd: typeof retail === 'number' && retail > 0 ? retail : null,
      damagedChargePercent: cfg.damagedChargePercent,
      depositCurrency: held.currency,
      depositHeld: held.amount,
      returnAtMs: (r.returnAt as Timestamp).toMillis(),
      nowMs,
      pricePerDayLak: Number(r.pricePerDay ?? 0),
      graceHours: cfg.graceHours,
      usdRate: cfg.usdRate,
      thbRate: cfg.thbRate,
    });
    const adj = caller.role === 'owner' ? adjustments[snap.id] ?? {} : {};
    const capped = (v: unknown, max: number | null) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 && (max == null || v <= max) ? Math.ceil(v) : null;
    const lateWaived = adj.waiveLate === true && c.lateAmount != null;
    const late = lateWaived ? null : (capped(adj.lateAmount, c.lateAmount) ?? c.lateAmount);
    const isDamage = c.chargePercent != null;
    const damageWaived = adj.waiveDamage === true && isDamage;
    const ownerDamage = capped(adj.damageAmount, c.damageAmount);
    const damage = !isDamage || damageWaived ? null : (ownerDamage ?? c.damageAmount);
    // Staff: any damage (or an amount that can't be computed) → owner review, deposit held.
    // Owner: decided here — review only if a damage has no amount at all.
    const needsReview = caller.role === 'owner'
      ? (isDamage && !damageWaived && damage == null) || (c.lateAmountLak > 0 && c.lateAmount == null && !lateWaived)
      : isDamage || c.unresolved;
    const total = (late ?? 0) + (damage ?? 0);
    const applied = Math.min(total, held.amount);
    lines.push({
      reservationId: snap.id,
      productName: String(r.productName ?? 'Item'),
      quantity: Number(r.quantity ?? 1),
      condition: c.worst,
      depositHeld: held.amount,
      lateDays: c.lateAmount != null ? c.lateDays : 0,
      lateSuggested: c.lateAmount,
      late,
      lateWaived,
      damageSuggested: c.damageAmount,
      damage,
      damageWaived,
      damagePercent: c.chargePercent,
      chargeUnits: c.chargeUnits,
      needsReview,
      applied,
      outstanding: Math.max(0, total - held.amount),
      refund: Math.max(0, held.amount - applied),
    });
  });
  const cur: ChargeCurrency = currency ?? 'LAK';
  const depositHeld = lines.reduce((s, l) => s + l.depositHeld, 0);
  const charges = lines.reduce((s, l) => s + (l.late ?? 0) + (l.damage ?? 0), 0);
  const net = depositHeld - charges;
  const result: QuoteResult = lines.some(l => l.needsReview) ? 'review' : net >= 0 ? 'refund' : 'collect';
  const refund = result === 'refund' ? net : 0;
  const collect = result === 'collect' ? -net : 0;
  return {
    currency: cur, lines, depositHeld, charges, refund, collect, result,
    refundLak: currencyToLak(refund, cur, cfg.usdRate, cfg.thbRate),
    collectLak: currencyToLak(collect, cur, cfg.usdRate, cfg.thbRate),
  };
}

function parseRequest(d: { items?: unknown; adjustments?: unknown }, requirePhotos: boolean) {
  const rawItems = Array.isArray(d.items) ? d.items : [];
  if (rawItems.length === 0 || rawItems.length > 20) fail('invalid-request', 'Nothing to return.', 'invalid-argument');
  const items = rawItems.map(x => parseItem(x, { requirePhotos }));
  if (new Set(items.map(i => i.reservationId)).size !== items.length) fail('invalid-request', 'Duplicate item.', 'invalid-argument');
  const adjustments = (d.adjustments && typeof d.adjustments === 'object' ? d.adjustments : {}) as Record<string, OwnerAdjustment>;
  return { items, adjustments };
}

async function readForQuote(items: ReturnItemInput[], get: (ref: FirebaseFirestore.DocumentReference) => Promise<FirebaseFirestore.DocumentSnapshot>) {
  const docs = await Promise.all(items.map(i => get(db().collection('reservations').doc(i.reservationId))));
  const pids = [...new Set(docs.map(s => String(s.get('productId') ?? '')))].filter(Boolean);
  const products = new Map((await Promise.all(pids.map(pid => get(db().collection('products').doc(pid))))).map(s => [s.id, s]));
  return { docs, products };
}

// quoteReturn({ items, adjustments? }) → ReturnQuote — the Settlement step (no write).
export const quoteReturn = onCall({ region: REGION, invoker: 'public' }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as { items?: unknown; adjustments?: unknown };
  if (caller.role !== 'owner' && d.adjustments && Object.keys(d.adjustments as object).length) {
    fail('owner-only', 'Only an owner can change a fee.', 'invalid-argument');
  }
  const { items, adjustments } = parseRequest(d, false);
  const cfg = await returnConfig();
  const { docs, products } = await readForQuote(items, ref => ref.get());
  return quoteFor(items, docs, products, cfg, Date.now(), caller, adjustments);
});

export type Settlement = 'refund' | 'collected' | 'open' | 'review';
export interface ReturnResult { reservationId: string; outcome: QuoteResult | 'open'; refund: number; outstanding: number; currency: ChargeCurrency; settled: boolean }

// submitReturn({ items, adjustments?, settlement, quote: { result, refund, collect },
//   clientSignatureSvg }) — Client confirms step. Recomputes the quote IN the transaction
//   and refuses `quote-changed` when it differs from what the client was shown.
export const submitReturn = onCall({ region: REGION, secrets: [BREVO_API_KEY], invoker: 'public' }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as {
    items?: unknown; adjustments?: unknown; settlement?: unknown;
    quote?: { result?: unknown; refund?: unknown; collect?: unknown }; clientSignatureSvg?: unknown;
  };
  if (caller.role !== 'owner' && d.adjustments && Object.keys(d.adjustments as object).length) {
    fail('owner-only', 'Only an owner can change a fee.', 'invalid-argument');
  }
  const { items, adjustments } = parseRequest(d, true);
  const settlement = (['refund', 'collected', 'open', 'review'] as Settlement[]).includes(d.settlement as Settlement)
    ? d.settlement as Settlement : fail('invalid-request', 'Choose how the return is settled.', 'invalid-argument');
  const sig = typeof d.clientSignatureSvg === 'string' ? d.clientSignatureSvg : '';
  if (!sig.startsWith('<svg') || sig.length > 20_000) fail('signature-required', 'The client must sign to confirm the return.', 'invalid-argument');
  const cfg = await returnConfig();
  const nowMs = Date.now();

  let quote: ReturnQuote | null = null;
  const results: ReturnResult[] = [];
  const reviews: { id: string; productName: string; renterName: string }[] = [];
  const renterNotifs: { renterId: string; productName: string; productId: string; id: string }[] = [];

  await db().runTransaction(async tx => {
    results.length = 0; reviews.length = 0; renterNotifs.length = 0;
    const { docs, products } = await readForQuote(items, ref => tx.get(ref));
    const q = quoteFor(items, docs, products, cfg, nowMs, caller, adjustments);
    quote = q;
    // What the client saw must still be true (a late tier may have been crossed since).
    const shown = d.quote ?? {};
    if (shown.result !== q.result || Number(shown.refund) !== q.refund || Number(shown.collect) !== q.collect) {
      throw new HttpsError('failed-precondition', 'The amounts changed — check the settlement again.', { code: 'quote-changed', quote: q });
    }
    const expected: Settlement[] = q.result === 'review' ? ['review'] : q.result === 'refund' ? ['refund'] : ['collected', 'open'];
    if (!expected.includes(settlement)) fail('quote-changed', 'The settlement doesn’t match the amounts — check it again.');
    const finalize = settlement === 'refund' || settlement === 'collected';

    docs.forEach((snap, idx) => {
      const r = snap.data()!;
      const item = items[idx];
      const l = q.lines[idx];
      const severity = l.condition === 'damaged' || l.condition === 'unusable' ? l.condition : null;
      const fields: Record<string, unknown> = {
        status: 'returned',
        returnChecklist: {
          categories: item.categories,
          photos: item.photos,
          depositCurrency: q.currency,
          depositAmount: l.depositHeld,
          confirmedByName: caller.name,
          confirmedByRole: caller.role,
          confirmedAt: FieldValue.serverTimestamp(),
          clientSigned: true,
          clientSignatureSvg: sig,
        },
        returnedAt: FieldValue.serverTimestamp(),
        stockReleasedAt: null,
        returnedBy: { uid: caller.uid, name: caller.name, role: caller.role },
        chargeCurrency: q.currency,
        depositAppliedToCharge: l.applied,
        outstandingBalance: l.outstanding,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (l.late != null) {
        fields.lateChargeAmount = l.late;
        fields.lateChargeReason = lateReasonText((nowMs - (r.returnAt as Timestamp).toMillis()) / 3_600_000);
      }
      if (l.lateWaived) {
        Object.assign(fields, {
          lateChargeWaived: true, lateChargeWaivedAmount: l.lateSuggested,
          lateChargeWaivedReason: lateReasonText((nowMs - (r.returnAt as Timestamp).toMillis()) / 3_600_000),
          lateChargeWaivedBy: caller.name, lateChargeWaivedAt: FieldValue.serverTimestamp(),
        });
      }
      if (severity) {
        fields.chargeSeverity = severity;
        fields.chargePercent = l.damagePercent;
        fields.chargeUnits = l.chargeUnits;
        if (l.damage != null) {
          fields.chargeAmount = l.damage;
          fields.chargeReason = damageReasonText(item.categories, l.condition);
        }
        if (l.damageWaived) {
          Object.assign(fields, {
            damageChargeWaived: true, damageChargeWaivedAmount: l.damageSuggested,
            damageChargeWaivedReason: damageReasonText(item.categories, l.condition),
            damageChargeWaivedPercent: l.damagePercent, damageChargeWaivedBy: caller.name,
            damageChargeWaivedAt: FieldValue.serverTimestamp(),
          });
        }
        if (l.damage != null && l.damageSuggested != null && l.damage < l.damageSuggested) fields.damageChargeSuggested = l.damageSuggested;
      }
      if (l.needsReview) {
        fields.chargeReviewPending = true;
        fields.chargeReviewRequestedAt = FieldValue.serverTimestamp();
      } else if (finalize) {
        if (l.outstanding > 0) {
          fields.outstandingSettled = true;
          fields.outstandingSettledAt = FieldValue.serverTimestamp();
          fields.outstandingSettledBy = caller.name;
        } else {
          fields.depositReturned = true;
          fields.depositReturnedAt = FieldValue.serverTimestamp();
          fields.depositReturnedBy = caller.name;
        }
        fields.returnFinalizedAt = FieldValue.serverTimestamp();
      }

      const auditRef = newAuditRef();
      fields.lastAuditId = auditRef.id;
      fields.lastAction = 'return';
      tx.update(snap.ref, fields);
      tx.set(auditRef, auditData(caller, {
        action: 'return',
        reservationId: snap.id, orderId: r.orderId, productId: r.productId, renterId: r.renterId,
        note: [
          l.late != null ? `late fee ${fmtMoney(l.late, q.currency)}` : null,
          l.lateWaived ? 'late fee waived' : null,
          l.damage != null ? `damage ${fmtMoney(l.damage, q.currency)}` : null,
          l.damageWaived ? 'damage waived' : null,
          l.needsReview ? 'deposit held for owner review'
            : finalize ? (l.outstanding > 0 ? `balance ${fmtMoney(l.outstanding, q.currency)} collected` : `refund ${fmtMoney(l.refund, q.currency)}`)
            : `balance ${fmtMoney(l.outstanding, q.currency)} open`,
          'client signed',
        ].filter(Boolean).join(' · '),
      }));

      // Stock: same shared rule as before (unusable units → lost, the rest pending).
      const moves = returnStockMoves({ quantity: l.quantity, chargeSeverity: severity, chargeUnits: l.chargeUnits });
      const productRef = db().collection('products').doc(String(r.productId));
      const adj = (field: string, delta: number, reason: string) => {
        tx.update(productRef, { [field]: FieldValue.increment(delta) });
        tx.set(productRef.collection('stockAdjustments').doc(), {
          field, delta, reason, reservationId: snap.id, adminName: caller.name, adminUid: caller.uid, createdAt: FieldValue.serverTimestamp(),
        });
      };
      if (moves.lostUnits > 0) adj('lostUnits', moves.lostUnits, 'Return checklist rated item unusable');
      if (moves.pendingUnits > 0) adj('pendingSettlementUnits', moves.pendingUnits, 'Returned — pending deposit settlement');

      results.push({
        reservationId: snap.id,
        outcome: l.needsReview ? 'review' : finalize ? q.result : 'open',
        refund: l.needsReview ? 0 : l.refund,
        outstanding: l.outstanding,
        currency: q.currency,
        settled: !l.needsReview && finalize,
      });
      if (l.needsReview) reviews.push({ id: snap.id, productName: l.productName, renterName: String(r.renterName ?? 'A renter') });
      renterNotifs.push({ renterId: String(r.renterId), productName: l.productName, productId: String(r.productId), id: snap.id });
    });
  });

  // Renter notifications (same texts as the checklist screen).
  await Promise.all(renterNotifs.map(async n => {
    const items = db().collection('notifications').doc(n.renterId).collection('items');
    await items.add({ type: 'rental', icon: 'check', iconColor: 'green', title: 'Rental completed', body: `Thanks for returning the ${n.productName}.`, deepLink: `/rentals/${n.id}`, createdAt: FieldValue.serverTimestamp(), readAt: null });
    await items.add({ type: 'system', icon: 'star', iconColor: 'coral', title: 'How was your rental?', body: `Leave a review for ${n.productName} and help others.`, deepLink: `/review/${n.productId}?reservationId=${n.id}`, createdAt: FieldValue.serverTimestamp(), readAt: null });
  })).catch(err => logger.warn('[returns] renter notification failed', { err: String(err) }));

  for (const rv of reviews) {
    await alertOwners({
      title: 'Damage to review',
      body: `${rv.productName} came back damaged (${rv.renterName}). The deposit is held until you confirm, reduce or waive the charge.`,
      reservationId: rv.id,
      by: caller.name,
    });
  }
  logger.info('[returns] submitted', { by: caller.uid, role: caller.role, items: results.map(r => `${r.reservationId}:${r.outcome}`) });
  return { results, quote };
});

// refusePickup({ reservationIds, reason, flagId?: boolean })
export const refusePickup = onCall({ region: REGION, secrets: [BREVO_API_KEY], invoker: 'public' }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as { reservationIds?: unknown; reason?: unknown; flagId?: unknown };
  const ids = Array.isArray(d.reservationIds) ? [...new Set(d.reservationIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.length === 0 || ids.length > 20) fail('invalid-request', 'Missing booking.', 'invalid-argument');
  const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, 500) : '';
  if (reason.length < 3) fail('reason-required', 'Write why the item isn’t handed over.', 'invalid-argument');
  // State machine, in a transaction: every line is re-read and must still be before
  // pick-up (and not already refused) when the refusal is written.
  const snaps = await db().runTransaction(async tx => {
    const read = await Promise.all(ids.map(id => tx.get(db().collection('reservations').doc(id))));
    const renters = new Set<string>();
    for (const s of read) {
      if (!s.exists) fail('not-found', 'Booking not found.', 'not-found');
      if (!canDo(s.data()!, 'refuse_pickup', caller.role, 'server')) fail('not-before-pickup', 'This item was already handed over, refused or closed.');
      renters.add(String(s.get('renterId')));
    }
    if (renters.size !== 1) fail('invalid-request', 'One renter at a time.', 'invalid-argument');
    const renterId = [...renters][0];
    for (const s of read) {
      const auditRef = newAuditRef();
      tx.update(s.ref, {
        pickupRefusedAt: FieldValue.serverTimestamp(),
        pickupRefusedReason: reason,
        pickupRefusedBy: caller.uid,
        pickupRefusedByName: caller.name,
        pickupRefusedOpen: true,
        lastAuditId: auditRef.id,
        lastAction: 'refuse_pickup',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, auditData(caller, {
        action: 'pickup.refused', reservationId: s.id, orderId: s.get('orderId'), productId: s.get('productId'), renterId, note: reason,
      }));
    }
    if (d.flagId === true) {
      tx.set(db().collection('identityChecks').doc(renterId), {
        flaggedForReview: true,
        flaggedAt: FieldValue.serverTimestamp(),
        flaggedBy: caller.uid,
        flaggedByName: caller.name,
        flaggedReason: reason,
      }, { merge: true });
    }
    return read;
  });
  const renterId = String(snaps[0].get('renterId'));
  if (d.flagId === true) {
    await writeAudit(caller, { action: 'id.flagged', reservationId: ids[0], renterId, note: reason });
  }
  const first = snaps[0];
  await alertOwners({
    title: d.flagId === true ? 'Pick-up refused · ID to review' : 'Pick-up refused',
    body: `${String(first.get('renterName') ?? 'A renter')} — ${String(first.get('productName') ?? 'item')}${ids.length > 1 ? ` (+${ids.length - 1})` : ''}: “${reason}”.`,
    reservationId: first.id,
    by: caller.name,
  });
  return { ok: true };
});

/** Owner closes a refused pick-up / flagged ID once handled (cancel, no-show, or OK). */
export const resolveOwnerAlert = onCall({ region: REGION, invoker: 'public' }, async request => {
  const caller: AdminCaller = await requireRole(request, 'owner');
  const d = (request.data ?? {}) as { kind?: unknown; id?: unknown; note?: unknown };
  const id = typeof d.id === 'string' ? d.id : '';
  if (!id) fail('invalid-request', 'Missing item.', 'invalid-argument');
  const note = typeof d.note === 'string' ? d.note.trim().slice(0, 500) : '';
  if (d.kind === 'pickup') {
    await db().runTransaction(async tx => {
      const ref = db().collection('reservations').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'Booking not found.', 'not-found');
      if (!canDo(snap.data()!, 'close_refusal', caller.role, 'server')) fail('not-allowed', 'This pick-up refusal is already closed.');
      tx.update(ref, {
        pickupRefusedOpen: false, pickupRefusedResolvedAt: FieldValue.serverTimestamp(), pickupRefusedResolvedBy: caller.name,
        lastAction: 'close_refusal', updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await writeAudit(caller, { action: 'pickup.refusal-closed', reservationId: id, note });
  } else if (d.kind === 'id') {
    await db().collection('identityChecks').doc(id).set({ flaggedForReview: false, flagResolvedAt: FieldValue.serverTimestamp(), flagResolvedBy: caller.name }, { merge: true });
    await writeAudit(caller, { action: 'id.flag-closed', renterId: id, note });
  } else {
    fail('invalid-request', 'Unknown item.', 'invalid-argument');
  }
  return { ok: true };
});
