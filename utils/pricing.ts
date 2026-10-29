import { billableDaysFromMs } from '@/functions/src/shared/pricing';
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

// Formats a Date as "Mon, 7 Jul · 09:00" — matches the pickupLabel/returnLabel format used in reservations.
const _DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function fmtReservationLabel(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${_DOW[d.getDay()]}, ${d.getDate()} ${_MON[d.getMonth()]} · ${h}:${m}`;
}
