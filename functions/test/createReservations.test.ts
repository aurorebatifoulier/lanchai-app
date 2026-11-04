// createReservations: every frozen figure is recomputed server-side; one discount per
// booking; tier lock; stock race; idempotency; Vientiane opening-hours slots; holds / ID.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fns, call, rejects, db, set, UID, RATE, vteSlot, seedBookingWorld } from './helpers';

const book = (uid: string, items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call(fns.createReservations, { items, ...extra }, uid);
const line = (productId = 'tent', days = 3, quantity = 1, extra: Record<string, unknown> = {}) =>
  ({ productId, pickupAtMs: vteSlot(2, '10:00'), returnAtMs: vteSlot(2 + days, '10:00'), quantity, ...extra });

beforeEach(seedBookingWorld);

describe('prices are server-computed', () => {
  test('fake client figures are ignored; tier rate, total and per-unit deposit frozen', async () => {
    const r = await book(UID.A, [line('kayak', 3, 2, { total: 1, pricePerDay: 1, deposit: 0, subtotal: 1 })], { total: 1, deposit: 0 });
    const res = (await db().doc(`reservations/${r.reservationIds[0]}`).get()).data()!;
    assert.equal(res.durationDays, 3);
    assert.equal(res.pricePerDay, 8 * RATE);              // 3–6 day tier, USD → LAK
    assert.equal(res.subtotal, 8 * RATE * 3 * 2);
    assert.equal(res.total, res.subtotal);
    assert.equal(res.depositPerUnit, 50 * RATE);          // tourist 100%
    assert.equal(res.deposit, 50 * RATE * 2);             // PER UNIT × quantity
    assert.equal(res.status, 'pending_payment');
    assert.equal(res.renterId, UID.A);
    assert.match(res.pickupLabel, /· 10:00$/);            // Vientiane time label
  });
  test('resident deposit percentage comes from config, not the client', async () => {
    const r = await book(UID.B, [line('kayak', 1, 1)], { depositPercent: 0 });
    const res = (await db().doc(`reservations/${r.reservationIds[0]}`).get()).data()!;
    assert.equal(res.depositPerUnit, 25 * RATE);          // resident 50% of 50 USD
  });
  test('loyalty coupon % from config by tier (the stored 99% is ignored)', async () => {
    const r = await book(UID.A, [line('kayak', 1)], { couponId: 'cpn1' });
    const res = (await db().doc(`reservations/${r.reservationIds[0]}`).get()).data()!;
    assert.equal(res.couponApplied.percent, 5);
    assert.equal(res.total, Math.round(res.subtotal * 0.95));
    const coupons = (await db().doc(`users/${UID.A}`).get()).get('coupons');
    assert.equal(coupons[0].used, true);
    await rejects(book(UID.A, [line('kayak', 1)], { couponId: 'cpn1' }), 'failed-precondition', 'coupon-invalid'); // used once
  });
});

describe('discounts: one per booking', () => {
  test('coupon + promo together refused', async () => {
    await set('promoCodes/SUMMER10', { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 0, discountGivenLak: 0 });
    await rejects(book(UID.A, [line()], { couponId: 'cpn1', promoCode: 'SUMMER10' }), 'failed-precondition', 'one-discount');
  });
  test('promo applied server-side and counted', async () => {
    await set('promoCodes/SUMMER10', { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 0, discountGivenLak: 0, maxUsesPerRenter: 1 });
    const r = await book(UID.A, [line('kayak', 1)], { promoCode: 'summer10' });
    const res = (await db().doc(`reservations/${r.reservationIds[0]}`).get()).data()!;
    assert.equal(res.promoApplied.discountAmount, Math.round(res.subtotal * 0.1));
    assert.equal((await db().doc('promoCodes/SUMMER10').get()).get('usedCount'), 1);
    await rejects(book(UID.A, [line('kayak', 1)], { promoCode: 'SUMMER10' }), 'failed-precondition', 'promo-invalid'); // per-renter limit
  });
});

describe('access + stock', () => {
  test('tier-locked product refused for a silver renter', async () => {
    await rejects(book(UID.A, [line('goldOnly')]), 'failed-precondition', 'access-restricted');
  });
  test('draft / archived product refused', async () => {
    await set('products/tent', { status: 'draft' });
    await rejects(book(UID.A, [line('tent')]), 'failed-precondition', 'product-unavailable');
  });
  test('stock race: two renters, last unit, same dates → exactly one booking', async () => {
    const results = await Promise.allSettled([book(UID.A, [line('tent')]), book(UID.B, [line('tent')])]);
    const okCount = results.filter(r => r.status === 'fulfilled').length;
    assert.equal(okCount, 1, JSON.stringify(results.map(r => r.status === 'rejected' ? (r.reason as { details?: unknown }).details : 'ok')));
    const all = await db().collection('reservations').where('productId', '==', 'tent').get();
    assert.equal(all.size, 1);
  });
  test('quantity above stock refused', async () => {
    await rejects(book(UID.A, [line('kayak', 1, 4)]), 'failed-precondition', 'slot-unavailable');
  });
});

describe('idempotency', () => {
  test('same requestId twice (sequential and concurrent) → ONE order', async () => {
    const first = await book(UID.A, [line('kayak')], { requestId: 'attempt-0001' });
    const again = await book(UID.A, [line('kayak')], { requestId: 'attempt-0001' });
    assert.equal(again.orderId, first.orderId);
    assert.equal(again.replayed, true);
    const both = await Promise.all([
      book(UID.B, [line('kayak')], { requestId: 'attempt-0002' }),
      book(UID.B, [line('kayak')], { requestId: 'attempt-0002' }),
    ]);
    assert.equal(both[0].orderId, both[1].orderId);
    const mine = await db().collection('reservations').where('renterId', '==', UID.B).get();
    assert.equal(mine.size, 1);
  });
});

describe('Vientiane time slots + account checks', () => {
  test('outside opening hours (Vientiane) or too soon → refused; valid slot accepted', async () => {
    await rejects(book(UID.A, [{ ...line(), pickupAtMs: vteSlot(2, '08:00') }]), 'failed-precondition', 'invalid-slot');
    await rejects(book(UID.A, [{ ...line(), returnAtMs: vteSlot(5, '19:45') }]), 'failed-precondition', 'invalid-slot'); // after last slot 19:30
    await rejects(book(UID.A, [{ ...line(), pickupAtMs: vteSlot(2, '10:10') }]), 'failed-precondition', 'invalid-slot'); // not a 30-min step
    await rejects(book(UID.A, [{ ...line(), pickupAtMs: Date.now() + 30 * 60_000 }]), 'failed-precondition', 'too-soon');
    await rejects(book(UID.A, [{ ...line(), returnAtMs: vteSlot(1, '10:00') }]), 'failed-precondition', 'invalid-dates');
    const r = await book(UID.A, [{ ...line('kayak'), pickupAtMs: vteSlot(2, '09:00'), returnAtMs: vteSlot(3, '19:30') }]);
    assert.ok(r.orderId.startsWith('LNC-'));
  });
  test('booking hold, missing phone, missing ID, unapproved business → refused', async () => {
    await set(`bookingHolds/${UID.A}`, { reasons: ['overdue'] });
    await rejects(book(UID.A, [line('kayak')]), 'failed-precondition', 'account-on-hold');
    await db().doc(`users/${UID.B}`).update({ phone: null });
    await rejects(book(UID.B, [line('kayak')]), 'failed-precondition', 'phone-required');
    await db().doc(`users/${UID.B}`).update({ phone: '+8562099999999' });
    await db().doc(`identityChecks/${UID.B}`).delete();
    await rejects(book(UID.B, [line('kayak')]), 'failed-precondition', 'id-required');
    await db().doc(`users/${UID.BIZ}`).update({ btobStatus: 'pending_approval' });
    await rejects(book(UID.BIZ, [line('kayak')]), 'failed-precondition', 'account-pending');
  });
});
