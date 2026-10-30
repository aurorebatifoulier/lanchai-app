// Vientiane (Asia/Vientiane, UTC+7, no DST) date formatting from epoch millis — for
// server-side copy (emails, calendar), since Cloud Functions run in UTC.
const VIENTIANE_OFFSET_MS = 7 * 60 * 60 * 1000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const local = (ms: number) => new Date(ms + VIENTIANE_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, '0');

/** "Fri 24 Oct" */
export function vteDay(ms: number): string {
  const d = local(ms);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "10:00" */
export function vteTime(ms: number): string {
  const d = local(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Fri 24 Oct 10:00" */
export function vteDayTime(ms: number): string {
  return `${vteDay(ms)} ${vteTime(ms)}`;
}

/** Calendar UTC stamp "20261024T030000Z" (Google Calendar links and .ics). */
export function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** End of the local (Vientiane) day containing `ms` — i.e. next local midnight. */
export function vteEndOfDayMs(ms: number): number {
  const d = local(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - VIENTIANE_OFFSET_MS;
}

/**
 * A pickup is "missed" once its whole pick-up day (Vientiane time) is over. This is an
 * ALERT only ("Not picked up"), never a lock: a late pick-up still goes through the
 * normal flow until an admin explicitly marks the reservation as no_show.
 */
export function isPickupMissed(pickupAtMs: number, nowMs: number = Date.now()): boolean {
  return pickupAtMs > 0 && nowMs >= vteEndOfDayMs(pickupAtMs);
}

/** Reservation label "Sat, 24 Oct · 10:00" in Vientiane time (pickupLabel/returnLabel). */
export function vteReservationLabel(ms: number): string {
  const d = local(ms);
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Minutes since local (Vientiane) midnight, and whether `ms` falls on the same local day as `otherMs`. */
export function vteMinutesOfDay(ms: number): number {
  const d = local(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * True while today (Vientiane) is before the pick-up DAY — a handover now is an early
 * handover (allowed after an explicit staff confirmation, recorded on the reservation).
 */
export function isBeforePickupDay(pickupAtMs: number, nowMs: number = Date.now()): boolean {
  return pickupAtMs > 0 && vteEndOfDayMs(nowMs) < vteEndOfDayMs(pickupAtMs);
}

/** Local (Vientiane) month key "2026-10" — products.rentalsByMonth (Home podium). */
export function vteMonthKey(ms: number): string {
  const d = local(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Local (Vientiane) day of the week, 0 = Sunday … 6 = Saturday. */
export function vteWeekday(ms: number): number {
  return local(ms).getUTCDay();
}

/** Local (Vientiane) date stamp "261024" (YYMMDD) — order IDs. */
export function vteDateStamp(ms: number): string {
  const d = local(ms);
  return `${String(d.getUTCFullYear()).slice(-2)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Vientiane calendar day "2026-10-29" (promo code validity, whole local days). */
export function vteIsoDay(ms: number): string {
  const d = local(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** End (exclusive) of the Vientiane day "2026-10-29" in epoch ms. */
export function vteIsoDayEndMs(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number);
  return Date.UTC(y, m - 1, d + 1) - VIENTIANE_OFFSET_MS;
}
