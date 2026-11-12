// Admin "Today" panel counts (lib/adminTodayCounts.ts) — same rules as the calendar day
// screen and lateReturnAlerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countToday } from '../../lib/adminTodayCounts';

const H = 3600_000;
// A Vientiane day: 2026-11-12 00:00 +07:00.
const dayStartMs = Date.UTC(2026, 10, 11, 17);
const dayEndMs = dayStartMs + 24 * H;
const nowMs = dayStartMs + 14 * H; // 14:00

const base = { dayStartMs, dayEndMs, nowMs, pickupDay: [], active: [], idUsers: [], openClaims: 0 };

test('pick-ups today: pending + confirmed in the day; cancelled / active excluded', () => {
  const c = countToday({
    ...base,
    pickupDay: [
      { status: 'pending_payment', pickupAtMs: dayStartMs + 10 * H },
      { status: 'confirmed', pickupAtMs: dayStartMs + 16 * H },
      { status: 'cancelled', pickupAtMs: dayStartMs + 11 * H },
      { status: 'active', pickupAtMs: dayStartMs + 9 * H },
      { status: 'confirmed', pickupAtMs: dayEndMs + H }, // tomorrow
    ],
  });
  assert.equal(c.pickups, 2);
});

test('returns today and late returns from the active rentals', () => {
  const c = countToday({
    ...base,
    active: [
      { status: 'active', returnAtMs: dayStartMs + 18 * H }, // today, later
      { status: 'active', returnAtMs: dayStartMs + 10 * H }, // today, already late
      { status: 'active', returnAtMs: dayStartMs - 30 * H }, // yesterday, late
      { status: 'active', returnAtMs: dayEndMs + 5 * H },    // tomorrow
    ],
  });
  assert.equal(c.returns, 2);
  assert.equal(c.late, 2);
});

test('to check = IDs needing the first-pick-up check + open claims', () => {
  const c = countToday({
    ...base,
    idUsers: [
      { idOnFile: true, idDocVersion: 2, idCheckedVersion: 1 }, // new document → check
      { idOnFile: true, idDocVersion: 1, idCheckedVersion: 1 }, // checked
      { idOnFile: true, idDocVersion: 1 },                      // never checked
    ],
    openClaims: 3,
  });
  assert.equal(c.idChecks, 2);
  assert.equal(c.claims, 3);
  assert.equal(c.toCheck, 5);
});

test('a failed source only blanks its own counters', () => {
  const c = countToday({ ...base, active: null, idUsers: null, openClaims: 1 });
  assert.equal(c.pickups, 0);
  assert.equal(c.returns, null);
  assert.equal(c.late, null);
  assert.equal(c.idChecks, null);
  assert.equal(c.toCheck, 1);
  assert.equal(countToday({ ...base, idUsers: null, openClaims: null }).toCheck, null);
});
