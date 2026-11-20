// submitHandover: a unit must be PHYSICALLY in the shop — stock − out with renters
// (early handovers included) − repair − lost − pending settlement / cleaning — checked in
// the state-machine transaction. The Chicco case: stock 1, a rental already out → refused.
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

test('the unit is in the shop → handed over (marked early when before the pick-up day)', async () => {
  await booking('b1', 'confirmed', 7);
  await call(fns.submitHandover, { items: [{ reservationId: 'b1' }] }, STAFF);
  const r = (await db().doc('reservations/b1').get()).data()!;
  assert.equal(r.status, 'active');
  assert.equal(r.earlyHandover, true);
  assert.equal(r.lastAction, 'handover');
});

test('Chicco case: stock 1, one rental already out → no second handover, early or not', async () => {
  await booking('out', 'active', -1);
  await booking('next', 'confirmed', 6);   // a later booking handed over early
  await booking('today', 'confirmed', 0);
  for (const id of ['next', 'today']) {
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
