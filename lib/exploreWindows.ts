// Explore quick-chip windows — pure (no Firestore), unit-tested in
// tests/unit/exploreFilters.test.ts. Same booking rule as "Free this weekend": a product
// counts when at least 1 unit is free for the WHOLE window (computeAvailableUnits on
// effectiveStock, handoff buffer included) and it isn't manually set unavailable.
import {
  computeAvailableUnits, effectiveStock, type OccupancyRecord,
} from '@/functions/src/shared/availability';
import { atVteSlot, vteDayToken } from '@/lib/vteTime';

export interface BookingWindow { pickupAt: Date; returnAt: Date; slot: string }

/**
 * "Available now": a 1-day booking from the first pick-up slot left TODAY (2h lead time,
 * via `availableSlots` = getAvailableTimeSlots(day, shop slots)); once today has no slot
 * left, "Available tomorrow" from tomorrow's first slot. Return = same time the next day.
 * Vientiane days, whatever the phone's timezone. null only when the shop has no slots.
 */
export function availableNowWindow(
  now: Date,
  availableSlots: (day: Date) => string[],
): (BookingWindow & { day: 'today' | 'tomorrow' }) | null {
  const today = vteDayToken(now);
  for (const [offset, label] of [[0, 'today'], [1, 'tomorrow']] as const) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const slot = availableSlots(day)[0];
    if (!slot) continue;
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    return { pickupAt: atVteSlot(day, slot), returnAt: atVteSlot(next, slot), slot, day: label };
  }
  return null;
}

/** Units of `product` free for the whole window (manual `available: false` = 0). */
export function freeForWindow(
  product: { available?: boolean; stockLeft: number; inRepairUnits?: number; lostUnits?: number; pendingSettlementUnits?: number },
  occupancy: OccupancyRecord[] | undefined,
  win: { pickupAt: Date; returnAt: Date },
): number {
  if (product.available === false) return 0;
  return computeAvailableUnits(occupancy ?? [], win.pickupAt, win.returnAt, effectiveStock(product));
}
