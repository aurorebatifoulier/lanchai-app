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
const SIG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1 L9 9"/></svg>';
const item = (id: string, worst = 'good', photos = true) => ({
  reservationId: id, categories: cats(worst), photos: photos ? [photo(id)] : [], chargeUnits: 1,
  // Anything that looks like an amount must be ignored by the server.
  chargeAmount: 1, lateChargeAmount: 0, depositReturned: true,
});
type Settlement = 'refund' | 'collected' | 'open' | 'review';
/** The app flow: Settlement step (quoteReturn) → Client confirms (submitReturn). */
async function returnFlow(uid: string, items: ReturnType<typeof item>[], pick?: (q: any) => Settlement, adjustments: Record<string, unknown> = {}) {
  const quote = await call(fns.quoteReturn, { items, adjustments }, uid);
  const settlement: Settlement = pick ? pick(quote) : quote.result === 'refund' ? 'refund' : quote.result === 'collect' ? 'collected' : 'review';
  await call(fns.submitReturn, {
    items, adjustments, settlement, clientSignatureSvg: SIG,
    quote: { result: quote.result, refund: quote.refund, collect: quote.collect },
  }, uid);
  return quote;
}

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

test('clean return: quote = full refund; confirm → settled, signed, recorded by staff', async () => {
  await active('r1', Date.now() + 5 * H);
  const q = await returnFlow(STAFF, [item('r1')]);
  assert.equal(q.result, 'refund');
  assert.equal(q.refund, 1_000_000);
  const r = (await db().doc('reservations/r1').get()).data()!;
  assert.equal(r.status, 'returned');
  assert.equal(r.depositReturned, true);
  assert.ok(r.returnFinalizedAt);
  assert.equal(r.returnChecklist.confirmedByName, 'Sam');
  assert.equal(r.returnChecklist.confirmedByRole, 'staff');
  assert.equal(r.returnChecklist.clientSigned, true);
  assert.equal(r.returnChecklist.clientConfirmedByName, undefined);
  assert.equal((await db().doc('products/tent').get()).get('pendingSettlementUnits'), 1);
  assert.equal((await db().collection(`notifications/${UID.A}/items`).get()).size, 2);
});

test('LNC-261023-KW97 case: USD deposit received = 74 (frozen), 2 late days → 31 fee, give back 43', async () => {
  await set('config/pricing', { exchangeRate: 23_000 });
  await active('kw', Date.now() - 100 * H, {
    deposit: 2_941_200, pricePerDay: 350_000, handoverChecklist: { depositCurrency: 'USD', depositAmount: 74 },
  });
  const q = await returnFlow(STAFF, [item('kw')]);
  assert.equal(q.currency, 'USD');
  assert.equal(q.depositHeld, 74);            // never 2,941,200 / 23,000 ≈ 128
  assert.equal(q.lines[0].late, 31);
  assert.equal(q.lines[0].lateDays, 2);
  assert.equal(q.refund, 43);
  const r = (await db().doc('reservations/kw').get()).data()!;
  assert.equal(r.lateChargeAmount, 31);
  assert.equal(r.depositAppliedToCharge, 31);
  assert.equal(r.returnChecklist.depositAmount, 74);
});

test('late beyond the deposit: collect → settled; or leave the balance open', async () => {
  await active('r3', Date.now() - 100 * H, { handoverChecklist: { depositCurrency: 'LAK', depositAmount: 100_000 } });
  const q = await returnFlow(STAFF, [item('r3')], () => 'open');
  assert.equal(q.result, 'collect');
  assert.equal(q.collect, 300_000);
  let r = (await db().doc('reservations/r3').get()).data()!;
  assert.equal(r.outstandingBalance, 300_000);
  assert.equal(r.returnFinalizedAt, undefined);
  await active('r4', Date.now() - 100 * H, { handoverChecklist: { depositCurrency: 'LAK', depositAmount: 100_000 } });
  await returnFlow(STAFF, [item('r4')]);
  r = (await db().doc('reservations/r4').get()).data()!;
  assert.equal(r.outstandingSettled, true);
  assert.ok(r.returnFinalizedAt);
});

test('staff damage: review, deposit held, owners alerted in-app + email (test mode)', async () => {
  await active('r5', Date.now() + 5 * H);
  const q = await returnFlow(STAFF, [item('r5', 'damaged')]);
  assert.equal(q.result, 'review');
  const r = (await db().doc('reservations/r5').get()).data()!;
  assert.equal(r.chargeReviewPending, true);
  assert.equal(r.chargeAmount, 0.6 * 100 * RATE);
  assert.equal(r.returnFinalizedAt, undefined);
  assert.equal((await db().collection(`notifications/${OWNER}/items`).get()).size, 1);
  assert.ok(sentEmails.some(e => e.to === 'olga@example.com' && e.subject.includes('Damage to review')));
});

