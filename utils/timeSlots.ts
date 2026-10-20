// Pickup/return time slots (30-min increments) derived from the shop's opening hours.
// Used by both the single-item booking flow and the bag/multi-item date range picker —
// callers build their list via `getShopTimeSlots(shop)` (lib/shop.ts), never hardcode it.
import { PICKUP_DELAY_MS } from '@/utils/availability';
// Slot builders live in functions/src/shared/timeSlots.ts (shared with the
// createReservations callable) — re-exported here so app imports stay unchanged.
import {
  SLOT_STEP_MIN, DEFAULT_OPEN_TIME, DEFAULT_CLOSE_TIME, DEFAULT_LAST_PICKUP_OFFSET_MIN,
  DEFAULT_TIME_SLOTS, parseHHMM, buildTimeSlots, toHHMM,
} from '@/functions/src/shared/timeSlots';
export {
  SLOT_STEP_MIN, DEFAULT_OPEN_TIME, DEFAULT_CLOSE_TIME, DEFAULT_LAST_PICKUP_OFFSET_MIN,
  DEFAULT_TIME_SLOTS, parseHHMM, buildTimeSlots,
};
export { pad } from '@/functions/src/shared/timeSlots';

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Slots for a date that is today are filtered to (now + PICKUP_DELAY_MS), rounded up to
// the nearest slot increment (30 min) — a renter can't select a time that's already
// passed or too soon to prepare. Same constant as the "Ready within Xh" copy shown to
// renters, so the two can never disagree. Future dates return the full slot list.
export function getAvailableTimeSlots(date: Date | null, slots: string[]): string[] {
  if (!date || !sameDay(date, new Date())) return slots;
  const buffer = new Date(Date.now() + PICKUP_DELAY_MS);
  const totalMinutes = buffer.getHours() * 60 + buffer.getMinutes();
  const roundedMinutes = Math.ceil(totalMinutes / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  const threshold = toHHMM(roundedMinutes);
  return slots.filter(slot => slot >= threshold);
}
