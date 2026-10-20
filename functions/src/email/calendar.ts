import { utcStamp } from '../shared/dates';
import type { EmailShop } from './context';

// "Add to calendar": an https Google Calendar link (one tap on Android/Gmail) plus a
// small .ics attachment (Apple Mail, Outlook, Gmail all recognise it). Times in UTC.

export interface CalendarEvent {
  uid: string;
  title: string;
  startMs: number;
  durationMin: number;
  description: string;
}

const location = (shop: EmailShop) => `${shop.name}, ${shop.addressLine}, ${shop.city}, Laos`;

export function googleCalendarUrl(ev: CalendarEvent, shop: EmailShop): string {
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     ev.title,
    dates:    `${utcStamp(ev.startMs)}/${utcStamp(ev.startMs + ev.durationMin * 60_000)}`,
    details:  ev.description,
    location: location(shop),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** RFC 5545 calendar with one VEVENT per event — returned base64 for a Brevo attachment. */
export function icsAttachment(events: CalendarEvent[], shop: EmailShop): { name: string; content: string } {
  const now = utcStamp(Date.now());
  const lines = [
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
  ];
  return { name: 'lanchai-booking.ics', content: Buffer.from(lines.join('\r\n'), 'utf8').toString('base64') };
}
