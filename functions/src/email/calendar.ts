import { googleCalendarUrl as shopCalendarUrl, icsText, type CalendarEvent } from '../shared/calendar';
import type { EmailShop } from './context';

// "Add to calendar" in emails: an https Google Calendar link (one tap on Android/Gmail)
// plus a small .ics attachment. The events and the formats live in shared/calendar.ts
// (also used by the app's booking confirmation).
export type { CalendarEvent };

export function googleCalendarUrl(ev: CalendarEvent, shop: EmailShop): string {
  return shopCalendarUrl(ev, shop);
}

/** The .ics returned base64 for a Brevo attachment. */
export function icsAttachment(events: CalendarEvent[], shop: EmailShop): { name: string; content: string } {
  return { name: 'lanchai-booking.ics', content: Buffer.from(icsText(events, shop), 'utf8').toString('base64') };
}
