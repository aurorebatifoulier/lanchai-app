// The Pick-up (quoteHandover + submitHandover). ONE transaction re-checks the state
// machine, the pick-up DAY (an earlier day changes the booking → refused), a unit
// PHYSICALLY in the shop (stock − out − repair − lost − cleaning; the Chicco case), the
// extra hours of a same-day early pick-up, the ID check and the quote; then writes the
// payment (rental + deposit, each in its own currency / method), the deposit received,
// the checklist, the agreement record, the ID check and phoneVerified. A refusal writes
// nothing.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { fns, call, rejects, set, db, UID, RATE, seedBookingWorld, pickup, goodChecklist, uploadAgreementPdf } from './helpers';

const OWNER = 'ownerOooo1';
const STAFF = 'staffSsss1';
const D = 86_400_000;
const M = 60_000;
const ORDER = 'LNC-261127-AB12';

async function res(id: string, status: string, pickupMs: number, returnMs: number, extra: Record<string, unknown> = {}) {
  await set(`reservations/${id}`, {
    renterId: UID.A, orderId: ORDER, productId: 'cot', productName: 'Travel cot', status, quantity: 1,
    subtotal: 300_000, total: 300_000, deposit: 500_000, pickupLabel: 'x', returnLabel: 'y',
    pickupAt: Timestamp.fromMillis(pickupMs), returnAt: Timestamp.fromMillis(returnMs), ...extra,
  });
}
/** A booking whose pick-up time is (about) now. */
const booking = (id: string, status: string, pickupInDays: number, extra: Record<string, unknown> = {}) =>
  res(id, status, Date.now() + pickupInDays * D, Date.now() + (pickupInDays + 1) * D, extra);

beforeEach(async () => {
  await seedBookingWorld();
  await set('products/cot', { name: 'Travel cot', stockLeft: 1, categories: ['kids'] });
  await set(`admins/${OWNER}`, { role: 'owner', active: true, name: 'Olga' });
  await set(`admins/${STAFF}`, { role: 'staff', active: true, name: 'Sam' });
});

test('quote = the frozen booking figures, in every currency with a rate', async () => {
  await booking('q1', 'pending_payment', 0, { subtotal: 330_000, total: 297_000, couponApplied: { percent: 10, discountAmount: 33_000 } });
  const q = await call(fns.quoteHandover, { ids: ['q1'] }, STAFF);
  assert.equal(q.rentalSubtotalLak, 330_000);
  assert.deepEqual(q.discount, { label: 'Loyalty coupon (10%)', amount: 33_000 });
  assert.equal(q.rentalLak, 297_000);
  assert.equal(q.depositLak, 500_000);
  assert.equal(q.currencies.LAK.rental, 297_000);
  assert.equal(q.currencies.USD.rental, Math.ceil(297_000 / RATE));
  assert.equal(q.currencies.USD.deposit, 25);
  assert.equal(q.currencies.THB, undefined); // no THB rate set
});

test('pick-up: rental by QR in LAK, deposit in USD cash — everything written together', async () => {
  await booking('b1', 'pending_payment', 0);
  const planned = (await db().doc('reservations/b1').get()).get('pickupAt') as Timestamp;
  const got = await pickup(['b1'], STAFF, {
    payment: { rental: { currency: 'LAK', method: 'qr' }, deposit: { currency: 'USD', method: 'cash' } },
  });
  assert.deepEqual(got.collected, { rental: 300_000, deposit: 25 });
  const r = (await db().doc('reservations/b1').get()).data()!;
  assert.equal(r.status, 'active');
  assert.equal(r.lastAction, 'handover');
  assert.equal(r.pickupAt.toMillis(), planned.toMillis());
  // The deposit in ITS OWN currency — what the return reads (depositHeldOf).
  assert.equal(r.handoverChecklist.depositCurrency, 'USD');
  assert.equal(r.handoverChecklist.depositAmount, 25);
  assert.equal(r.handoverChecklist.rentalPaymentMethod, 'qr');
  assert.equal(r.handoverChecklist.confirmedByName, 'Sam');
  assert.equal(r.handoverPayment.rental.amount, 300_000);
  assert.equal(r.handoverPayment.rental.method, 'qr');
  assert.equal(r.handoverPayment.deposit.currency, 'USD');
  assert.equal(r.handoverPayment.deposit.rate, RATE);
  assert.ok(r.agreementId);
  const ag = (await db().doc(`rentalAgreements/${r.agreementId}`).get()).data()!;
  assert.deepEqual(ag.reservationIds, ['b1']);
  assert.equal(typeof ag.pdfSha256, 'string');
  assert.equal((await db().doc(`users/${UID.A}`).get()).get('phoneVerified'), true);
  assert.equal((await db().collection(`notifications/${UID.A}/items`).get()).size, 1);
});

