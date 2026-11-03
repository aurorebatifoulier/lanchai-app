import { billableDaysFromMs } from '@/functions/src/shared/pricing';
import { vteReservationLabel } from '@/functions/src/shared/dates';
export function calculateTotalPrice(
  pricePerDay: number,
  startDate: Date,
  endDate: Date,
  quantity: number
): number {
  const days = calculateDays(startDate, endDate);
  return pricePerDay * days * quantity;
}

export function calculateDays(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
}

// ── Tier pricing ─────────────────────────────────────────────────────────────
// Single source in functions/src/shared/pricing.ts — shared with the
// createReservations callable, which recomputes every reservation figure server-side,
// so the previews shown here always match what gets written. Product fields are USD.
export { getRateForDays, getEffectiveRate, getMinPrice, depositForLine } from '@/functions/src/shared/pricing';

// 24h-block billing (shared rule).
export function billableDaysFromDates(pickupAt: Date, returnAt: Date): number {
  return billableDaysFromMs(pickupAt.getTime(), returnAt.getTime());
}

// Formats a Date as "Mon, 7 Jul · 09:00" — the pickupLabel/returnLabel format used in reservations.

/** Vientiane time whatever the phone's timezone — the same label the server stores. */
export function fmtReservationLabel(d: Date): string {
  return vteReservationLabel(d.getTime());
}
