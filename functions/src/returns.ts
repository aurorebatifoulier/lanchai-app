import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireRole, type AdminCaller } from './adminAuth';
import { auditData, newAuditRef, writeAudit } from './audit';
import { alertOwners } from './ownerAlerts';
import { BREVO_API_KEY } from './email/config';
import { sanitizeGraceHours } from './shared/latePenalty';
import { returnStockMoves } from './shared/returnStock';
import {
  computeReturnCharges, lateReasonText, lakToCurrency, damageReasonText,
  CHECKLIST_CATEGORY_IDS, CHECKLIST_RATINGS, type ChargeCurrency, type ChecklistRating,
} from './shared/returnCharges';

// Staff / owner counter operations that touch money or need an owner afterwards. The
// SERVER decides every amount here: staff never send a figure (anything that looks like
// one is ignored), never reduce or waive a fee, never decide a deposit retention.
//
// submitReturn — the return checklist of one item or a whole order (chain):
//   • clean (on time / within grace, good or fair): deposit fully refunded, closed;
//   • late, no damage: the late fee (shared computeLatePenalty) is taken from the deposit;
//     closed when the deposit covers it, or when staff confirm the balance was paid
//     (`collectedBalance`) — otherwise the balance stays open for an owner;
//   • any damage (or a charge that can't be computed): the suggestion is stored, the
//     deposit stays HELD (`chargeReviewPending`) and every owner is alerted at once.
// refusePickup — staff don't hand the item over (reason recorded), optionally flag the
//   renter's ID for an owner review; owners are alerted.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'not-found' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};
const DEFAULT_DAMAGED_PERCENT = 60;
const MAX_PHOTOS = 20;

interface ReturnItemInput {
  reservationId: string;
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  clientConfirmedByName: string;
  clientConfirmed: boolean;
  chargeUnits: number;
}

