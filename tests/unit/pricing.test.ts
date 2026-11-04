// Money: rental tiers, 24h billing, LAK conversion, deposit per unit, coupons, discounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRateForDays, getEffectiveRate, getMinPrice, billableDaysFromMs, toLak, depositPercentFor,
  depositForLine, priceLine, couponPercentFor, orderDiscount, type PricedProduct,
} from '../../functions/src/shared/pricing';

const H = 3_600_000;
const P: PricedProduct = { pricePerDay: 10, price3to6: 8, price7to13: 6, price14to29: 5, price30plus: 4, deposit: 50 };
const CFG = { depositPercentByType: { business: 100, resident: 50, residentPlatinum: 25, tourist: 100 } };

test('tier rate by duration (1–2 / 3–6 / 7–13 / 14–29 / 30+)', () => {
  assert.deepEqual([1, 2, 3, 6, 7, 13, 14, 29, 30, 90].map(d => getRateForDays(P, d)), [10, 10, 8, 8, 6, 6, 5, 5, 4, 4]);
});

test('effective rate falls back to the next lower priced tier; unpriced = null', () => {
  const gaps = { ...P, price7to13: 0, price14to29: 0 };
  assert.equal(getEffectiveRate(gaps, 20), 8);
  assert.equal(getEffectiveRate({ ...P, pricePerDay: 0, price3to6: 0, price7to13: 0, price14to29: 0, price30plus: 0 }, 5), null);
  assert.equal(getMinPrice(P), 4);
});

test('24h-block billing: exact day = 1, one minute over = 2, never 0', () => {
  assert.equal(billableDaysFromMs(0, 24 * H), 1);
  assert.equal(billableDaysFromMs(0, 24 * H + 60_000), 2);
  assert.equal(billableDaysFromMs(0, H), 1);
  assert.equal(billableDaysFromMs(0, 0), 1);
});

test('USD → LAK rounded to the nearest 1,000', () => {
  assert.equal(toLak(10, 21_650), 217_000);
  assert.equal(toLak(1.04, 21_000), 22_000);
});

test('deposit % by customer type and platinum residents; missing config = 100%', () => {
  assert.equal(depositPercentFor('resident', 'gold', CFG), 50);
  assert.equal(depositPercentFor('resident', 'platinum', CFG), 25);
  assert.equal(depositPercentFor('business', 'platinum', CFG), 100);
  assert.equal(depositPercentFor(undefined, undefined, CFG), 100);
  assert.equal(depositPercentFor('resident', 'gold', null), 100);
});

test('deposit is PER UNIT, rounded first, then × quantity', () => {
  const d = depositForLine(33, 21_650, 50, 3);
  assert.equal(d.depositPerUnit, 357_000); // toLak(33 × 21,650 = 714,450) = 714,000 × 50%
  assert.equal(d.deposit, d.depositPerUnit * 3);
  assert.equal(depositForLine(33, 21_650, 50, 0).deposit, d.depositPerUnit); // quantity ≥ 1
});

test('priceLine freezes days, LAK daily rate, subtotal and the per-unit deposit', () => {
  const line = priceLine({ product: P, pickupAtMs: 0, returnAtMs: 3 * 24 * H, quantity: 2, exchangeRate: 20_000, depositPercent: 100 })!;
  assert.deepEqual(line, { durationDays: 3, pricePerDay: 160_000, subtotal: 960_000, depositPerUnit: 1_000_000, deposit: 2_000_000 });
});

test('coupon % comes from config by tier only; invalid = 0', () => {
  const cfg = { couponPercentByTier: { silver: 5, gold: 10, platinum: 150 } };
  assert.equal(couponPercentFor('gold', cfg), 10);
  assert.equal(couponPercentFor('platinum', cfg), 0); // > 100 refused
  assert.equal(couponPercentFor('bronze', cfg), 0);
  assert.equal(couponPercentFor(null, cfg), 0);
});

test('order discount is prorated and sums exactly', () => {
  const d = orderDiscount([100_000, 200_000, 33_000], 10);
  assert.equal(d.total, 33_300);
  assert.equal(d.perLine.reduce((a, b) => a + b, 0), d.total);
  assert.deepEqual(orderDiscount([100_000], 0), { total: 0, perLine: [0] });
});
