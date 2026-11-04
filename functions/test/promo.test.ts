// validatePromoCode / savePromoCode limits + attempt limiter; adminGrantPromo.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fns, call, rejects, db, set, UID, vteSlot, seedBookingWorld } from './helpers';

const items = [{ productId: 'kayak', pickupAtMs: vteSlot(2), returnAtMs: vteSlot(3), quantity: 1 }];
const check = (uid: string, code: string) => call(fns.validatePromoCode, { code, items }, uid);
const vteIso = (daysAhead: number) => new Date(vteSlot(daysAhead, '12:00') + 7 * 3_600_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await seedBookingWorld();
  await set('promoCodes/SUMMER10', { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 0, discountGivenLak: 0 });
});

describe('validatePromoCode', () => {
  test('valid code → server discount', async () => {
    const r = await check(UID.A, 'summer10');
    assert.equal(r.code, 'SUMMER10');
    assert.equal(r.discountTotal, Math.round(10 * 20_000 * 0.1));
  });
  test('expired / not started (Vientiane days) / exhausted / per renter / first rental / business', async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ validTo: vteIso(-1) }, UID.A, 'expired'],
      [{ validFrom: vteIso(1) }, UID.A, 'not-started'],
      [{ maxUses: 2, usedCount: 2 }, UID.A, 'exhausted'],
      [{ firstRentalOnly: true }, UID.B, 'first-rental-only'],
      [{}, UID.BIZ, 'business-not-allowed'],
    ];
    await set(`reservations/old_1`, { renterId: UID.B, status: 'returned', productId: 'kayak' });
    for (const [over, uid, error] of cases) {
      await set('promoCodes/SUMMER10', { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 0, discountGivenLak: 0, ...over });
      await assert.rejects(check(uid, 'SUMMER10'), (e: { details?: { promoError?: string } }) => e.details?.promoError === error, error);
    }
    await set('promoCodes/SUMMER10/uses/' + UID.A, { count: 1 });
    await set('promoCodes/SUMMER10', { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 1, discountGivenLak: 0 });
    await assert.rejects(check(UID.A, 'SUMMER10'), (e: { details?: { promoError?: string } }) => e.details?.promoError === 'already-used');
  });
  test('10 FAILED tries per hour → blocked; re-checking a valid code is not counted', async () => {
    for (let i = 0; i < 12; i++) await check(UID.B, 'SUMMER10'); // valid: never counted
    for (let i = 0; i < 10; i++) await rejects(check(UID.A, `NOPE${1000 + i}`), 'failed-precondition');
    await assert.rejects(check(UID.A, 'SUMMER10'), (e: { details?: { promoError?: string } }) => e.details?.promoError === 'too-many-attempts');
    await assert.rejects(call(fns.savePromoCode, { code: 'SUMMER10' }, UID.A), (e: { details?: { promoError?: string } }) => e.details?.promoError === 'too-many-attempts');
  });
  test('a personal code does not exist for someone without a grant', async () => {
    await set('promoCodes/VIPONLY', { code: 'VIPONLY', type: 'percent', value: 30, active: true, personal: true, usedCount: 0, discountGivenLak: 0 });
    await assert.rejects(check(UID.A, 'VIPONLY'), (e: { details?: { promoError?: string } }) => e.details?.promoError === 'not-found');
  });
});

describe('adminGrantPromo', () => {
  test('admin grants a code to renters (wallet + notification); renters cannot', async () => {
    await rejects(call(fns.adminGrantPromo, { code: 'SUMMER10', uids: [UID.B] }, UID.A), 'permission-denied');
    const r = await call(fns.adminGrantPromo, { code: 'SUMMER10', uids: [UID.A, UID.B, 'missingUser1'] }, UID.ADMIN);
    assert.deepEqual(r, { granted: 2, skipped: 1 });
    const g = (await db().doc(`promoGrants/SUMMER10_${UID.A}`).get()).data()!;
    assert.equal(g.uid, UID.A);
    assert.equal(g.used, false);
    const notes = await db().collection(`notifications/${UID.A}/items`).get();
    assert.equal(notes.size, 1);
  });
  test('a code already used by the renter is never re-granted', async () => {
    await set(`promoGrants/SUMMER10_${UID.A}`, { uid: UID.A, code: 'SUMMER10', used: true });
    const r = await call(fns.adminGrantPromo, { code: 'SUMMER10', uids: [UID.A] }, UID.ADMIN);
    assert.deepEqual(r, { granted: 0, skipped: 1 });
  });
});
