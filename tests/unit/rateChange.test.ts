// Shop settings → Money: a new rate more than 10% away from the current one needs a
// confirmation (utils/rateChange.ts) — a wrong rate under-collects every deposit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsRateConfirm, rateChangePct } from '../../utils/rateChange';

test('the LNC-261023-KW97 rate (~39,700) against 23,000 needs a confirmation', () => {
  assert.ok(needsRateConfirm(23_000, 39_746));
  assert.ok(needsRateConfirm(39_746, 23_000));
  assert.equal(Math.round(rateChangePct(23_000, 39_746)!), 73);
});

test('small changes, first rate and exactly 10% save directly', () => {
  assert.equal(needsRateConfirm(23_000, 23_500), false);
  assert.equal(needsRateConfirm(23_000, 25_300), false); // +10% exactly
  assert.equal(needsRateConfirm(null, 23_000), false);
  assert.equal(needsRateConfirm(undefined, 23_000), false);
});
