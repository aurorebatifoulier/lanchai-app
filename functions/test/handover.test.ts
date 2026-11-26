// submitHandover: a unit must be PHYSICALLY in the shop — stock − out with renters
// (early handovers included) − repair − lost − pending settlement / cleaning — checked in
// the state-machine transaction. The Chicco case: stock 1, a rental already out → refused.
// An earlier DAY is refused (changes the booking); an earlier time the same day moves
// pickupAt and needs those hours free.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { fns, call, rejects, set, db, UID, seedBookingWorld } from './helpers';

const OWNER = 'ownerOooo1';
const STAFF = 'staffSsss1';
const D = 86_400_000;

async function booking(id: string, status: string, pickupInDays: number, extra: Record<string, unknown> = {}) {
  await set(`reservations/${id}`, {
    renterId: UID.A, productId: 'cot', productName: 'Travel cot', status, quantity: 1,
    pickupAt: Timestamp.fromMillis(Date.now() + pickupInDays * D), returnAt: Timestamp.fromMillis(Date.now() + (pickupInDays + 1) * D),
    ...extra,
  });
}

beforeEach(async () => {
  await seedBookingWorld();
  await set('products/cot', { name: 'Travel cot', stockLeft: 1, categories: ['kids'] });
  await set(`admins/${OWNER}`, { role: 'owner', active: true, name: 'Olga' });
  await set(`admins/${STAFF}`, { role: 'staff', active: true, name: 'Sam' });
});

const M = 60_000;
async function at(id: string, status: string, pickupMs: number, returnMs: number, extra: Record<string, unknown> = {}) {
  await set(`reservations/${id}`, {
    renterId: UID.A, productId: 'cot', productName: 'Travel cot', status, quantity: 1,
    pickupAt: Timestamp.fromMillis(pickupMs), returnAt: Timestamp.fromMillis(returnMs), ...extra,
  });
}

test('the unit is in the shop → handed over; pick-up time unchanged when on time', async () => {
  await booking('b1', 'confirmed', 0);
  const planned = (await db().doc('reservations/b1').get()).get('pickupAt') as Timestamp;
  await call(fns.submitHandover, { items: [{ reservationId: 'b1' }] }, STAFF);
  const r = (await db().doc('reservations/b1').get()).data()!;
  assert.equal(r.status, 'active');
  assert.equal(r.lastAction, 'handover');
  assert.equal(r.pickupAt.toMillis(), planned.toMillis());
  assert.equal(r.earlyHandoverPlannedAt, undefined);
});

test('an earlier DAY is refused (changes the booking: new price), staff and owner', async () => {
  await booking('b1', 'confirmed', 7);
  for (const uid of [STAFF, OWNER]) {
    await rejects(call(fns.submitHandover, { items: [{ reservationId: 'b1' }] }, uid), 'failed-precondition', 'earlier-day');
  }
  // An order with one item on a later day is refused as a whole.
  await booking('b2', 'confirmed', 0);
  await rejects(call(fns.submitHandover, { items: [{ reservationId: 'b2' }, { reservationId: 'b1' }] }, STAFF), 'failed-precondition', 'earlier-day');
  assert.equal((await db().doc('reservations/b2').get()).get('status'), 'confirmed');
});

test('earlier time the same day: pickupAt moves to the handover, booked time kept', async () => {
  const planned = Date.now() + 2 * M;
  await at('e1', 'confirmed', planned, planned + D);
  const before = Date.now();
  await call(fns.submitHandover, { items: [{ reservationId: 'e1' }] }, STAFF);
  const r = (await db().doc('reservations/e1').get()).data()!;
  assert.ok(r.pickupAt.toMillis() >= before && r.pickupAt.toMillis() < planned);
  assert.equal(r.earlyHandoverPlannedAt.toMillis(), planned);
  assert.match(r.pickupLabel, /· \d\d:\d\d$/);
});

