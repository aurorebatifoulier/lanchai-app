// Loyalty: points per rental, tier crossing → one coupon per tier, exclusions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loyaltyPointsFor, applyLoyaltyPointsChange, isLoyaltyExcluded, tierForPoints, pointsToNextTier } from '../../functions/src/shared/loyalty';

const cfg = { thresholds: { silver: 100, gold: 300, platinum: 600 }, couponPercentByTier: { silver: 5, gold: 10, platinum: 15 } };

test('1 point per 10,000 LAK of pre-coupon subtotal, floored', () => {
  assert.equal(loyaltyPointsFor(199_999), 19);
  assert.equal(loyaltyPointsFor(0), 0);
  assert.equal(loyaltyPointsFor(null), 0);
});

test('crossing tiers issues each tier coupon once', () => {
  assert.deepEqual(applyLoyaltyPointsChange(90, 20, cfg), { newPoints: 110, newTier: 'silver', crossed: [{ tier: 'silver', percent: 5 }] });
  const jump = applyLoyaltyPointsChange(90, 600, cfg);
  assert.equal(jump.newTier, 'platinum');
  assert.deepEqual(jump.crossed.map(c => c.tier), ['silver', 'gold', 'platinum']);
  assert.deepEqual(applyLoyaltyPointsChange(110, 20, cfg).crossed, []); // already silver
  assert.deepEqual(applyLoyaltyPointsChange(90, 20, null), { newPoints: 110, newTier: 'bronze', crossed: [] });
});

test('tier helpers', () => {
  assert.equal(tierForPoints(299, cfg.thresholds), 'silver');
  assert.equal(pointsToNextTier(250, cfg), 50);
  assert.equal(pointsToNextTier(700, cfg), null);
});

test('business customers and BtoB accounts are excluded', () => {
  assert.ok(isLoyaltyExcluded({ customerType: 'business' }));
  assert.ok(isLoyaltyExcluded({ accountType: 'btob' }));
  assert.ok(!isLoyaltyExcluded({ customerType: 'resident', accountType: 'individual' }));
});
