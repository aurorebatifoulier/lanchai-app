import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { priceLine, depositPercentFor, couponPercentFor, orderDiscount, type PricedProduct } from './shared/pricing';
import {
  effectiveStock, computeAvailableUnits, OCCUPYING_STATUSES, PICKUP_DELAY_MS, type OccupancyRecord,
} from './shared/availability';
import { accessDecision } from './shared/productAccess';
import { isLoyaltyExcluded } from './shared/loyalty';
import { buildTimeSlots, toHHMM } from './shared/timeSlots';
import { vteReservationLabel, vteMinutesOfDay, vteDateStamp } from './shared/dates';
import { identityBookingDecision, idCheckNeeded, type IdentityRecord } from './shared/identity';

// ── createReservations ─────────────────────────────────────────────────────────
// The ONLY way a renter creates reservations (firestore.rules: reservations create is
// admin-only). Used by both the single booking and the bag checkout. Every frozen
// figure is recomputed here from server data — product pricing tiers, exchange rate,
// deposit rules, coupon % from config by tier — with the same shared functions the app
// uses for its previews (functions/src/shared/*), so preview and stored values match.
//
// Writes reservations exactly as before (IDs `${orderId}_${n}`, same fields, status
// 'pending_payment'), so every existing trigger, email and screen keeps working.
//
// Errors are HttpsError('failed-precondition' | 'invalid-argument' | …) with a stable
// `details.code` the app maps to a friendly message (lib/firestore.ts).

const REGION = 'asia-southeast1';
const MAX_ITEMS = 10;
const MAX_QUANTITY = 50;
const MAX_NOTES = 500;
// Tolerance on the same-day lead time: the app rounds "now + 2h" up to the next slot,
// but the renter may take a few minutes to confirm.
const LEAD_TIME_TOLERANCE_MS = 15 * 60 * 1000;
const ORDER_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export type BookingErrorCode =
  | 'unauthenticated' | 'invalid-request' | 'phone-required' | 'account-pending' | 'account-on-hold'
  | 'product-unavailable' | 'access-restricted' | 'invalid-slot' | 'too-soon' | 'invalid-dates'
  | 'unpriced' | 'slot-unavailable' | 'coupon-invalid' | 'pricing-not-configured' | 'internal'
  | 'id-required' | 'id-rejected';

function fail(code: BookingErrorCode, message: string, extra: Record<string, unknown> = {}): never {
  const status = code === 'unauthenticated' ? 'unauthenticated'
    : code === 'invalid-request' ? 'invalid-argument'
    : code === 'internal' ? 'internal'
    : 'failed-precondition';
  throw new HttpsError(status, message, { code, ...extra });
}

interface ItemInput { productId: string; pickupAtMs: number; returnAtMs: number; quantity: number }

function parseInput(data: unknown): { items: ItemInput[]; couponId: string | null; notes: string; idCheckAtCounter: boolean } {
  const d = (data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(d.items) ? d.items : [];
  if (raw.length === 0 || raw.length > MAX_ITEMS) fail('invalid-request', 'Choose between 1 and 10 items.');
  const items = raw.map((r): ItemInput => {
    const o = (r ?? {}) as Record<string, unknown>;
    const productId = typeof o.productId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(o.productId) ? o.productId : '';
    const pickupAtMs = Number(o.pickupAtMs);
    const returnAtMs = Number(o.returnAtMs);
    const quantity = Number(o.quantity);
    if (!productId || !Number.isFinite(pickupAtMs) || !Number.isFinite(returnAtMs)
      || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      fail('invalid-request', 'Invalid booking request.');
    }
    return { productId, pickupAtMs, returnAtMs, quantity };
  });
  const couponId = typeof d.couponId === 'string' && d.couponId ? d.couponId : null;
  const notes = typeof d.notes === 'string' ? d.notes.trim().slice(0, MAX_NOTES) : '';
  return { items, couponId, notes, idCheckAtCounter: d.idCheckAtCounter === true };
}

function randomOrderCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ORDER_CODE_CHARS[Math.floor(Math.random() * ORDER_CODE_CHARS.length)];
  return out;
}

