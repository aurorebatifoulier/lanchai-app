import { Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { bookingCalendarEvents, googleCalendarUrl, icsText, type CalendarShop } from '@/functions/src/shared/calendar';
import type { RentalDoc } from '@/lib/firestore';

// Booking confirmation "Add to calendar": the SAME events as the confirmation email
// (functions/src/shared/calendar.ts — pick-up + return, 30 min). Writes a .ics to the
// cache and opens the share sheet (pick the calendar app); if sharing isn't available
// or fails, opens the Google Calendar link of the pick-up, like the email button.
export async function addBookingToCalendar(orderLabel: string, reservations: RentalDoc[], shop: CalendarShop): Promise<void> {
  const events = bookingCalendarEvents(
    reservations.map(r => ({ id: r.id, productName: r.productName, pickupAtMs: r.pickupAt.toMillis(), returnAtMs: r.returnAt.toMillis() })),
    orderLabel,
  );
  if (events.length === 0) return;
  try {
    if (await Sharing.isAvailableAsync()) {
      const file = new File(Paths.cache, 'lanchai-booking.ics');
      if (file.exists) file.delete();
      file.create();
      file.write(icsText(events, shop));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: 'Add to calendar' });
      return;
    }
  } catch (err) {
    console.warn('[addBookingToCalendar] .ics share failed, falling back to Google Calendar:', err);
  }
  await Linking.openURL(googleCalendarUrl(events[0], shop)).catch(() => {});
}
