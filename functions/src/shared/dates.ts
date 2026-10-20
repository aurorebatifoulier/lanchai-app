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