export const createReservations = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in to book.');
  const { items, couponId, notes, idCheckAtCounter } = parseInput(request.data);
  const db = admin.firestore();
  const now = Date.now();

  // ── Account checks ──────────────────────────────────────────────────────────
  const [userSnap, adminSnap, holdSnap, pricingSnap, loyaltySnap, shopSnap, identitySnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('admins').doc(uid).get(),
    db.collection('bookingHolds').doc(uid).get(),
    db.collection('config').doc('pricing').get(),
    db.collection('config').doc('loyalty').get(),
    db.collection('config').doc('shop').get(),
    db.collection('identityChecks').doc(uid).get(),
  ]);
  const profile = userSnap.data() ?? {};
  const isAdmin = adminSnap.exists;
  if (!profile.phoneNumber && !profile.phone) fail('phone-required', 'A phone number is required to book.');
  if (profile.accountType === 'btob' && profile.btobStatus !== 'approved') {
    fail('account-pending', 'Your business account is not approved yet.');
  }
  if (holdSnap.exists && !isAdmin) fail('account-on-hold', 'New bookings are paused for this account.');
  // Identity document required to rent (shared/identity.ts): on file, or shown at the
  // shop — never after a rejection until a new one is sent. Admins are exempt.
  const idDecision = isAdmin ? 'ok' : identityBookingDecision(identitySnap.data() as IdentityRecord | undefined, idCheckAtCounter);
  if (idDecision === 'id-rejected') fail('id-rejected', 'Your ID document was declined — please add a new one to book.');
  if (idDecision === 'id-required') fail('id-required', 'An ID document is required to book.');
  const idOnFile = identitySnap.get('status') === 'on_file';
  // First pick-up double check (badge, admin alerts, blocking checklist section) — tied
  // to the current document version, see shared/identity.ts idCheckNeeded.
  const firstRentalIdCheck = idCheckNeeded(profile);

  const exchangeRate = pricingSnap.get('exchangeRate');
  if (typeof exchangeRate !== 'number' || exchangeRate <= 0) fail('pricing-not-configured', 'Pricing is not available right now.');
  const loyaltyCfg = loyaltySnap.data() ?? null;
  const shop = shopSnap.data() ?? {};
  const slots = new Set(buildTimeSlots(shop.openTime, shop.closeTime, shop.lastPickupOffsetMin));
  const depositPercent = depositPercentFor(profile.customerType, profile.loyaltyTier, loyaltyCfg);

  // ── Per-item checks (data outside the transaction is re-validated inside) ────
  for (const it of items) {
    if (it.returnAtMs <= it.pickupAtMs) fail('invalid-dates', 'The return must be after the pick-up.');
    if (it.pickupAtMs < now + PICKUP_DELAY_MS - LEAD_TIME_TOLERANCE_MS) {
      fail('too-soon', 'This pick-up time is too soon — please choose a later slot.');
    }
    for (const ms of [it.pickupAtMs, it.returnAtMs]) {
      if (!slots.has(toHHMM(vteMinutesOfDay(ms)))) fail('invalid-slot', 'This time is outside our opening hours.');
    }
  }

  const productIds = [...new Set(items.map(i => i.productId))].sort();

  // ── Coupon (validated server-side; % from config by tier, never from user data) ──
  const excluded = isLoyaltyExcluded(profile);

  return db.runTransaction(async tx => {
    // All reads first.
    const lockRefs = productIds.map(id => db.collection('productLocks').doc(id));
    const productRefs = productIds.map(id => db.collection('products').doc(id));
    const [lockSnaps, productSnaps, freshUser, freshHold] = await Promise.all([
      Promise.all(lockRefs.map(r => tx.get(r))),
      Promise.all(productRefs.map(r => tx.get(r))),
      tx.get(db.collection('users').doc(uid)),
      tx.get(db.collection('bookingHolds').doc(uid)),
    ]);
    if (freshHold.exists && !isAdmin) fail('account-on-hold', 'New bookings are paused for this account.');
    // Occupancy read straight from reservations (not the async mirror) — the product
    // lock read+write above serializes concurrent bookings of the same product.
    const occupancySnaps = await Promise.all(productIds.map(id =>
      tx.get(db.collection('reservations').where('productId', '==', id).where('status', 'in', OCCUPYING_STATUSES))));

    // Order ID: new, unique (same format as before).
    let orderId = '';
    for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
      const candidate = `LNC-${vteDateStamp(now)}-${randomOrderCode()}`;
      const probe = await tx.get(db.collection('reservations').doc(`${candidate}_1`));
      if (!probe.exists) orderId = candidate;
    }
    if (!orderId) fail('internal', 'Could not create your booking — please try again.');

    const products = new Map(productSnaps.map(s => [s.id, s]));
    const occupancy = new Map(productIds.map((id, i) => [id, occupancySnaps[i].docs.map((d): OccupancyRecord => ({
      pickupAt: d.get('pickupAt')?.toMillis?.() ?? 0,
      returnAt: d.get('returnAt')?.toMillis?.() ?? 0,
      quantity: d.get('quantity') ?? 0,
      reservationId: d.id,
    }))]));

    // Price every line from server data.
    const lines = items.map(it => {
      const snap = products.get(it.productId);
      const p = snap?.data();
      if (!snap?.exists || !p || p.status === 'archived' || p.status === 'draft' || p.available === false) {
        fail('product-unavailable', 'This item is no longer available.', { productId: it.productId });
      }
      const access = accessDecision(
        { accessMode: p.accessMode, minTierRequired: p.minTierRequired, earlyAccessUntilMs: p.earlyAccessUntil?.toMillis?.() ?? null },
        profile.loyaltyTier ?? null, now,
      );
      if (access.locked && !isAdmin) fail('access-restricted', 'This item is reserved for higher-tier members.', { productId: it.productId });

      const priced = priceLine({
        product: p as unknown as PricedProduct,
        pickupAtMs: it.pickupAtMs, returnAtMs: it.returnAtMs, quantity: it.quantity,
        exchangeRate, depositPercent,
      });
      if (!priced || priced.subtotal <= 0) fail('unpriced', 'This item has no price yet.', { productId: it.productId });

      // Availability: existing occupancy + earlier lines of this same order.
      const totalStock = effectiveStock({
        stockLeft: p.stockLeft ?? 0, inRepairUnits: p.inRepairUnits, lostUnits: p.lostUnits,
        pendingSettlementUnits: p.pendingSettlementUnits,
      });
      const occ = occupancy.get(it.productId) ?? [];
      const free = computeAvailableUnits(occ, new Date(it.pickupAtMs), new Date(it.returnAtMs), totalStock);
      if (free < it.quantity) {
        fail('slot-unavailable', `${p.name ?? 'This item'} is no longer available on these dates.`, { productId: it.productId });
      }
      occ.push({ pickupAt: it.pickupAtMs, returnAt: it.returnAtMs, quantity: it.quantity, reservationId: 'pending' });

      return { it, p, ...priced };
    });

    // Coupon: must belong to the renter, be unused, and map to a configured tier %.
    const coupons: Record<string, unknown>[] = freshUser.get('coupons') ?? [];
    let couponPercent = 0;
    let couponIdx = -1;
    if (couponId) {
      couponIdx = coupons.findIndex(c => c.id === couponId);
      const coupon = couponIdx >= 0 ? coupons[couponIdx] : null;
      couponPercent = coupon && !excluded && coupon.used !== true ? couponPercentFor(coupon.tier as string, loyaltyCfg) : 0;
      if (couponPercent <= 0) fail('coupon-invalid', 'This coupon can’t be used.');
    }
    const discount = orderDiscount(lines.map(l => l.subtotal), couponPercent);

    // Writes.
    const reservationIds: string[] = [];
    lines.forEach((l, i) => {
      const total = l.subtotal - discount.perLine[i];
      if (!(total > 0)) fail('unpriced', 'This booking total is invalid.');
      const id = `${orderId}_${i + 1}`;
      reservationIds.push(id);
      tx.set(db.collection('reservations').doc(id), {
        productId:    l.it.productId,
        productName:  l.p.name ?? '',
        productImage: Array.isArray(l.p.images) && typeof l.p.images[0] === 'string' ? l.p.images[0] : null,
        renterId:     uid,
        renterName:   profile.displayName || request.auth?.token.name || request.auth?.token.email || null,
        pickupAt:     admin.firestore.Timestamp.fromMillis(l.it.pickupAtMs),
        returnAt:     admin.firestore.Timestamp.fromMillis(l.it.returnAtMs),
        pickupLabel:  vteReservationLabel(l.it.pickupAtMs),
        returnLabel:  vteReservationLabel(l.it.returnAtMs),
        durationDays: l.durationDays,
        quantity:     l.it.quantity,
        pricePerDay:  l.pricePerDay,
        subtotal:     l.subtotal,
        total,
        deposit:      l.deposit,        // per unit × quantity (depositForLine)
        depositPerUnit: l.depositPerUnit,
        currency:     'LAK',
        notes,
        status:       'pending_payment',
        orderId,
        // "I'll show my ID at the shop" — staff photograph and check it at pick-up.
        idCheckAtCounter: !idOnFile,
        firstRentalIdCheck,
        ...(couponId ? { couponApplied: { id: couponId, percent: couponPercent, discountAmount: discount.perLine[i] } } : {}),
        createdAt:    FieldValue.serverTimestamp(),
      });
    });

    if (couponIdx >= 0) {
      // Array element → concrete Timestamp, never serverTimestamp() (CLAUDE.md gotcha).
      const next = coupons.map((c, i) => i === couponIdx
        ? { ...c, used: true, usedAt: admin.firestore.Timestamp.now(), usedOnReservationId: lines.length > 1 ? orderId : reservationIds[0] }
        : c);
      tx.update(freshUser.ref, { coupons: next });
    }
    lockRefs.forEach((r, i) => tx.set(r, {
      lastBookingAt: FieldValue.serverTimestamp(),
      version: ((lockSnaps[i].get('version') as number | undefined) ?? 0) + 1,
    }, { merge: true }));

    logger.info('[createReservations] created', { uid, orderId, lines: lines.length, coupon: !!couponId });
    return { orderId, reservationIds };
  });
});
