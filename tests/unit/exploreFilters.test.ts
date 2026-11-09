// Explore quick chips: the "Available now" / "Available tomorrow" window and the shared
// whole-window booking rule (lib/exploreWindows.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableNowWindow, freeForWindow } from '../../lib/exploreWindows';
import { filterProducts } from '../../utils/productFilters';

const H = 3_600_000;
const iso = (d: Date) => d.toISOString();
// Fake shop slots per Vientiane day (day tokens are local-midnight Dates → key on the date).
const slotsBy = (byDate: Record<number, string[]>, fallback: string[]) =>
  (day: Date) => byDate[day.getDate()] ?? fallback;
const ALL = ['09:00', '09:30', '10:00', '19:30'];

test('Available now: first slot left today, 1-day window, Vientiane time', () => {
  // Thu 12 Nov 2026, 10:00 Vientiane (03:00 UTC); 2h lead → first slot 12:30.
  const w = availableNowWindow(new Date('2026-11-12T03:00:00Z'), slotsBy({ 12: ['12:30', '13:00'] }, ALL));
  assert.ok(w);
  assert.equal(w.day, 'today');
  assert.equal(w.slot, '12:30');
  assert.equal(iso(w.pickupAt), '2026-11-12T05:30:00.000Z');
  assert.equal(iso(w.returnAt), '2026-11-13T05:30:00.000Z');
});

test('Available tomorrow: no slot left today → tomorrow\'s first slot, same 1-day window', () => {
  // Thu 12 Nov, 20:00 Vientiane: today has no slot left.
  const w = availableNowWindow(new Date('2026-11-12T13:00:00Z'), slotsBy({ 12: [] }, ALL));
  assert.ok(w);
  assert.equal(w.day, 'tomorrow');
  assert.equal(w.slot, '09:00');
  assert.equal(iso(w.pickupAt), '2026-11-13T02:00:00.000Z');
  assert.equal(iso(w.returnAt), '2026-11-14T02:00:00.000Z');
});

test('Available now uses the Vientiane day, not the UTC one', () => {
  // 18:00 UTC on the 12th = 01:00 on Fri 13 in Vientiane → "today" is the 13th.
  const w = availableNowWindow(new Date('2026-11-12T18:00:00Z'), slotsBy({ 12: [] }, ALL));
  assert.ok(w);
  assert.equal(w.day, 'today');
  assert.equal(iso(w.pickupAt), '2026-11-13T02:00:00.000Z');
});

test('Available now: a shop with no slots at all → null (chip disabled)', () => {
  assert.equal(availableNowWindow(new Date('2026-11-12T03:00:00Z'), () => []), null);
});

test('freeForWindow: whole-window booking rule (stock, occupancy + buffer, manual toggle)', () => {
  const win = { pickupAt: new Date('2026-11-12T05:30:00Z'), returnAt: new Date('2026-11-13T05:30:00Z') };
  const start = win.pickupAt.getTime();
  const booked = [{ pickupAt: start - 48 * H, returnAt: start + 2 * H, quantity: 1, reservationId: 'r1' }];
  const p = (stockLeft: number, extra: { available?: boolean; inRepairUnits?: number } = {}) => ({ stockLeft, ...extra });

  assert.equal(freeForWindow(p(1), [], win), 1);
  assert.equal(freeForWindow(p(1), undefined, win), 1);           // no occupancy record
  assert.equal(freeForWindow(p(1), booked, win), 0);              // overlaps the window
  assert.equal(freeForWindow(p(2), booked, win), 1);              // one unit left
  assert.equal(freeForWindow(p(1, { available: false }), [], win), 0);
  assert.equal(freeForWindow(p(1, { inRepairUnits: 1 }), [], win), 0); // effectiveStock
  // Returned 1h before the pick-up: still blocked by the handoff buffer.
  const justBefore = [{ pickupAt: start - 48 * H, returnAt: start - 1 * H, quantity: 1, reservationId: 'r2' }];
  assert.equal(freeForWindow(p(1), justBefore, win), 0);
});

test('filterProducts: category only (price / rating / available-only filters removed)', () => {
  type P = Parameters<typeof filterProducts>[0][number];
  const mk = (id: string, extra: Partial<P>) => ({ id, name: id, available: true, pricePerDay: 1, ...extra }) as P;
  const products = [mk('a', { categories: ['tools'], available: false }), mk('b', { categories: ['kids'] })];
  assert.deepEqual(filterProducts(products, {}).map(p => p.id), ['a', 'b']);
  assert.deepEqual(filterProducts(products, { category: 'tools' }).map(p => p.id), ['a']);
});
