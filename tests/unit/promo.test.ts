// Promo codes: status by Vientiane day, limits, scope, minimum, never a free line, grants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePromo, promoStatus, normalizePromoCode, PROMO_CODE_RE, discountOf, orderDiscountOf, type PromoCode, type PromoContext } from '../../functions/src/shared/promo';

const NOW = Date.UTC(2026, 10, 10, 5); // 10 Nov 2026 12:00 Vientiane
const base: PromoCode = { code: 'SUMMER10', type: 'percent', value: 10, active: true };
const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({
  lines: [{ subtotal: 500_000, productId: 'tent', categoryId: 'outdoor' }],
  nowMs: NOW, isBusiness: false, hasPriorBooking: false, usesByRenter: 0, ...over,
});
const err = (code: PromoCode, c = ctx()) => { const r = evaluatePromo(code, c); return r.ok ? 'ok' : r.error; };

test('percent and fixed discounts', () => {
  assert.deepEqual(evaluatePromo(base, ctx()), { ok: true, total: 50_000, perLine: [50_000] });
  const fixed = evaluatePromo({ ...base, type: 'fixed', value: 80_000 }, ctx());
  assert.ok(fixed.ok && fixed.total === 80_000);
});

test('dates are whole Vientiane days, inclusive', () => {
  assert.equal(promoStatus({ ...base, validTo: '2026-11-10' }, NOW), 'active');
  assert.equal(promoStatus({ ...base, validTo: '2026-11-09' }, NOW), 'expired');
  assert.equal(promoStatus({ ...base, validFrom: '2026-11-11' }, NOW), 'scheduled');
  // 23:30 UTC on the 9th = 06:30 on the 10th in Vientiane → valid from the 10th already.
  assert.equal(promoStatus({ ...base, validFrom: '2026-11-10' }, Date.UTC(2026, 10, 9, 23, 30)), 'active');
  assert.equal(err({ ...base, active: false }), 'inactive');
});

test('limits: total, per renter, first rental, business', () => {
  assert.equal(err({ ...base, maxUses: 5, usedCount: 5 }), 'exhausted');
  assert.equal(err(base, ctx({ usesByRenter: 1 })), 'already-used');
  assert.equal(err({ ...base, maxUsesPerRenter: 3 }, ctx({ usesByRenter: 2 })), 'ok');
  assert.equal(err({ ...base, firstRentalOnly: true }, ctx({ hasPriorBooking: true })), 'first-rental-only');
  assert.equal(err(base, ctx({ isBusiness: true })), 'business-not-allowed');
  assert.equal(err({ ...base, businessAllowed: true }, ctx({ isBusiness: true })), 'ok');
});

test('scope + minimum apply to in-scope lines only', () => {
  const c = ctx({ lines: [
    { subtotal: 300_000, productId: 'tent', categoryId: 'outdoor' },
    { subtotal: 700_000, productId: 'drill', categoryId: 'tools' },
  ] });
  const r = evaluatePromo({ ...base, scope: { categoryIds: ['outdoor'] } }, c);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.perLine, [30_000, 0]);
  assert.equal(err({ ...base, scope: { categoryIds: ['kids'] } }, c), 'not-in-scope');
  assert.equal(err({ ...base, scope: { categoryIds: ['outdoor'] }, minRentalLak: 400_000 }, c), 'min-amount');
});

test('a promo never makes a line free (≥ 1,000 LAK left per in-scope line)', () => {
  const r = evaluatePromo({ ...base, type: 'fixed', value: 10_000_000 }, ctx());
  assert.ok(r.ok && r.total === 499_000);
  assert.equal(err({ ...base, type: 'percent', value: 100 }, ctx({ lines: [{ subtotal: 1_000, productId: 'x', categoryId: null }] })), 'not-in-scope');
});

test('personal codes exist only with a grant; grant used / expired / override', () => {
  const personal = { ...base, personal: true };
  assert.equal(err(personal), 'not-found');
  assert.equal(err(personal, ctx({ grant: { used: true, expiresAtMs: null } })), 'already-used');
  assert.equal(err(personal, ctx({ grant: { used: false, expiresAtMs: NOW } })), 'expired');
  const r = evaluatePromo(personal, ctx({ grant: { used: false, expiresAtMs: null, override: { type: 'percent', value: 20 } } }));
  assert.ok(r.ok && r.total === 100_000);
});

test('code format + discount labels (one discount per line)', () => {
  assert.equal(normalizePromoCode(' summer10 '), 'SUMMER10');
  assert.ok(PROMO_CODE_RE.test('SUMMER10') && !PROMO_CODE_RE.test('AB') && !PROMO_CODE_RE.test('A-B-C-D'));
  assert.deepEqual(discountOf({ promoApplied: { code: 'X1Y2', discountAmount: 5000 } }), { label: 'Promo X1Y2', amount: 5000 });
  assert.deepEqual(discountOf({ couponApplied: { percent: 10, discountAmount: 7000 } }), { label: 'Loyalty coupon (10%)', amount: 7000 });
  assert.deepEqual(orderDiscountOf([{ promoApplied: { code: 'X1Y2', discountAmount: 5000 } }, { promoApplied: { code: 'X1Y2', discountAmount: 2000 } }]), { label: 'Promo X1Y2', amount: 7000 });
});
