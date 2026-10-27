import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { vteDay, vteTime, isPickupMissed } from '@/functions/src/shared/dates';
import type { RentalDoc } from '@/lib/firestore';

/** The nearest upcoming pick-up (booked, not yet picked up, its day not over), or null. */
export function nextPickup(reservations: RentalDoc[], nowMs: number = Date.now()): RentalDoc | null {
  const upcoming = reservations
    .filter(r => (r.status === 'pending_payment' || r.status === 'confirmed') && r.pickupAt)
    .filter(r => !isPickupMissed(r.pickupAt.toMillis(), nowMs))
    .sort((a, b) => a.pickupAt.toMillis() - b.pickupAt.toMillis());
  return upcoming[0] ?? null;
}

/** Tomorrow 10:00 Vientiane (UTC+7) — example date for the admin preview. */
function exampleMs(): number {
  const d = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 - 7, 0);
}

// Carbon highlight card, same style as My Account's "LAK not spent on stuff" card.
// `rental` null = admin preview with example data (tomorrow 10:00, tap does nothing).
export default function NextPickupCard({ rental }: { rental: RentalDoc | null }) {
  const router = useRouter();
  const ms = rental ? rental.pickupAt.toMillis() : exampleMs();
  return (
    <TouchableOpacity
      style={[UI.card, s.card]}
      onPress={() => { if (rental) router.push(`/rentals/${rental.id}`); }}
      disabled={!rental}
      activeOpacity={0.85}
    >
      <View style={s.circle}>
        <MaterialCommunityIcons name="qrcode" size={22} color={SHADES.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{HOME_COPY.nextPickupTitle}</Text>
        <Text style={s.when}>{`${vteDay(ms)} · ${vteTime(ms)}`}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={SHADES.amber} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: SHADES.carbon, borderColor: SHADES.carbon,
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 16,
  },
  circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: SHADES.carbonSoft, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '500', color: SHADES.carbonFaint },
  when: { fontSize: 17, fontWeight: '800', color: SHADES.white, marginTop: 2, letterSpacing: -0.2 },
});
