// submitReturn / refusePickup: the server decides every amount at a staff return; any
// damage holds the deposit and alerts the owners (in-app + email to their OWN address,
// even in email test mode).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { fns, call, rejects, set, db, UID, seedBookingWorld, RATE } from './helpers';
import { sentEmails } from './setup';

const OWNER = 'ownerOooo1';
const STAFF = 'staffSsss1';
const STAFF_OFF = 'staffOff01';
const H = 3_600_000;
const IDS = ['mainItem', 'cleanliness', 'basicUsage', 'power', 'accessories', 'cables', 'protectiveCase', 'storageCase', 'other'];
const cats = (worst: string = 'good') => Object.fromEntries(IDS.map((id, i) => [id, { rating: i === 0 ? worst : 'good' }]));
const photo = (id: string) => `https://firebasestorage.googleapis.com/v0/b/x/o/reservations%2F${id}%2Freturn%2F1.jpg?alt=media`;

async function active(id: string, returnAtMs: number, extra: Record<string, unknown> = {}) {
  await set(`reservations/${id}`, {
    renterId: UID.A, renterName: 'Ann', orderId: 'LNC-1', productId: 'tent', productName: 'Camping tent',
    status: 'active', quantity: 1, pricePerDay: 200_000, deposit: 1_000_000,
    pickupAt: Timestamp.fromMillis(returnAtMs - 48 * H), returnAt: Timestamp.fromMillis(returnAtMs),
    handoverChecklist: { depositCurrency: 'LAK', depositAmount: 1_000_000 },
    ...extra,
  });
}
const item = (id: string, worst = 'good') => ({
  reservationId: id, categories: cats(worst), photos: [photo(id)], clientConfirmedByName: 'Ann', clientConfirmed: true, chargeUnits: 1,
  // Anything that looks like an amount must be ignored by the server.
  chargeAmount: 1, lateChargeAmount: 0, depositReturned: true,
});

beforeEach(async () => {
  await seedBookingWorld();
  await set('config/latePolicy', { graceHours: 2 });
  await set('config/loyalty', { damagedChargePercent: 60 });
  await set('products/tent', { name: 'Camping tent', retailPrice: 100, stockLeft: 1, categories: ['outdoor'] });
  await set(`admins/${OWNER}`, { role: 'owner', active: true, name: 'Olga', email: 'olga@example.com' });
  await set(`admins/${STAFF}`, { role: 'staff', active: true, name: 'Sam' });
  await set(`admins/${STAFF_OFF}`, { role: 'staff', active: false, name: 'Old' });
  sentEmails.length = 0;
});

test('clean return: full deposit back, closed, renter notified', async () => {
  await active('r1', Date.now() + 5 * H);
  const { results } = await call(fns.submitReturn, { items: [item('r1')] }, STAFF);
  assert.equal(results[0].outcome, 'clean');
  const r = (await db().doc('reservations/r1').get()).data()!;
  assert.equal(r.status, 'returned');
  assert.equal(r.depositReturned, true);
  assert.ok(r.returnFinalizedAt);
  assert.equal(r.lateChargeAmount, undefined);
  assert.equal(r.chargeAmount, undefined);
  assert.equal(r.returnChecklist.confirmedByName, 'Sam');
  assert.equal(r.returnedBy.role, 'staff');
  assert.equal((await db().doc('products/tent').get()).get('pendingSettlementUnits'), 1);
  const audit = await db().collection('auditLog').where('reservationId', '==', 'r1').get();
  assert.equal(audit.docs[0].get('byUid'), STAFF);
  assert.equal((await db().collection(`notifications/${UID.A}/items`).get()).size, 2);
});

test('late, no damage: server late fee taken from the deposit, closed; staff can’t change it', async () => {
  await active('r2', Date.now() - 10 * H); // ]grace;24h] → 1 day = 200,000 LAK
  const { results } = await call(fns.submitReturn, { items: [item('r2')] }, STAFF);
  assert.equal(results[0].outcome, 'late');
  assert.equal(results[0].refund, 800_000);
  const r = (await db().doc('reservations/r2').get()).data()!;
  assert.equal(r.lateChargeAmount, 200_000);
  assert.equal(r.depositAppliedToCharge, 200_000);
  assert.equal(r.outstandingBalance, 0);
  assert.equal(r.depositReturned, true);
  assert.ok(r.returnFinalizedAt);
  assert.equal(r.lateChargeWaived, undefined);
});

