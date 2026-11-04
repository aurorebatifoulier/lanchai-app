// Receipt figures: VAT split reconciles exactly; deposit settlement outcomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitHtVat, vatDisplayPercent, deriveReceiptData, deriveSettlementOutcome } from '../../functions/src/shared/receiptData';

test('HT + VAT === TTC for any amount', () => {
  for (const amt of [1, 999, 110_000, 123_457, 9_999_999]) {
    const s = splitHtVat(amt, 10);
    assert.equal(s.ht + s.vat, amt);
    assert.equal(s.ttc, amt);
  }
  assert.deepEqual(splitHtVat(110_000, 10), { ht: 100_000, vat: 10_000, ttc: 110_000 });
});

test('VAT hidden unless showVat is true', () => {
  assert.equal(vatDisplayPercent(null), null);
  assert.equal(vatDisplayPercent({ showVat: false, vatPercent: 10 }), null);
  assert.equal(vatDisplayPercent({ showVat: true }), 10);
  assert.equal(vatDisplayPercent({ showVat: true, vatPercent: 7 }), 7);
});

test('settlement outcomes', () => {
  const refund = deriveReceiptData({ total: 300_000, deposit: 500_000, depositAppliedToCharge: 100_000 }, null);
  assert.deepEqual(deriveSettlementOutcome({}, refund), { kind: 'owedToClient', amount: 400_000 });
  assert.equal(refund.netInLak, 400_000);
  const owes = deriveReceiptData({ total: 300_000, deposit: 500_000, depositAppliedToCharge: 500_000, outstandingBalance: 200_000 }, null);
  assert.deepEqual(deriveSettlementOutcome({ outstandingSettled: true }, owes), { kind: 'clientOwes', amount: 200_000, resolution: 'settled' });
  const usd = deriveReceiptData({ total: 300_000, deposit: 500_000, handoverChecklist: { depositAmount: 50, depositCurrency: 'USD' } }, null);
  assert.equal(usd.netInLak, null); // never blends LAK with USD
  assert.deepEqual(deriveSettlementOutcome({}, deriveReceiptData({ total: 1, deposit: 0 }, null)), { kind: 'fullySettled' });
});
