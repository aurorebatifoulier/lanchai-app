import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Text } from '@/components/AppText';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { db } from '@/lib/firebase';
import { phaseOf } from '@/functions/src/shared/reservationMachine';

// Owner dashboard "Needs you": everything staff handed over for an owner decision —
// damage charges to review (deposit held), refused pick-ups, IDs flagged at the counter.
// Equality-only queries (no composite index). Renders nothing when empty. The same
// alerts also arrive as in-app notifications + email (functions/src/ownerAlerts.ts).

interface Item { key: string; icon: keyof typeof Feather.glyphMap; title: string; sub: string; route: string }

export default function OwnerInbox() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const res = (field: string) => getDocs(query(collection(db, 'reservations'), where(field, '==', true))).catch(() => null);
    Promise.all([
      res('chargeReviewPending'),
      res('pickupRefusedOpen'),
      getDocs(query(collection(db, 'identityChecks'), where('flaggedForReview', '==', true))).catch(() => null),
    ]).then(([damage, refused, ids]) => {
      if (!alive) return;
      const out: Item[] = [];
      // State machine: only bookings really in that phase (archived ones never count).
      damage?.docs.filter(d => phaseOf(d.data()) === 'return_review').forEach(d => out.push({
        key: `d${d.id}`, icon: 'alert-triangle', title: `Damage to review — ${d.get('productName') ?? 'item'}`,
        sub: `${d.get('renterName') ?? ''} · deposit held`, route: `/admin/reservations/${d.id}`,
      }));
      refused?.docs.filter(d => phaseOf(d.data()) === 'pickup_refused').forEach(d => out.push({
        key: `r${d.id}`, icon: 'slash', title: `Pick-up refused — ${d.get('productName') ?? 'item'}`,
        sub: `“${d.get('pickupRefusedReason') ?? ''}” · ${d.get('pickupRefusedByName') ?? 'staff'}`, route: `/admin/reservations/${d.id}`,
      }));
      ids?.docs.forEach(d => out.push({
        key: `i${d.id}`, icon: 'shield', title: 'ID flagged for review',
        sub: `“${d.get('flaggedReason') ?? ''}” · ${d.get('flaggedByName') ?? 'staff'}`, route: `/admin/identity/${d.id}`,
      }));
      setItems(out);
    });
    return () => { alive = false; };
  }, []));

  if (items.length === 0) return null;
  return (
    <View style={[UI.card, s.card]}>
      <View style={s.head}>
        <Text style={s.title}>Needs you</Text>
        <View style={s.badge}><Text style={s.badgeText}>{items.length}</Text></View>
      </View>
      {items.map(it => (
        <TouchableOpacity key={it.key} style={s.row} onPress={() => router.push(it.route as Href)} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={it.title}>
          <Feather name={it.icon} size={16} color={SHADES.amberText} />
          <View style={{ flex: 1 }}>
            <Text style={UI.title} numberOfLines={1}>{it.title}</Text>
            <Text style={UI.small} numberOfLines={1}>{it.sub}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={COLORS.fg3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, gap: 4, marginBottom: 16, borderColor: SHADES.amber, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '700', color: SHADES.carbon },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', color: COLORS.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
