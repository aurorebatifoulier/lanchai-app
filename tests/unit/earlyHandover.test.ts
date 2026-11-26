// Earlier-time handover on the pick-up day: pickupAt moves to the handover, so the extra
// hours [now, planned pick-up) must be free — same rule as createReservations
// (computeAvailableUnits, buffer included). An earlier DAY is refused upstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlyHandoverConflicts, HANDOFF_BUFFER_MS } from '../../functions/src/shared/availability';
import { vteDayRange } from '../../functions/src/shared/dates';

const H = 3_600_000;
const now = Date.parse('2026-11-26T02:00:00Z'); // 09:00 Vientiane
const rec = (reservationId: string, pickupAt: number, returnAt: number, quantity = 1) => ({ reservationId, pickupAt, returnAt, quantity });

test('no conflict: nothing else in the extra hours', () => {
  const items = [rec('me', now + 5 * H, now + 30 * H)];
  assert.deepEqual(earlyHandoverConflicts({ items, others: [rec('later', now + 60 * H, now + 80 * H)], totalStock: 1, nowMs: now }), []);
});

test('not early (on / after the booked time): never checked', () => {
  const items = [rec('me', now - H, now + 30 * H)];
  assert.deepEqual(earlyHandoverConflicts({ items, others: [rec('x', now - 3 * H, now - 2 * H)], totalStock: 1, nowMs: now }), []);
});

test('another booking still holding the unit in between → conflict, earliest first', () => {
  const items = [rec('me', now + 5 * H, now + 30 * H)];
  const others = [rec('b', now + H, now + 3 * H), rec('a', now - 20 * H, now - HANDOFF_BUFFER_MS + H)];
  const res = earlyHandoverConflicts({ items, others, totalStock: 1, nowMs: now });
  assert.equal(res.length, 1);
  assert.deepEqual(res[0].conflicts.map(c => c.reservationId), ['a', 'b']);
  // A second unit in stock → fits.
  assert.equal(earlyHandoverConflicts({ items, others: [others[0]], totalStock: 2, nowMs: now }).length, 0);
});

test('order: two lines of the same product, stock 1 → the early one conflicts with the other line', () => {
  const items = [rec('l1', now + 5 * H, now + 30 * H), rec('l2', now - H, now + 4 * H)];
  const res = earlyHandoverConflicts({ items, others: [], totalStock: 1, nowMs: now });
  assert.deepEqual(res.map(r => r.reservationId), ['l1']);
  assert.deepEqual(earlyHandoverConflicts({ items, others: [], totalStock: 2, nowMs: now }), []);
});

test('day range labels (Vientiane)', () => {
  assert.equal(vteDayRange(Date.parse('2026-11-12T03:00:00Z'), Date.parse('2026-11-14T03:00:00Z')), '12–14 Nov');
  assert.equal(vteDayRange(Date.parse('2026-11-12T03:00:00Z'), Date.parse('2026-11-12T10:00:00Z')), '12 Nov');
  assert.equal(vteDayRange(Date.parse('2026-11-30T03:00:00Z'), Date.parse('2026-12-02T03:00:00Z')), '30 Nov–2 Dec');
  assert.equal(vteDayRange(Date.parse('2026-12-30T03:00:00Z'), Date.parse('2027-01-02T03:00:00Z')), '30 Dec 2026–2 Jan 2027');
  // 23:30 Vientiane on the 13th is still the 13th (UTC 16:30).
  assert.equal(vteDayRange(Date.parse('2026-11-12T03:00:00Z'), Date.parse('2026-11-13T16:30:00Z')), '12–13 Nov');
});
