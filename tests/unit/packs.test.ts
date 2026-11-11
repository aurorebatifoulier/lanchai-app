// Bookable packs (functions/src/shared/packs.ts) + the shared discount label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  packOf, packDiscount, bestPackFor, isPackActive, packCancelImpact, clampPackPct,
  type Pack, type PackLine, type OrderLineForPack,
} from '../../functions/src/shared/packs';
import { discountOf, orderDiscountOf } from '../../functions/src/shared/promo';
import { priceLine } from '../../functions/src/shared/pricing';

const NOW = Date.parse('2026-11-12T03:00:00Z');
const P = Date.parse('2026-11-14T03:00:00Z');
const R = Date.parse('2026-11-15T03:00:00Z');
const pack = (extra: Record<string, unknown> = {}): Pack => packOf('karaoke', {
  title: 'Karaoke night', isPack: true, published: true, packDiscountPct: 10,
  items: [{ productId: 'mic', qty: 2 }, { productId: 'speaker', qty: 1 }], ...extra,
});
const line = (productId: string, quantity: number, subtotal: number, extra: Partial<PackLine> = {}): PackLine =>
  ({ productId, quantity, subtotal, pickupAtMs: P, returnAtMs: R, ...extra });

test('applies: every item, same dates, full quantities → % of the rental only', () => {
  const r = packDiscount(pack(), [line('mic', 2, 100_000), line('speaker', 1, 200_000)], NOW);
  assert.deepEqual(r, { ok: true, total: 30_000, perLine: [10_000, 20_000] });
});

test('does not apply: missing item / different dates / quantity short / inactive', () => {
  assert.deepEqual(packDiscount(pack(), [line('mic', 2, 100_000)], NOW), { ok: false, error: 'missing-item' });
  assert.deepEqual(
    packDiscount(pack(), [line('mic', 2, 100_000), line('speaker', 1, 200_000, { returnAtMs: R + 3_600_000 })], NOW),
    { ok: false, error: 'different-dates' });
  assert.deepEqual(packDiscount(pack(), [line('mic', 1, 50_000), line('speaker', 1, 200_000)], NOW), { ok: false, error: 'quantity' });
  assert.deepEqual(packDiscount(pack({ published: false }), [line('mic', 2, 1), line('speaker', 1, 1)], NOW), { ok: false, error: 'inactive' });
  assert.deepEqual(packDiscount(pack({ isPack: false }), [line('mic', 2, 1), line('speaker', 1, 1)], NOW), { ok: false, error: 'inactive' });
});

test('seasonal window: whole Vientiane days', () => {
  const p = pack({ activeFrom: Date.parse('2026-11-13T10:00:00Z'), activeTo: Date.parse('2026-11-20T10:00:00Z') });
  assert.equal(isPackActive(p, NOW), false);                                   // 12 Nov
  assert.equal(isPackActive(p, Date.parse('2026-11-12T17:30:00Z')), true);      // 13 Nov 00:30 VTE
  assert.equal(isPackActive(p, Date.parse('2026-11-20T16:59:00Z')), true);      // 20 Nov 23:59 VTE
  assert.equal(isPackActive(p, Date.parse('2026-11-20T17:00:00Z')), false);
});

test('only the pack quantity is discounted; other lines stay at full price', () => {
  // 3 mics booked (pack needs 2), plus an unrelated tent.
  const r = packDiscount(pack(), [line('mic', 3, 150_000), line('speaker', 1, 200_000), line('tent', 1, 80_000)], NOW);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.total, 30_000);              // (100,000 + 200,000) × 10%
    assert.deepEqual(r.perLine, [10_000, 20_000, 0]);
  }
});

test('the window that holds every item wins (one item also booked on other dates)', () => {
  const lines = [line('speaker', 1, 200_000, { pickupAtMs: P + 86_400_000, returnAtMs: R + 86_400_000 }),
    line('mic', 2, 100_000), line('speaker', 1, 200_000)];
  const r = packDiscount(pack(), lines, NOW);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.perLine, [0, 10_000, 20_000]);
});

