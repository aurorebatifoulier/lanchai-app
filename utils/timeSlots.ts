// Pickup/return time slots (30-min increments) derived from the shop's opening hours.
// Used by both the single-item booking flow and the bag/multi-item date range picker —
// callers build their list via `getShopTimeSlots(shop)` (lib/shop.ts), never hardcode it.
import { PICKUP_DELAY_MS } from '@/utils/availability';
import { vteToday, vteDayToken, vteHHMM, sameDayToken } from '@/lib/vteTime';
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

// Slots for TODAY (Vientiane) are filtered to (now + PICKUP_DELAY_MS), rounded up to the
// nearest slot increment (30 min) — a renter can't select a time that's already passed or
// too soon to prepare. Same constant as the "Ready within Xh" copy. Days are DAY TOKENS and
// the clock is Vientiane's (lib/vteTime), whatever the phone's timezone. Future dates
// return the full slot list; a buffer that runs past midnight leaves none for today.
export function getAvailableTimeSlots(date: Date | null, slots: string[]): string[] {
  const today = vteToday();
  if (!date || !sameDayToken(date, today)) return slots;
  const buffer = Date.now() + PICKUP_DELAY_MS;
  if (!sameDayToken(vteDayToken(buffer), today)) return [];
  const [h, m] = vteHHMM(buffer).split(':').map(Number);
  const roundedMinutes = Math.ceil((h * 60 + m) / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  const threshold = toHHMM(roundedMinutes);
  return slots.filter(slot => slot >= threshold);
}
