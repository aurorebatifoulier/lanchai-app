import { vteMinutesOfDay, vteWeekday } from './dates';

// Display defaults for config/shop, used whenever that doc (or a field of it) is
// missing — by the app (lib/shop.ts's SHOP_FALLBACK) and by the emails, so both always
// show the same shop info. Dependency-free (see latePenalty.ts for why it lives here).

// Payment methods shown to renters (emails "What to bring"; editable as
// config/shop.paymentMethods). Kept aligned with Terms §4 (lib/legalContent.ts).
export const DEFAULT_PAYMENT_METHODS = 'Cash (LAK, USD or THB), bank transfer or QR payment';

export const SHOP_DISPLAY_DEFAULTS = {
  name:           'LANCHAI',
  addressLine:    '9 Khouvieng Road, Shop N°43, Beung Khahiong Village, Sisattanak District',
  city:           '01000 Vientiane',
  hours:          'Daily 9:00–20:00',
  whatsappNumber: '',
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

export const CONTACT_EMAIL = 'contact@lanchai.la';

/**
 * "Open daily 9:00–20:00" from the free-text hours ("Daily 9:00–20:00"). Only a
 * leading "Daily"/"Every" is lowercased after "Open" — never a day name like "Mon–Sat".
 */
export function openHoursText(hours: string): string {
  const h = hours.trim();
  return /^(Daily|Every)\b/.test(h) ? `Open ${h.charAt(0).toLowerCase()}${h.slice(1)}` : `Open ${h}`;
}

/** Google Maps link: exact coordinates when set in config/shop, otherwise the address. */
export function mapsUrl(shop: {
  name: string; addressLine: string; city: string; latitude?: number; longitude?: number;
}): string {
  if (shop.latitude != null && shop.longitude != null) {
    return `https://maps.google.com/?q=${shop.latitude},${shop.longitude}`;
  }
  const q = encodeURIComponent(`${shop.name} ${shop.addressLine} ${shop.city} Laos`);
  return `https://maps.google.com/?q=${q}`;
}

/**
 * Live shop status for the Home "Open now" line, in Vientiane time, from config/shop's
 * structured hours (openTime/closeTime "HH:MM") and optional closedDays (0 = Sunday).
 * null when the hours can't be read (the line is then hidden).
 */
export type ShopOpenState =
  | { kind: 'open'; until: string }
  | { kind: 'opensLater'; at: string } // today, before opening
  // Closed now: all day today (closedDays) or past closing time. `next` = the next open
  // day within a week (dayOffset 1 = tomorrow), null if every day is marked closed.
  | { kind: 'closed'; allDay: boolean; next: { at: string; dayOffset: number; weekday: number } | null };

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayName = (d: number) => DOW_NAMES[((d % 7) + 7) % 7];

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : null;
}

export function shopOpenState(
  shop: { openTime: string; closeTime: string; closedDays?: number[] },
  nowMs: number = Date.now(),
): ShopOpenState | null {
  const open = toMinutes(shop.openTime);
  const close = toMinutes(shop.closeTime);
  if (open == null || close == null || close <= open) return null;
  const closed = new Set(shop.closedDays ?? []);
  const today = vteWeekday(nowMs);
  const now = vteMinutesOfDay(nowMs);
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  if (!closed.has(today)) {
    if (now >= open && now < close) return { kind: 'open', until: fmt(close) };
    if (now < open) return { kind: 'opensLater', at: fmt(open) };
  }
  let next: { at: string; dayOffset: number; weekday: number } | null = null;
  for (let offset = 1; offset <= 7 && !next; offset++) {
    if (!closed.has((today + offset) % 7)) next = { at: fmt(open), dayOffset: offset, weekday: (today + offset) % 7 };
  }
  return { kind: 'closed', allDay: closed.has(today), next };
}

/** Default chat auto-reply outside opening hours (config/shop.autoReplyText overrides). */
export const DEFAULT_AUTO_REPLY = 'We’re closed for now. We’ll reply from {open time}.';

/**
 * Closed now → the next opening as text ("9:00", "tomorrow at 9:00", "Monday at 9:00")
 * and a key identifying THIS closed period (one auto-reply per period per conversation).
 * null while open (or when the hours can't be read).
 */
export function closedPeriod(
  shop: { openTime: string; closeTime: string; closedDays?: number[] },
  nowMs: number,
  isoDay: (ms: number) => string,
): { opensText: string; key: string } | null {
  const st = shopOpenState(shop, nowMs);
  if (!st || st.kind === 'open') return null;
  const DAY = 24 * 60 * 60 * 1000;
  if (st.kind === 'opensLater') return { opensText: st.at, key: `${isoDay(nowMs)}T${st.at}` };
  if (!st.next) return { opensText: 'our next opening', key: `${isoDay(nowMs)}Tclosed` };
  const day = isoDay(nowMs + st.next.dayOffset * DAY);
  const opensText = st.next.dayOffset === 1 ? `tomorrow at ${st.next.at}` : `${weekdayName(st.next.weekday)} at ${st.next.at}`;
  return { opensText, key: `${day}T${st.next.at}` };
}