test('percent clamped to 0–30, default 5; duplicate items merged', () => {
  assert.equal(clampPackPct(undefined), 5);
  assert.equal(clampPackPct(80), 30);
  assert.equal(clampPackPct(-3), 0);
  const p = packOf('x', { isPack: true, items: [{ productId: 'a', qty: 1 }, { productId: 'a', qty: 2 }, { productId: '', qty: 1 }] });
  assert.deepEqual(p.items, [{ productId: 'a', qty: 3 }]);
  assert.deepEqual(packDiscount(pack({ packDiscountPct: 0 }), [line('mic', 2, 100_000), line('speaker', 1, 200_000)], NOW),
    { ok: false, error: 'no-discount' });
});

test('best complete pack is chosen when several match', () => {
  const small = pack({ packDiscountPct: 5 });
  const big = { ...pack({ packDiscountPct: 15 }), id: 'big' };
  const best = bestPackFor([small, big], [line('mic', 2, 100_000), line('speaker', 1, 200_000)], NOW);
  assert.equal(best?.pack.id, 'big');
  assert.equal(best?.total, 45_000);
});

test('deposits are never discounted (same per-unit deposit with or without a pack)', () => {
  const product = { pricePerDay: 10, price3to6: 10, price7to13: 10, price14to29: 10, price30plus: 10, deposit: 100 };
  const a = priceLine({ product, pickupAtMs: P, returnAtMs: R, quantity: 2, exchangeRate: 20_000, depositPercent: 100 });
  assert.ok(a);
  const r = packDiscount(pack(), [line('mic', 2, a!.subtotal), line('speaker', 1, 200_000)], NOW);
  assert.ok(r.ok);
  // The pack only changes the rental total; the deposit stays priceLine's.
  assert.equal(a!.deposit, 2 * 2_000_000);
});

test('discountOf: pack label, removed pack ignored, one label per order', () => {
  const pa = { packId: 'karaoke', title: 'Karaoke night', percent: 5, discountAmount: 5_000 };
  assert.deepEqual(discountOf({ packApplied: pa }), { label: 'Pack Karaoke night (5%)', amount: 5_000 });
  assert.equal(discountOf({ packApplied: { ...pa, removedAt: 123 } }), null);
  assert.deepEqual(orderDiscountOf([{ packApplied: pa }, { packApplied: { ...pa, discountAmount: 3_000 } }]),
    { label: 'Pack Karaoke night (5%)', amount: 8_000 });
});

test('packCancelImpact: one item cancelled → the others back to full price; whole pack → null', () => {
  const pa = { packId: 'karaoke', title: 'Karaoke night', percent: 5, discountAmount: 5_000 };
  const lines: OrderLineForPack[] = [
    { id: 'o_1', status: 'confirmed', subtotal: 100_000, total: 95_000, packApplied: pa },
    { id: 'o_2', status: 'pending_payment', subtotal: 200_000, total: 190_000, packApplied: { ...pa, discountAmount: 10_000 } },
    { id: 'o_3', status: 'confirmed', subtotal: 60_000, total: 57_000, packApplied: { ...pa, discountAmount: 3_000 } },
    { id: 'o_4', status: 'confirmed', subtotal: 50_000, total: 50_000 }, // not in the pack
  ];
  assert.deepEqual(packCancelImpact(lines, ['o_1']), {
    packId: 'karaoke', packTitle: 'Karaoke night', lineIds: ['o_2', 'o_3'], before: 247_000, after: 260_000,
  });
  assert.equal(packCancelImpact(lines, ['o_1', 'o_2', 'o_3']), null);
  assert.equal(packCancelImpact(lines, ['o_4']), null);
  // Already-active or cancelled lines are left as they are.
  const mixed = lines.map(l => (l.id === 'o_2' ? { ...l, status: 'active' } : l.id === 'o_3' ? { ...l, status: 'cancelled' } : l));
  assert.equal(packCancelImpact(mixed, ['o_1']), null);
});
