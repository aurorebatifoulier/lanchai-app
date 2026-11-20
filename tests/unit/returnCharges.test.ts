// Return charges (functions/src/shared/returnCharges.ts) — the ONE computation used by the
// staff return (submitReturn callable) and the return checklist preview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReturnCharges, worstOf, damageReasonText, CHECKLIST_CATEGORY_IDS, type ReturnChargesInput,
} from '../../functions/src/shared/returnCharges';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 17, 5);
const base: ReturnChargesInput = {
  ratings: ['good', 'good'], chargeUnits: 1, quantity: 1, retailPriceUsd: 100, damagedChargePercent: 60,
  depositCurrency: 'LAK', depositHeld: 1_000_000, returnAtMs: NOW + H, nowMs: NOW,
  pricePerDayLak: 200_000, graceHours: 2, usdRate: 20_000, thbRate: 600,
};

test('clean: on time, good / fair → full refund', () => {
  const c = computeReturnCharges({ ...base, ratings: ['good', 'fair'] });
  assert.equal(c.outcome, 'clean');
  assert.equal(c.total, 0);
  assert.equal(c.refund, 1_000_000);
});

test('within the grace period: still clean', () => {
  const c = computeReturnCharges({ ...base, returnAtMs: NOW - 1.5 * H });
  assert.equal(c.outcome, 'clean');
  assert.equal(c.lateAmount, null);
});

test('late, no damage: shared late fee, taken from the deposit', () => {
  const c = computeReturnCharges({ ...base, returnAtMs: NOW - 10 * H }); // 1 day
  assert.equal(c.outcome, 'late');
  assert.equal(c.lateAmount, 200_000);
  assert.equal(c.depositApplied, 200_000);
  assert.equal(c.refund, 800_000);
  assert.equal(c.outstanding, 0);
});

test('late fee above the deposit → outstanding balance', () => {
  const c = computeReturnCharges({ ...base, returnAtMs: NOW - 100 * H, depositHeld: 100_000 }); // 2 days
  assert.equal(c.lateAmount, 400_000);
  assert.equal(c.outstanding, 300_000);
  assert.equal(c.refund, 0);
});

test('damage: % of the replacement value × units, in the deposit currency', () => {
  const c = computeReturnCharges({ ...base, ratings: ['good', 'damaged'], quantity: 3, chargeUnits: 2 });
  assert.equal(c.outcome, 'damage');
  assert.equal(c.damageAmount, 0.6 * 100 * 2 * 20_000);
  const usd = computeReturnCharges({ ...base, ratings: ['unusable'], depositCurrency: 'USD', depositHeld: 50 });
  assert.equal(usd.chargePercent, 100);
  assert.equal(usd.damageAmount, 100);
  assert.equal(usd.outstanding, 50);
});

test('missing retail value or rate → unresolved (owner decides)', () => {
  assert.equal(computeReturnCharges({ ...base, ratings: ['damaged'], retailPriceUsd: null }).unresolved, true);
  assert.equal(computeReturnCharges({ ...base, returnAtMs: NOW - 10 * H, depositCurrency: 'USD', usdRate: null }).unresolved, true);
});

test('units clamped to 1..quantity; worst rating; reason text', () => {
  assert.equal(computeReturnCharges({ ...base, ratings: ['damaged'], chargeUnits: 9, quantity: 2 }).chargeUnits, 2);
  assert.equal(worstOf(['fair', 'unusable', 'damaged']), 'unusable');
  assert.equal(damageReasonText({ mainItem: { rating: 'good' }, cables: { rating: 'damaged' } }, 'damaged'), 'Cables / parts — Damaged');
});

test('category ids = the app checklist categories (lib/firestore.ts)', () => {
  const src = readFileSync(join(__dirname, '../../lib/firestore.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const CHECKLIST_CATEGORIES'), src.indexOf('] as const;', src.indexOf('export const CHECKLIST_CATEGORIES')));
  const ids = [...block.matchAll(/id:\s*'([A-Za-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, [...CHECKLIST_CATEGORY_IDS]);
});

test('LNC-261023-KW97: deposit collected as 74 USD, 2 late days → 31 USD fee, give back 43 (never 128)', async () => {
  const { depositHeldOf } = await import('../../functions/src/shared/returnCharges');
  const r = { deposit: 2_941_200, handoverChecklist: { depositCurrency: 'USD', depositAmount: 74 } };
  const held = depositHeldOf(r, 23_000, 349);
  assert.deepEqual(held, { currency: 'USD', amount: 74, frozen: true }); // not 2,941,200 / 23,000 ≈ 128
  const c = computeReturnCharges({
    ratings: ['good'], chargeUnits: 1, quantity: 1, retailPriceUsd: 100, damagedChargePercent: 60,
    depositCurrency: held.currency, depositHeld: held.amount,
    returnAtMs: Date.parse('2026-10-31T01:30:00Z'), nowMs: Date.parse('2026-11-20T08:50:23Z'),
    pricePerDayLak: 350_000, graceHours: 2, usdRate: 23_000, thbRate: 349,
  });
  assert.equal(c.outcome, 'late');
  assert.equal(c.lateAmountLak, 700_000);
  assert.equal(c.lateAmount, 31);
  assert.equal(c.depositApplied, 31);
  assert.equal(c.refund, 43);
  assert.equal(c.outstanding, 0);
});

test('depositHeldOf: legacy reservation without a frozen amount → converted LAK deposit', async () => {
  const { depositHeldOf } = await import('../../functions/src/shared/returnCharges');
  assert.deepEqual(depositHeldOf({ deposit: 460_000 }, 23_000, null), { currency: 'LAK', amount: 460_000, frozen: false });
  assert.deepEqual(depositHeldOf({ deposit: 460_000, handoverChecklist: { depositCurrency: 'USD' } }, 23_000, null), { currency: 'USD', amount: 20, frozen: false });
});
