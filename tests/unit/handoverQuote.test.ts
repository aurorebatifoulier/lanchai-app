// Pick-up payment quote (functions/src/shared/handoverQuote.ts): the figures frozen at
// booking, converted (rounded up) per currency, prorated so lines add up exactly; the
// rental and the deposit may be paid in different currencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHandoverQuote, collectFor, prorate, parsePickupPayment, rentalPaymentMethodKey, paymentPartLabel, paymentMethodName,
} from '../../functions/src/shared/handoverQuote';

const rates = { USD: { rate: 23_000, setAtMs: 1 }, THB: { rate: null, setAtMs: null } };

test('one line: subtotal, coupon, rental to pay, deposit — LAK and USD (rounded up)', () => {
  const q = buildHandoverQuote([{
    reservationId: 'a', productName: 'Tent', quantity: 1, subtotal: 1_100_000, total: 990_000, deposit: 4_600_000,
    couponApplied: { percent: 10, discountAmount: 110_000 },
  }], rates);
  assert.equal(q.rentalSubtotalLak, 1_100_000);
  assert.deepEqual(q.discount, { label: 'Loyalty coupon (10%)', amount: 110_000 });
  assert.equal(q.rentalLak, 990_000);
  assert.equal(q.depositLak, 4_600_000);
  assert.equal(q.currencies.LAK!.rental, 990_000);
  assert.equal(q.currencies.USD!.rental, 44);   // 43.04 → 44
  assert.equal(q.currencies.USD!.deposit, 200);
  assert.equal(q.currencies.THB, undefined);    // no rate → not offered
});

test('a removed pack price no longer counts; promo and pack labels', () => {
  const q = buildHandoverQuote([
    { reservationId: 'a', subtotal: 100_000, total: 100_000, deposit: 0, packApplied: { title: 'Camp', percent: 5, discountAmount: 5_000, removedAt: 1 } },
    { reservationId: 'b', subtotal: 200_000, total: 190_000, deposit: 0, promoApplied: { code: 'HELLO', discountAmount: 10_000 } },
  ], rates);
  assert.equal(q.discount?.amount, 10_000);
  assert.match(q.discount!.label, /HELLO/);
  assert.equal(q.lines[0].discount, null);
});

test('an order of 2: the order total is converted once, then prorated (sums exactly)', () => {
  const q = buildHandoverQuote([
    { reservationId: 'a', total: 100_000, deposit: 300_000 },
    { reservationId: 'b', total: 50_000, deposit: 200_000 },
  ], rates);
  const usd = q.currencies.USD!;
  assert.equal(usd.deposit, Math.ceil(500_000 / 23_000)); // 22
  assert.equal(Math.round((usd.depositPerLine[0] + usd.depositPerLine[1]) * 100) / 100, usd.deposit);
  assert.equal(usd.rentalPerLine.reduce((s, v) => s + v, 0), usd.rental);
  assert.deepEqual(q.currencies.LAK!.depositPerLine, [300_000, 200_000]);
  assert.deepEqual(prorate([1, 1, 1], 10, 0), [3, 3, 4]);
});

test('rental and deposit in different currencies', () => {
  const q = buildHandoverQuote([{ reservationId: 'a', total: 1_100_000, deposit: 4_600_000 }], rates);
  const pay = parsePickupPayment({ rental: { currency: 'LAK', method: 'qr' }, deposit: { currency: 'USD', method: 'cash' } })!;
  assert.deepEqual(collectFor(q, pay), { rental: 1_100_000, deposit: 200 });
  assert.equal(collectFor(q, { rental: { currency: 'THB', method: 'cash' }, deposit: pay.deposit }), null);
  assert.equal(parsePickupPayment({ rental: { currency: 'EUR', method: 'cash' }, deposit: pay.deposit }), null);
  assert.equal(rentalPaymentMethodKey({ currency: 'USD', method: 'cash' }), 'cash_usd');
  assert.equal(rentalPaymentMethodKey({ currency: 'LAK', method: 'qr' }), 'qr');
  assert.equal(paymentPartLabel({ currency: 'USD', method: 'cash' }), 'Cash · USD');
  assert.equal(paymentPartLabel({ currency: 'LAK', method: 'qr' }), 'QR · LAK');
  assert.equal(paymentPartLabel({ currency: 'LAK', method: 'bank_transfer' }), 'Bank transfer · LAK');
  assert.equal(paymentMethodName('bank_transfer'), 'Bank transfer');
  assert.equal(paymentMethodName('cash'), 'Cash');
  assert.equal(paymentMethodName('qr'), 'QR');
});