test('owner decides on the Settlement step: lower the damage, waive the late fee → settled', async () => {
  await active('o1', Date.now() - 10 * H);
  const q = await returnFlow(OWNER, [item('o1', 'damaged')], undefined, { o1: { waiveLate: true, damageAmount: 100_000 } });
  assert.equal(q.result, 'refund');
  assert.equal(q.refund, 900_000);
  const r = (await db().doc('reservations/o1').get()).data()!;
  assert.equal(r.chargeAmount, 100_000);
  assert.equal(r.damageChargeSuggested, 0.6 * 100 * RATE);
  assert.equal(r.lateChargeWaived, true);
  assert.equal(r.lateChargeAmount, undefined);
  assert.equal(r.chargeReviewPending, undefined);
  assert.ok(r.returnFinalizedAt);
  // Never above the suggestion: an owner amount over it falls back to the suggestion.
  await active('o2', Date.now() + 5 * H);
  const q2 = await call(fns.quoteReturn, { items: [item('o2', 'damaged')], adjustments: { o2: { damageAmount: 99_999_999 } } }, OWNER);
  assert.equal(q2.lines[0].damage, 0.6 * 100 * RATE);
});

test('refusals: staff adjustments, changed quote, missing photos / signature, mixed currencies', async () => {
  await active('x1', Date.now() + 5 * H);
  await rejects(call(fns.quoteReturn, { items: [item('x1')], adjustments: { x1: { waiveLate: true } } }, STAFF), 'invalid-argument', 'owner-only');
  await rejects(call(fns.submitReturn, {
    items: [item('x1')], settlement: 'refund', clientSignatureSvg: SIG, quote: { result: 'refund', refund: 1, collect: 0 },
  }, STAFF), 'failed-precondition', 'quote-changed');
  await rejects(call(fns.submitReturn, {
    items: [item('x1', 'damaged', false)], settlement: 'review', clientSignatureSvg: SIG, quote: { result: 'review', refund: 0, collect: 0 },
  }, STAFF), 'invalid-argument', 'photos-required');
  await rejects(call(fns.submitReturn, {
    items: [item('x1')], settlement: 'refund', clientSignatureSvg: '', quote: { result: 'refund', refund: 1_000_000, collect: 0 },
  }, STAFF), 'invalid-argument', 'signature-required');
  await active('x2', Date.now() + 5 * H, { handoverChecklist: { depositCurrency: 'USD', depositAmount: 50 } });
  await rejects(call(fns.quoteReturn, { items: [item('x1'), item('x2')] }, STAFF), 'invalid-argument', 'mixed-currencies');
  assert.equal((await db().doc('reservations/x1').get()).get('status'), 'active');
});

test('a whole order: one settlement, one line per item', async () => {
  await active('m1', Date.now() + 5 * H);
  await active('m2', Date.now() - 10 * H); // 1 day = 200,000
  const q = await returnFlow(STAFF, [item('m1'), item('m2')]);
  assert.equal(q.lines.length, 2);
  assert.equal(q.depositHeld, 2_000_000);
  assert.equal(q.charges, 200_000);
  assert.equal(q.refund, 1_800_000);
  for (const id of ['m1', 'm2']) assert.ok((await db().doc(`reservations/${id}`).get()).get('returnFinalizedAt'));
});

test('unusable unit → lost stock; refused for deactivated staff, renters, items not out', async () => {
  await active('r6', Date.now() + 5 * H);
  await returnFlow(OWNER, [item('r6', 'unusable')]);
  assert.equal((await db().doc('products/tent').get()).get('lostUnits'), 1);
  await rejects(call(fns.quoteReturn, { items: [item('r6')] }, STAFF), 'failed-precondition', 'not-active');
  await active('r7', Date.now() + 5 * H);
  await rejects(call(fns.quoteReturn, { items: [item('r7')] }, STAFF_OFF), 'permission-denied', 'admins-only');
  await rejects(call(fns.quoteReturn, { items: [item('r7')] }, UID.A), 'permission-denied', 'admins-only');
  await rejects(call(fns.quoteReturn, { items: [{ ...item('r7'), categories: {} }] }, STAFF), 'invalid-argument', 'checklist-incomplete');
  await rejects(call(fns.quoteReturn, { items: [{ ...item('r7'), photos: ['https://evil/x.jpg'] }] }, STAFF), 'invalid-argument', 'invalid-photo');
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