test('an order of 2: one payment prorated per line, one agreement', async () => {
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'] });
  await booking('o1', 'pending_payment', 0, { deposit: 300_000, total: 100_000, subtotal: 100_000 });
  await booking('o2', 'confirmed', 0, { deposit: 200_000, total: 50_000, subtotal: 50_000 });
  await pickup(['o1', 'o2'], STAFF, { payment: { rental: { currency: 'USD', method: 'cash' }, deposit: { currency: 'USD', method: 'cash' } } });
  const [a, b] = await Promise.all(['o1', 'o2'].map(async id => (await db().doc(`reservations/${id}`).get()).data()!));
  assert.equal(a.handoverChecklist.depositAmount + b.handoverChecklist.depositAmount, 25); // ceil(500,000 / 20,000)
  assert.equal(a.agreementId, b.agreementId);
  assert.equal(a.status, 'active');
  assert.equal(b.status, 'active');
});

test('quote-changed when a rate moved; missing PDF; old app payload — nothing written', async () => {
  await booking('b1', 'pending_payment', 0);
  const q = await call(fns.quoteHandover, { ids: ['b1'] }, STAFF);
  await set('config/pricing', { exchangeRate: 25_000 });
  const agreementId = await uploadAgreementPdf(ORDER);
  const base = {
    items: [{ reservationId: 'b1', checklist: goodChecklist('b1') }],
    payment: { rental: { currency: 'USD', method: 'cash' }, deposit: { currency: 'USD', method: 'cash' } },
    quote: { rental: q.currencies.USD.rental, deposit: q.currencies.USD.deposit },
    phoneVerified: true, agreement: { id: agreementId, method: 'signature' },
  };
  await rejects(call(fns.submitHandover, base, STAFF), 'failed-precondition', 'quote-changed');
  await rejects(call(fns.submitHandover, { ...base, agreement: { id: `${ORDER}-zzzzzzzz`, method: 'signature' } }, STAFF), 'failed-precondition', 'missing-pdf');
  await rejects(call(fns.submitHandover, { items: [{ reservationId: 'b1' }] }, STAFF), 'failed-precondition', 'update-app');
  const r = (await db().doc('reservations/b1').get()).data()!;
  assert.equal(r.status, 'pending_payment');
  assert.equal(r.agreementId, undefined);
  assert.equal((await db().doc(`rentalAgreements/${agreementId}`).get()).exists, false);
});

test('first pick-up: the ID check is required, then recorded with the pick-up', async () => {
  await set(`users/${UID.A}`, { firstName: 'Ann', idOnFile: true, idDocVersion: 2, idCheckedVersion: 1 });
  await set(`identityChecks/${UID.A}`, { status: 'on_file', docType: 'passport', files: ['idDocs/x/1.jpg'], version: 2 });
  await booking('b1', 'pending_payment', 0);
  await rejects(pickup(['b1'], STAFF), 'failed-precondition', 'id-check-required');
  assert.equal((await db().doc('reservations/b1').get()).get('status'), 'pending_payment');
  await pickup(['b1'], STAFF, { idCheck: { matchesPerson: true, nameMatches: true } });
  const u = (await db().doc(`users/${UID.A}`).get()).data()!;
  assert.equal(u.idCheckedVersion, 2);
  assert.equal(u.idCheckedBy, 'Sam');
});

test('an earlier DAY is refused (changes the booking: new price), staff and owner', async () => {
  await booking('b1', 'pending_payment', 7);
  for (const uid of [STAFF, OWNER]) await rejects(pickup(['b1'], uid), 'failed-precondition', 'earlier-day');
  await booking('b2', 'pending_payment', 0);
  await rejects(pickup(['b2', 'b1'], STAFF), 'failed-precondition', 'earlier-day');
  assert.equal((await db().doc('reservations/b2').get()).get('status'), 'pending_payment');
});

test('earlier time the same day: pickupAt moves to the handover, booked time kept', async () => {
  const planned = Date.now() + 2 * M;
  await res('e1', 'pending_payment', planned, planned + D);
  const before = Date.now();
  await pickup(['e1'], STAFF);
  const r = (await db().doc('reservations/e1').get()).data()!;
  assert.ok(r.pickupAt.toMillis() >= before && r.pickupAt.toMillis() < planned);
  assert.equal(r.earlyHandoverPlannedAt.toMillis(), planned);
  assert.match(r.pickupLabel, /· \d\d:\d\d$/);
});

