import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { UI, IconCircle } from '@/components/account/ui';
import WhatsAppButton from '@/components/WhatsAppButton';
import type { BookingHold } from '@/lib/bookingHold';

// Explains why new bookings are paused (see lib/bookingHold.ts). Renter-facing: keep the
// copy factual — never mention timing thresholds or any internal tolerance.
export default function BookingHoldNotice({
  hold,
  style,
}: {
  hold: BookingHold;
  style?: StyleProp<ViewStyle>;
}) {
  const overdue     = hold.reasons.includes('overdue');
  const outstanding = hold.reasons.includes('outstanding');
  const noShow      = hold.reasons.includes('noShow');

  const lines: string[] = [];
  if (noShow) {
    lines.push('Your account is on hold after a missed pick-up. Contact us to book again.');
  }
  if (overdue) {
    lines.push('You have a rental that is overdue. Please return it first — you can book again once it has been returned.');
  }
  if (outstanding) {
    lines.push('You have an unpaid balance on a past rental. Please settle it with our team — you can book again once it is cleared.');
  }

  const ids = hold.reservationIds.join(', ');
  const message = overdue
    ? `Hi LANCHAI, I'd like to arrange the return of my overdue rental (reservation ID: ${ids}).`
    : outstanding
    ? `Hi LANCHAI, I'd like to settle the balance on my rental (reservation ID: ${ids}).`
    : `Hi LANCHAI, I missed my pick-up (reservation ID: ${ids}) and I'd like to book again.`;

  // Palette card (no red banner): amber icon circle = action needed, the reason in one
  // clear line per hold, then the WhatsApp row as the action.
  return (
    <View style={[UI.card, s.card, style]}>
      <View style={s.titleRow}>
        <IconCircle icon={{ name: 'pause-circle' }} tone="amber" />
        <Text style={[UI.title, { flex: 1 }]}>New bookings are paused</Text>
      </View>
      {lines.map(line => <Text key={line} style={UI.body}>{line}</Text>)}
      <WhatsAppButton message={message} label="Contact us on WhatsApp" variant="row" style={s.whatsapp} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { alignSelf: 'stretch', padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  whatsapp: { marginTop: 4 },
});
