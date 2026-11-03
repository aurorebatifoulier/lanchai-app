import { vteDay, vteTime, vteReservationLabel } from '@/functions/src/shared/dates';

// Every booking time is Vientiane time (Asia/Vientiane, UTC+7, no DST), whatever the
// phone's timezone — the server validates slots in Vientiane minutes and every email /
// .ics / label is Vientiane. Calendars keep working on DAY TOKENS: local-midnight Dates
// whose year / month / date ARE the Vientiane calendar day. Converting between a token
// and a real instant always goes through these helpers — never setHours / getHours.

const OFF = 7 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const toMs = (d: Date | number) => (typeof d === 'number' ? d : d.getTime());

/** Day token (local midnight) for the Vientiane calendar day of an instant. */
export function vteDayToken(at: Date | number = Date.now()): Date {
  const v = new Date(toMs(at) + OFF);
  return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
}

/** Today in Vientiane, as a day token. */
export const vteToday = (): Date => vteDayToken(Date.now());

/** Token n days after `day` (calendar arithmetic, DST-safe). */
export const addDays = (day: Date, n: number): Date => new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);

/** The instant of Vientiane midnight starting the token's day. */
export function vteDayStart(day: Date): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - OFF);
}

/** [start, end) of the token's Vientiane day as instants. */
export function vteDayRange(day: Date): { start: Date; end: Date } {
  const start = vteDayStart(day);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** The instant of "HH:MM" Vientiane on the token's day. */
export function atVteSlot(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), h, m) - OFF);
}

/** "HH:MM" of an instant, Vientiane time. */
export const vteHHMM = (at: Date | number): string => vteTime(toMs(at));

/** "Sat 14 Nov" of an instant, Vientiane day. */
export const vteDayLabel = (at: Date | number): string => vteDay(toMs(at));

/** "Sat 14 Nov · 10:00" of an instant, Vientiane time. */
export const vteWhen = (at: Date | number): string => `${vteDay(toMs(at))} · ${vteTime(toMs(at))}`;

/** "Sat, 14 Nov · 10:00" — the stored reservation label format. */
export const vteLabel = (at: Date | number): string => vteReservationLabel(toMs(at));

/** True when two tokens are the same calendar day. */
export const sameDayToken = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Is the phone set to Vientiane's offset (UTC+7)? If not, show "Vientiane time". */
export const phoneOnVientianeTime = (): boolean => new Date().getTimezoneOffset() === -420;