test('earlier time the same day: refused when someone else needs the unit in between', async () => {
  const planned = Date.now() + 2 * M;
  // Another renter's booking still occupies the unit (its 12 h buffer) until after now.
  await res('other', 'pending_payment', Date.now() - 2 * D, Date.now() - 11 * 60 * M, { renterId: UID.B, orderId: 'LNC-OTHER-1' });
  await res('e2', 'pending_payment', planned, planned + D);
  const err = await pickup(['e2'], STAFF).catch(e => e);
  assert.equal(err?.details?.code, 'booked-by-someone-else');
  assert.match(String(err?.message), /^Booked by someone else on \d+/);
  assert.deepEqual(err?.details?.conflictIds, ['other']);
  assert.equal((await db().doc('reservations/e2').get()).get('status'), 'pending_payment');
});

test('Chicco case: stock 1, one rental already out → no second pick-up', async () => {
  await booking('out', 'active', -1, { orderId: 'LNC-OUT-1' });
  await booking('today', 'pending_payment', 0);
  for (const uid of [STAFF, OWNER]) await rejects(pickup(['today'], uid), 'failed-precondition', 'no-unit-on-hand');
  assert.equal((await db().doc('reservations/today').get()).get('status'), 'pending_payment');
});

test('cleaning (pending settlement), repair and lost units are not in the shop', async () => {
  await booking('b2', 'pending_payment', 0);
  for (const field of ['pendingSettlementUnits', 'inRepairUnits', 'lostUnits']) {
    await set('products/cot', { name: 'Travel cot', stockLeft: 1, categories: ['kids'], [field]: 1 });
    await rejects(pickup(['b2'], STAFF), 'failed-precondition', 'no-unit-on-hand');
  }
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'], pendingSettlementUnits: 1 });
  await pickup(['b2'], STAFF);
});

test('an order needing 2 units with 1 in the shop is refused as a whole; items of 2 orders too', async () => {
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'] });
  await booking('o1', 'pending_payment', 0);
  await booking('o2', 'pending_payment', 0);
  await booking('o3', 'active', -1, { orderId: 'LNC-OUT-1' });
  await rejects(pickup(['o1', 'o2'], STAFF), 'failed-precondition', 'no-unit-on-hand');
  assert.equal((await db().doc('reservations/o1').get()).get('status'), 'pending_payment');
  await booking('x1', 'pending_payment', 0, { orderId: 'LNC-OTHER-2' });
  await rejects(call(fns.quoteHandover, { ids: ['o1', 'x1'] }, STAFF), 'failed-precondition', 'mixed-order');
});

test('archived rentals don\'t count; refused pick-up → owner only (D2); renters refused', async () => {
  await booking('arch', 'active', -1, { archived: true, orderId: 'LNC-ARCH-1' });
  await booking('b3', 'pending_payment', 0, { pickupRefusedOpen: true });
  await rejects(pickup(['b3'], STAFF), 'failed-precondition', 'not-allowed');
  await rejects(call(fns.quoteHandover, { ids: ['b3'] }, UID.A), 'permission-denied');
  await pickup(['b3'], OWNER);
  assert.equal((await db().doc('reservations/b3').get()).get('pickupRefusedOpen'), false);
});

test('evidence: at least 2 photos per item (even all Good); accessories recorded', async () => {
  await booking('p1', 'pending_payment', 0);
  const one = { ...goodChecklist('p1'), photos: goodChecklist('p1').photos.slice(0, 1) };
  await rejects(pickup(['p1'], STAFF, { override: { items: [{ reservationId: 'p1', checklist: one }] } }), 'invalid-argument', 'photos-required');
  const same = { ...goodChecklist('p1'), photos: [goodChecklist('p1').photos[0], goodChecklist('p1').photos[0]] };
  await rejects(pickup(['p1'], STAFF, { override: { items: [{ reservationId: 'p1', checklist: same }] } }), 'invalid-argument', 'photos-required');
  assert.equal((await db().doc('reservations/p1').get()).get('status'), 'pending_payment');
  const acc = { ...goodChecklist('p1'), accessories: [{ name: 'Carrying bag', qty: 2, handedOver: true }, { name: 'Pump', qty: 1, handedOver: false }] };
  await pickup(['p1'], STAFF, { override: { items: [{ reservationId: 'p1', checklist: acc }] } });
  const r = (await db().doc('reservations/p1').get()).data()!;
  assert.equal(r.handoverChecklist.photos.length, 2);
  assert.deepEqual(r.handoverChecklist.accessories, [{ name: 'Carrying bag', qty: 2, handedOver: true }, { name: 'Pump', qty: 1, handedOver: false }]);
});