function parseItem(raw: unknown): ReturnItemInput {
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
  const clientConfirmedByName = typeof r.clientConfirmedByName === 'string' ? r.clientConfirmedByName.trim().slice(0, 120) : '';
  const chargeUnits = typeof r.chargeUnits === 'number' && Number.isFinite(r.chargeUnits) ? Math.floor(r.chargeUnits) : 1;
  return { reservationId, categories, photos, clientConfirmedByName, clientConfirmed: r.clientConfirmed === true, chargeUnits };
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

export interface ReturnResult { reservationId: string; outcome: 'clean' | 'late' | 'damage' | 'review'; refund: number; outstanding: number; currency: ChargeCurrency; settled: boolean }

// submitReturn({ items: [ReturnItemInput], collectedBalance?: boolean })
export const submitReturn = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as { items?: unknown; collectedBalance?: unknown };
  const rawItems = Array.isArray(d.items) ? d.items : [];
  if (rawItems.length === 0 || rawItems.length > 20) fail('invalid-request', 'Nothing to return.', 'invalid-argument');
  const items = rawItems.map(parseItem);
  if (new Set(items.map(i => i.reservationId)).size !== items.length) fail('invalid-request', 'Duplicate item.', 'invalid-argument');
  const collected = d.collectedBalance === true;
  const cfg = await returnConfig();
  const nowMs = Date.now();

  const results: ReturnResult[] = [];
  const reviews: { id: string; productName: string; renterName: string }[] = [];
  const renterNotifs: { renterId: string; productName: string; productId: string; id: string }[] = [];

  await db().runTransaction(async tx => {
    const resSnaps = await Promise.all(items.map(i => tx.get(db().collection('reservations').doc(i.reservationId))));
    const productIds = [...new Set(resSnaps.map(s => String(s.get('productId') ?? '')))];
    const productSnaps = new Map((await Promise.all(productIds.map(pid => tx.get(db().collection('products').doc(pid))))).map(s => [s.id, s]));
    results.length = 0; reviews.length = 0; renterNotifs.length = 0;

    resSnaps.forEach((snap, idx) => {
      const item = items[idx];
      if (!snap.exists) fail('not-found', 'Booking not found.', 'not-found');
      const r = snap.data()!;
      if (r.status !== 'active') fail('not-active', 'This item isn’t out on a rental (already returned?).');
      const hand = (r.handoverChecklist ?? {}) as { depositCurrency?: ChargeCurrency; depositAmount?: number };
      const currency: ChargeCurrency = hand.depositCurrency === 'USD' || hand.depositCurrency === 'THB' ? hand.depositCurrency : 'LAK';
      // The deposit actually received at handover (frozen); legacy fallback = conversion.
      const depositHeld = typeof hand.depositAmount === 'number'
        ? hand.depositAmount
        : (lakToCurrency(Number(r.deposit ?? 0), currency, cfg.usdRate, cfg.thbRate) ?? 0);
      const product = productSnaps.get(String(r.productId));
      const retail = product?.get('retailPrice');
      const c = computeReturnCharges({
        ratings: Object.values(item.categories).map(x => x.rating),
        chargeUnits: item.chargeUnits,
        quantity: Number(r.quantity ?? 1),
        retailPriceUsd: typeof retail === 'number' && retail > 0 ? retail : null,
        damagedChargePercent: cfg.damagedChargePercent,
        depositCurrency: currency,
        depositHeld,
        returnAtMs: (r.returnAt as Timestamp).toMillis(),
        nowMs,
        pricePerDayLak: Number(r.pricePerDay ?? 0),
        graceHours: cfg.graceHours,
        usdRate: cfg.usdRate,
        thbRate: cfg.thbRate,
      });

      const needsReview = c.outcome === 'damage' || c.unresolved;
      const settledNow = !needsReview && (c.outstanding === 0 || collected);
      const checklist = {
        categories: item.categories,
        photos: item.photos,
        depositCurrency: currency,
        depositAmount: depositHeld,
        confirmedByName: caller.name,
        confirmedAt: FieldValue.serverTimestamp(),
        clientConfirmedByName: item.clientConfirmedByName,
        clientConfirmed: item.clientConfirmed,
      };
      const severity = c.worst === 'damaged' || c.worst === 'unusable' ? c.worst : null;
      const fields: Record<string, unknown> = {
        status: 'returned',
        returnChecklist: checklist,
        returnedAt: FieldValue.serverTimestamp(),
        stockReleasedAt: null,
        returnedBy: { uid: caller.uid, name: caller.name, role: caller.role },
        chargeCurrency: currency,
        depositAppliedToCharge: c.depositApplied,
        outstandingBalance: c.outstanding,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (c.lateAmount != null) {
        fields.lateChargeAmount = c.lateAmount;
        fields.lateChargeReason = lateReasonText(c.hoursLate);
      }
      if (severity) {
        fields.chargeSeverity = severity;
        fields.chargePercent = c.chargePercent;
        fields.chargeUnits = c.chargeUnits;
        if (c.damageAmount != null) {
          fields.chargeAmount = c.damageAmount;
          fields.chargeReason = damageReasonText(item.categories, c.worst);
        }
      }
      if (needsReview) {
        fields.chargeReviewPending = true;
        fields.chargeReviewRequestedAt = FieldValue.serverTimestamp();
      } else if (settledNow) {
        if (c.outstanding > 0) {
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
      tx.update(snap.ref, fields);
      tx.set(auditRef, auditData(caller, {
        action: needsReview ? 'return.damage-review' : settledNow ? 'return.settled' : 'return.balance-open',
        reservationId: snap.id, orderId: r.orderId, productId: r.productId, renterId: r.renterId,
        note: [
          c.lateAmount != null ? `late fee ${c.lateAmount} ${currency}` : null,
          c.damageAmount != null ? `damage suggestion ${c.damageAmount} ${currency}` : null,
          needsReview ? 'deposit held for owner review' : settledNow ? (c.outstanding > 0 ? `balance ${c.outstanding} ${currency} collected` : `refund ${c.refund} ${currency}`) : `balance ${c.outstanding} ${currency} open`,
        ].filter(Boolean).join(' · '),
      }));

      // Stock: same shared rule as the checklist (unusable units → lost, rest pending).
      const moves = returnStockMoves({ quantity: Number(r.quantity ?? 1), chargeSeverity: severity, chargeUnits: c.chargeUnits });
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
        outcome: needsReview ? (c.outcome === 'damage' ? 'damage' : 'review') : c.outcome,
        refund: needsReview ? 0 : c.refund,
        outstanding: c.outstanding,
        currency,
        settled: settledNow,
      });
      if (needsReview) reviews.push({ id: snap.id, productName: String(r.productName ?? 'item'), renterName: String(r.renterName ?? 'A renter') });
      renterNotifs.push({ renterId: String(r.renterId), productName: String(r.productName ?? 'item'), productId: String(r.productId), id: snap.id });
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
  return { results };
});

// refusePickup({ reservationIds, reason, flagId?: boolean })
export const refusePickup = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as { reservationIds?: unknown; reason?: unknown; flagId?: unknown };
  const ids = Array.isArray(d.reservationIds) ? [...new Set(d.reservationIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.length === 0 || ids.length > 20) fail('invalid-request', 'Missing booking.', 'invalid-argument');
  const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, 500) : '';
  if (reason.length < 3) fail('reason-required', 'Write why the item isn’t handed over.', 'invalid-argument');
  const snaps = await Promise.all(ids.map(id => db().collection('reservations').doc(id).get()));
  const renters = new Set<string>();
  for (const s of snaps) {
    if (!s.exists) fail('not-found', 'Booking not found.', 'not-found');
    if (!['pending_payment', 'confirmed'].includes(s.get('status'))) fail('not-before-pickup', 'This item was already handed over or closed.');
    renters.add(String(s.get('renterId')));
  }
  if (renters.size !== 1) fail('invalid-request', 'One renter at a time.', 'invalid-argument');
  const renterId = [...renters][0];
  const batch = db().batch();
  for (const s of snaps) {
    const auditRef = newAuditRef();
    batch.update(s.ref, {
      pickupRefusedAt: FieldValue.serverTimestamp(),
      pickupRefusedReason: reason,
      pickupRefusedBy: caller.uid,
      pickupRefusedByName: caller.name,
      pickupRefusedOpen: true,
      lastAuditId: auditRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(auditRef, auditData(caller, {
      action: 'pickup.refused', reservationId: s.id, orderId: s.get('orderId'), productId: s.get('productId'), renterId, note: reason,
    }));
  }
  if (d.flagId === true) {
    batch.set(db().collection('identityChecks').doc(renterId), {
      flaggedForReview: true,
      flaggedAt: FieldValue.serverTimestamp(),
      flaggedBy: caller.uid,
      flaggedByName: caller.name,
      flaggedReason: reason,
    }, { merge: true });
  }
  await batch.commit();
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
export const resolveOwnerAlert = onCall({ region: REGION }, async request => {
  const caller: AdminCaller = await requireRole(request, 'owner');
  const d = (request.data ?? {}) as { kind?: unknown; id?: unknown; note?: unknown };
  const id = typeof d.id === 'string' ? d.id : '';
  if (!id) fail('invalid-request', 'Missing item.', 'invalid-argument');
  const note = typeof d.note === 'string' ? d.note.trim().slice(0, 500) : '';
  if (d.kind === 'pickup') {
    await db().collection('reservations').doc(id).update({ pickupRefusedOpen: false, pickupRefusedResolvedAt: FieldValue.serverTimestamp(), pickupRefusedResolvedBy: caller.name });
    await writeAudit(caller, { action: 'pickup.refusal-closed', reservationId: id, note });
  } else if (d.kind === 'id') {
    await db().collection('identityChecks').doc(id).set({ flaggedForReview: false, flagResolvedAt: FieldValue.serverTimestamp(), flagResolvedBy: caller.name }, { merge: true });
    await writeAudit(caller, { action: 'id.flag-closed', renterId: id, note });
  } else {
    fail('invalid-request', 'Unknown item.', 'invalid-argument');
  }
  return { ok: true };
});
