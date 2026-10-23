import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PRE_PICKUP_STATUSES } from '@/functions/src/shared/identity';

// "First rental — check ID" (admin only): the renter's current ID document hasn't been
// checked in person yet (or they'll show it at the shop). Set server-side on upcoming
// pick-ups (reservation.firstRentalIdCheck — functions/src/identity.ts) and cleared once
// staff complete the ID check in the pick-up checklist.
export function showsFirstRentalIdCheck(r: { firstRentalIdCheck?: boolean; status?: string } | null | undefined): boolean {
  return r?.firstRentalIdCheck === true && (PRE_PICKUP_STATUSES as readonly string[]).includes(r.status ?? '');
}

export function FirstRentalIdChip({ atCounter }: { atCounter?: boolean }) {
  return (
    <View style={s.chip}>
      <Feather name="credit-card" size={11} color="#7A5500" />
      <Text style={s.text}>{atCounter ? 'First rental — ID at the shop' : 'First rental — check ID'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FDF0C4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4,
  },
  text: { fontSize: 11, fontWeight: '800', color: '#7A5500' },
});
