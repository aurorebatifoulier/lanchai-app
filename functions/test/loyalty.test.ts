// Points are credited ONCE per returned rental, even if the trigger is delivered twice;
// rental count +1 once; excluded accounts get nothing.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fns, fft, db, set, UID, seedBookingWorld } from './helpers';

 
const fire = (fn: any, path: string, before: Record<string, unknown>, after: Record<string, unknown>) => {
  const change = fft.makeChange(
    fft.firestore.makeDocumentSnapshot(before, path),
    fft.firestore.makeDocumentSnapshot(after, path),
  );
  return (fft.wrap(fn) as unknown as (e: unknown) => Promise<unknown>)({ data: change, params: { reservationId: path.split('/')[1] } });
};

const RES = { renterId: UID.A, productId: 'kayak', productName: 'Kayak', subtotal: 450_000, total: 450_000 };

beforeEach(async () => {
  await seedBookingWorld();
  await db().doc(`users/${UID.A}`).update({ loyaltyPoints: 90, loyaltyTier: 'bronze' });
  await set('reservations/r1_1', { ...RES, status: 'returned' });
});

describe('applyLoyaltyPoints', () => {
  test('same event twice (concurrently) → points once, one history entry, one coupon', async () => {
    await Promise.all([
      fire(fns.applyLoyaltyPoints, 'reservations/r1_1', { ...RES, status: 'active' }, { ...RES, status: 'returned' }),
      fire(fns.applyLoyaltyPoints, 'reservations/r1_1', { ...RES, status: 'active' }, { ...RES, status: 'returned' }),
    ]);
    await fire(fns.applyLoyaltyPoints, 'reservations/r1_1', { ...RES, status: 'active' }, { ...RES, status: 'returned' });
    const user = (await db().doc(`users/${UID.A}`).get()).data()!;
    assert.equal(user.loyaltyPoints, 90 + 45);
    assert.equal(user.loyaltyTier, 'silver');
    assert.equal((user.coupons as unknown[]).filter((c: unknown) => (c as { tier: string }).tier === 'silver').length, 2); // seed coupon + the new one
    const history = await db().collection(`users/${UID.A}/loyaltyHistory`).get();
    assert.equal(history.size, 1);
    assert.equal((await db().doc('reservations/r1_1').get()).get('loyaltyApplied'), true);
  });
  test('business accounts earn nothing', async () => {
    await set('reservations/r2_1', { ...RES, renterId: UID.BIZ, status: 'returned' });
    await fire(fns.applyLoyaltyPoints, 'reservations/r2_1', { ...RES, renterId: UID.BIZ, status: 'active' }, { ...RES, renterId: UID.BIZ, status: 'returned' });
    assert.equal((await db().doc(`users/${UID.BIZ}`).get()).get('loyaltyPoints'), undefined);
  });
});

describe('applyRentalCount', () => {
  test('rental count +1 once even when delivered twice', async () => {
    await set('products/kayak', { rentalCount: 4 });
    await Promise.all([
      fire(fns.applyRentalCount, 'reservations/r1_1', { ...RES, status: 'active' }, { ...RES, status: 'returned' }),
      fire(fns.applyRentalCount, 'reservations/r1_1', { ...RES, status: 'active' }, { ...RES, status: 'returned' }),
    ]);
    assert.equal((await db().doc('products/kayak').get()).get('rentalCount'), 5);
  });
});
