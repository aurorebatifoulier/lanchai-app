// Late returns (Terms §9): grace, inclusive 24 / 48 / 72 h tiers, cap, rounding up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLatePenalty, nextLateThresholdMs, roundUpLak, sanitizeGraceHours } from '../../functions/src/shared/latePenalty';

const H = 3_600_000;
const late = (hours: number, graceHours: unknown = 2, pricePerDay = 150_000, quantity = 1) =>
  computeLatePenalty({ returnAtMs: 0, nowMs: hours * H, pricePerDay, quantity, graceHours });

test('on time and within grace: nothing', () => {
  assert.deepEqual(late(0), { stage: 'onTime', hoursLate: 0, days: 0, amountLak: 0 });
  assert.equal(late(2).stage, 'grace');
  assert.equal(late(2).amountLak, 0);
});

test('tiers with inclusive upper bounds', () => {
  assert.deepEqual([2.01, 24, 24.01, 48, 48.01, 72, 72.01, 500].map(h => [late(h).stage, late(h).days]), [
    ['tier1', 1], ['tier1', 1], ['tier2', 1.5], ['tier2', 1.5], ['tier3', 2], ['tier3', 2], ['nonReturn', 2], ['nonReturn', 2],
  ]);
});

test('amount = rate × days × quantity, rounded UP to 1,000 LAK', () => {
  assert.equal(late(30, 2, 150_000, 1).amountLak, 225_000);
  assert.equal(late(30, 2, 100_500, 3).amountLak, roundUpLak(100_500 * 1.5 * 3));
  assert.equal(roundUpLak(452_250), 453_000);
});

test('bad grace config falls back to 2 h; next threshold never exposes the grace', () => {
  assert.equal(sanitizeGraceHours(-1), 2);
  assert.equal(sanitizeGraceHours('5'), 2);
  assert.equal(sanitizeGraceHours(0), 0);
  assert.equal(nextLateThresholdMs(0, 'tier1'), 24 * H);
  assert.equal(nextLateThresholdMs(0, 'tier3'), 72 * H);
  assert.equal(nextLateThresholdMs(0, 'nonReturn'), null);
  assert.equal(nextLateThresholdMs(0, 'grace'), null);
});
