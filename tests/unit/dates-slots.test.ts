// Vientiane time (UTC+7, no DST) everywhere, whatever the phone / server timezone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  vteDay, vteTime, vteMinutesOfDay, isPickupMissed, isBeforePickupDay, vteMonthKey, vteIsoDay, vteReservationLabel,
} from '../../functions/src/shared/dates';
import { buildTimeSlots, DEFAULT_TIME_SLOTS, parseHHMM } from '../../functions/src/shared/timeSlots';

// 10:00 on Sat 14 Nov 2026 in Vientiane = 03:00 UTC.
const PICKUP = Date.UTC(2026, 10, 14, 3, 0);

test('Vientiane labels and minutes', () => {
  assert.equal(vteDay(PICKUP), 'Sat 14 Nov');
  assert.equal(vteTime(PICKUP), '10:00');
  assert.equal(vteMinutesOfDay(PICKUP), 600);
  assert.equal(vteReservationLabel(PICKUP), 'Sat, 14 Nov · 10:00');
  // 18:30 UTC on the 14th is already the 15th in Vientiane.
  assert.equal(vteIsoDay(Date.UTC(2026, 10, 14, 18, 30)), '2026-11-15');
  assert.equal(vteMonthKey(Date.UTC(2026, 10, 30, 17, 30)), '2026-12');
});

test('missed pick-up = whole Vientiane day over; early handover = before that day', () => {
  const endOfDay = Date.UTC(2026, 10, 14, 17, 0); // midnight Vientiane
  assert.equal(isPickupMissed(PICKUP, endOfDay - 1), false);
  assert.equal(isPickupMissed(PICKUP, endOfDay), true);
  assert.equal(isBeforePickupDay(PICKUP, Date.UTC(2026, 10, 13, 16, 59)), true);  // 23:59 on the 13th
  assert.equal(isBeforePickupDay(PICKUP, Date.UTC(2026, 10, 13, 17, 0)), false);  // 00:00 on the 14th
});

test('slots from opening hours (30 min, last pick-up offset); bad config → defaults', () => {
  const s = buildTimeSlots('09:00', '12:00', 30);
  assert.deepEqual(s, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
  assert.deepEqual(buildTimeSlots('nope', '12:00', 30), DEFAULT_TIME_SLOTS);
  assert.deepEqual(buildTimeSlots('12:00', '09:00', 30), DEFAULT_TIME_SLOTS);
  assert.equal(parseHHMM('25:00'), null);
});

// The app's day tokens (lib/vteTime.ts) must give the SAME instants whatever the device
// timezone: run the same check in child processes on Paris, New York and Vientiane time.
test('lib/vteTime gives Vientiane instants in any phone timezone', () => {
  const script = path.join(__dirname, 'vte-tz.check.ts');
  for (const tz of ['Europe/Paris', 'America/New_York', 'Asia/Vientiane', 'Pacific/Kiritimati']) {
    const out = execFileSync(process.execPath, ['--import', 'tsx', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim();
    assert.equal(out, 'ok', `TZ=${tz}: ${out}`);
  }
});