test('earlier time the same day: refused when someone else needs the unit in between', async () => {
  const planned = Date.now() + 2 * M;
  // Another renter's booking still occupies the unit (its 12 h buffer) until after now.
  await at('other', 'confirmed', Date.now() - 2 * D, Date.now() - 11 * 60 * M);
  await at('e2', 'confirmed', planned, planned + D);
  const err = await call(fns.submitHandover, { items: [{ reservationId: 'e2' }] }, STAFF).catch(e => e);
  assert.equal(err?.details?.code, 'booked-by-someone-else');
  assert.match(String(err?.message), /^Booked by someone else on \d+/);
  assert.deepEqual(err?.details?.conflictIds, ['other']);
  assert.equal((await db().doc('reservations/e2').get()).get('status'), 'confirmed');
  // Order: the 2nd item conflicts → nothing handed over.
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'] });
  await set('products/bed', { name: 'Bed', stockLeft: 1, categories: ['kids'] });
  await booking('ok', 'confirmed', 0);
  await set('reservations/other', { renterId: UID.B, productId: 'bed', productName: 'Bed', status: 'confirmed', quantity: 1,
    pickupAt: Timestamp.fromMillis(Date.now() - 2 * D), returnAt: Timestamp.fromMillis(Date.now() - 11 * 60 * M) });
  await set('reservations/e3', { renterId: UID.A, productId: 'bed', productName: 'Bed', status: 'confirmed', quantity: 1,
    pickupAt: Timestamp.fromMillis(planned), returnAt: Timestamp.fromMillis(planned + D) });
  await rejects(call(fns.submitHandover, { items: [{ reservationId: 'ok' }, { reservationId: 'e3' }] }, STAFF), 'failed-precondition', 'booked-by-someone-else');
  assert.equal((await db().doc('reservations/ok').get()).get('status'), 'confirmed');
});

test('Chicco case: stock 1, one rental already out → no second handover, early or not', async () => {
  await booking('out', 'active', -1);
  await booking('today', 'confirmed', 0);
  for (const id of ['today']) {
    await rejects(call(fns.submitHandover, { items: [{ reservationId: id }] }, STAFF), 'failed-precondition', 'no-unit-on-hand');
    await rejects(call(fns.submitHandover, { items: [{ reservationId: id }] }, OWNER), 'failed-precondition', 'no-unit-on-hand');
    assert.equal((await db().doc(`reservations/${id}`).get()).get('status'), 'confirmed');
  }
});

test('cleaning (pending settlement), repair and lost units are not in the shop', async () => {
  await booking('b2', 'confirmed', 0);
  for (const field of ['pendingSettlementUnits', 'inRepairUnits', 'lostUnits']) {
    await set('products/cot', { name: 'Travel cot', stockLeft: 1, categories: ['kids'], [field]: 1 });
    await rejects(call(fns.submitHandover, { items: [{ reservationId: 'b2' }] }, STAFF), 'failed-precondition', 'no-unit-on-hand');
  }
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'], pendingSettlementUnits: 1 });
  await call(fns.submitHandover, { items: [{ reservationId: 'b2' }] }, STAFF);
});

test('an order needing 2 units with 1 in the shop is refused as a whole', async () => {
  await set('products/cot', { name: 'Travel cot', stockLeft: 2, categories: ['kids'] });
  await booking('o1', 'confirmed', 0);
  await booking('o2', 'confirmed', 0);
  await booking('o3', 'active', -1);
  await rejects(call(fns.submitHandover, { items: [{ reservationId: 'o1' }, { reservationId: 'o2' }] }, STAFF), 'failed-precondition', 'no-unit-on-hand');
  assert.equal((await db().doc('reservations/o1').get()).get('status'), 'confirmed');
});

test('archived rentals don\'t count; state machine still applies', async () => {
  await booking('arch', 'active', -1, { archived: true });
  await booking('b3', 'confirmed', 0, { pickupRefusedOpen: true });
  await rejects(call(fns.submitHandover, { items: [{ reservationId: 'b3' }] }, STAFF), 'failed-precondition', 'not-allowed');
  await call(fns.submitHandover, { items: [{ reservationId: 'b3' }] }, OWNER);   // D2: owner may
  assert.equal((await db().doc('reservations/b3').get()).get('pickupRefusedOpen'), false);
});