test('late beyond the deposit: balance stays open unless staff confirm it was paid', async () => {
  await active('r3', Date.now() - 100 * H, { handoverChecklist: { depositCurrency: 'LAK', depositAmount: 100_000 } }); // 2 days = 400,000
  await call(fns.submitReturn, { items: [item('r3')] }, STAFF);
  let r = (await db().doc('reservations/r3').get()).data()!;
  assert.equal(r.outstandingBalance, 300_000);
  assert.equal(r.returnFinalizedAt, undefined);
  await active('r4', Date.now() - 100 * H, { handoverChecklist: { depositCurrency: 'LAK', depositAmount: 100_000 } });
  await call(fns.submitReturn, { items: [item('r4')], collectedBalance: true }, STAFF);
  r = (await db().doc('reservations/r4').get()).data()!;
  assert.equal(r.outstandingSettled, true);
  assert.equal(r.outstandingSettledBy, 'Sam');
  assert.ok(r.returnFinalizedAt);
});

test('damage: suggestion stored, deposit held, owners alerted in-app + email (test mode)', async () => {
  await active('r5', Date.now() + 5 * H);
  const { results } = await call(fns.submitReturn, { items: [item('r5', 'damaged')] }, STAFF);
  assert.equal(results[0].outcome, 'damage');
  const r = (await db().doc('reservations/r5').get()).data()!;
  assert.equal(r.chargeReviewPending, true);
  assert.equal(r.chargeAmount, 0.6 * 100 * RATE); // 60 % × 100 USD → LAK
  assert.equal(r.chargeReason, 'Main item condition — Damaged');
  assert.equal(r.depositReturned, undefined);
  assert.equal(r.returnFinalizedAt, undefined);
  const inbox = await db().collection(`notifications/${OWNER}/items`).get();
  assert.equal(inbox.size, 1);
  assert.equal(inbox.docs[0].get('deepLink'), '/admin/reservations/r5');
  assert.equal((await db().collection(`notifications/${STAFF}/items`).get()).size, 0);
  // config/emailSettings is absent = TEST mode, yet the owner gets it at their own address.
  assert.ok(sentEmails.some(e => e.to === 'olga@example.com' && e.subject.includes('Damage to review')));
});

test('unusable unit → lost stock; refused for deactivated staff, renters, non-active items', async () => {
  await active('r6', Date.now() + 5 * H);
  await call(fns.submitReturn, { items: [item('r6', 'unusable')] }, STAFF);
  assert.equal((await db().doc('products/tent').get()).get('lostUnits'), 1);
  await rejects(call(fns.submitReturn, { items: [item('r6')] }, STAFF), 'failed-precondition', 'not-active');
  await active('r7', Date.now() + 5 * H);
  await rejects(call(fns.submitReturn, { items: [item('r7')] }, STAFF_OFF), 'permission-denied', 'admins-only');
  await rejects(call(fns.submitReturn, { items: [item('r7')] }, UID.A), 'permission-denied', 'admins-only');
  await rejects(call(fns.submitReturn, { items: [{ ...item('r7'), categories: {} }] }, STAFF), 'invalid-argument', 'checklist-incomplete');
  await rejects(call(fns.submitReturn, { items: [{ ...item('r7'), photos: ['https://evil/x.jpg'] }] }, STAFF), 'invalid-argument', 'invalid-photo');
});

test('refusePickup: reason recorded, ID flagged, owners alerted; owner closes it', async () => {
  await set('reservations/p1', { renterId: UID.A, renterName: 'Ann', productName: 'Kayak', status: 'confirmed' });
  await rejects(call(fns.refusePickup, { reservationIds: ['p1'], reason: '' }, STAFF), 'invalid-argument', 'reason-required');
  await call(fns.refusePickup, { reservationIds: ['p1'], reason: 'Photo does not match the person', flagId: true }, STAFF);
  const r = (await db().doc('reservations/p1').get()).data()!;
  assert.equal(r.status, 'confirmed');
  assert.equal(r.pickupRefusedOpen, true);
  assert.equal(r.pickupRefusedByName, 'Sam');
  assert.equal((await db().doc(`identityChecks/${UID.A}`).get()).get('flaggedForReview'), true);
  assert.equal((await db().collection(`notifications/${OWNER}/items`).get()).size, 1);
  await rejects(call(fns.resolveOwnerAlert, { kind: 'pickup', id: 'p1' }, STAFF), 'permission-denied', 'owner-only');
  await call(fns.resolveOwnerAlert, { kind: 'pickup', id: 'p1' }, OWNER);
  await call(fns.resolveOwnerAlert, { kind: 'id', id: UID.A }, OWNER);
  assert.equal((await db().doc('reservations/p1').get()).get('pickupRefusedOpen'), false);
  assert.equal((await db().doc(`identityChecks/${UID.A}`).get()).get('flaggedForReview'), false);
});
