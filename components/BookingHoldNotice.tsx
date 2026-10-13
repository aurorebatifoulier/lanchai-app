import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
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

  const lines: string[] = [];
  if (overdue) {
    lines.push('You have a rental that is overdue. Please return it first — you can book again once it has been returned.');
  }
  if (outstanding) {
    lines.push('You have an unpaid balance on a past rental. Please settle it with our team — you can book again once it is cleared.');
  }

  const ids = hold.reservationIds.join(', ');
  const message = overdue
    ? `Hi LANCHAI, I'd like to arrange the return of my overdue rental (reservation ID: ${ids}).`
    : `Hi LANCHAI, I'd like to settle the balance on my rental (reservation ID: ${ids}).`;

  return (
    <View style={[s.card, style]}>
      <View style={s.titleRow}>
        <Feather name="pause-circle" size={16} color={COLORS.danger} />
        <Text style={s.title}>New bookings are paused</Text>
      </View>
      {lines.map(line => <Text key={line} style={s.body}>{line}</Text>)}
      <WhatsAppButton message={message} label="Contact us on WhatsApp" style={s.whatsapp} />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.carbon },
  body: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19 },
  whatsapp: { marginTop: 4 },
});
