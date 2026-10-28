import { utcStamp } from './dates';

// "Add to calendar" — the ONE source of the booking calendar events, shared by the
// confirmation email (Google Calendar link + .ics attachment) and the app's booking
// confirmation (.ics file / Google Calendar link). Pure, dependency-free. Times in UTC.

export interface CalendarEvent {
  uid: string;
  title: string;
  startMs: number;
  durationMin: number;
  description: string;
}

export interface CalendarShop { name: string; addressLine: string; city: string }

export interface CalendarLine { id: string; productName: string; pickupAtMs: number; returnAtMs: number }

const location = (shop: CalendarShop) => `${shop.name}, ${shop.addressLine}, ${shop.city}, Laos`;

/** One pick-up + one return event per distinct (pickup, return) pair of the order. */
export function bookingCalendarEvents(items: CalendarLine[], orderId: string): CalendarEvent[] {
  const sorted = [...items].sort((a, b) => a.pickupAtMs - b.pickupAtMs || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const r of sorted) {
    const key = `${r.pickupAtMs}|${r.returnAtMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = items.filter(i => i.pickupAtMs === r.pickupAtMs && i.returnAtMs === r.returnAtMs).map(i => i.productName).join(', ');
    events.push(
      { uid: `${orderId}-${r.pickupAtMs}-pickup`, title: 'LANCHAI pick-up', startMs: r.pickupAtMs, durationMin: 30,
        description: `Pick up: ${names}. Order ${orderId}. Bring your ID and booking QR code.` },
      { uid: `${orderId}-${r.returnAtMs}-return`, title: 'LANCHAI return', startMs: r.returnAtMs, durationMin: 30,
        description: `Return: ${names}. Order ${orderId}.` },
    );
  }
  return events;
}

export function googleCalendarUrl(ev: CalendarEvent, shop: CalendarShop): string {
  const q = [
    ['action', 'TEMPLATE'],
    ['text', ev.title],
    ['dates', `${utcStamp(ev.startMs)}/${utcStamp(ev.startMs + ev.durationMin * 60_000)}`],
    ['details', ev.description],
    ['location', location(shop)],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://calendar.google.com/calendar/render?${q}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** RFC 5545 calendar text with one VEVENT per event. */
export function icsText(events: CalendarEvent[], shop: CalendarShop, nowMs: number = Date.now()): string {
  const now = utcStamp(nowMs);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LANCHAI//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap(ev => [
      'BEGIN:VEVENT',
      `UID:${ev.uid}@lanchai.la`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(ev.startMs)}`,
      `DTEND:${utcStamp(ev.startMs + ev.durationMin * 60_000)}`,
      `SUMMARY:${icsEscape(ev.title)}`,
      `DESCRIPTION:${icsEscape(ev.description)}`,
      `LOCATION:${icsEscape(location(shop))}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');
}
