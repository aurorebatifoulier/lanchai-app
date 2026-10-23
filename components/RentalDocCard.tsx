import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import type { RentalDoc } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import {
  hasReceipt, hasPickupReport, hasReturnReport, displayOrderId, fmtDay, fmtRange,
} from '@/utils/rentalDocs';

// One rental with its documents (validated mockup): name (one line) + amount, a grey
// "Returned … · LNC-…" line, and Receipt / Pick-up / Return buttons — greyed when that
// document doesn't exist yet. Used by app/profile/documents.tsx and app/profile/rentals.tsx.
export function RentalDocCard({ rental: r, icons = true }: { rental: RentalDoc; icons?: boolean }) {
  const router = useRouter();
  const receipt = hasReceipt(r);
  const orderId = displayOrderId(r);
  const when = r.status === 'returned'
    ? `Returned ${fmtDay(r.returnedAt ?? r.returnAt)}`
    : fmtRange(r.pickupAt, r.returnAt);
  const name = r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName;

  const buttons: { label: string; icon: 'file-text' | 'clipboard'; enabled: boolean; route: string }[] = [
    { label: 'Receipt', icon: 'file-text', enabled: receipt, route: `/rentals/${r.id}/receipt` },
    { label: 'Pick-up', icon: 'clipboard', enabled: hasPickupReport(r), route: `/rentals/${r.id}/report?type=pickup` },
    { label: 'Return', icon: 'clipboard', enabled: hasReturnReport(r), route: `/rentals/${r.id}/report?type=return` },
  ];

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        {receipt ? (
          <Text style={s.amount}>{formatLakAmount(r.total)}</Text>
        ) : r.status === 'active' ? (
          <Text style={s.ongoing}>Ongoing</Text>
        ) : null}
      </View>
      <Text style={s.sub} numberOfLines={1}>{orderId ? `${when} · ${orderId}` : when}</Text>
      <View style={s.btnRow}>
        {buttons.map(b => (
          <TouchableOpacity
            key={b.label}
            style={[s.btn, !b.enabled && s.btnDisabled]}
            disabled={!b.enabled}
            onPress={() => router.push(b.route as never)}
            activeOpacity={0.75}
          >
            {icons && <Feather name={b.icon} size={13} color={b.enabled ? COLORS.amberTintText : COLORS.fg3} />}
            <Text style={[s.btnText, !b.enabled && s.btnTextDisabled]} numberOfLines={1}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.carbon },
  amount: { fontSize: 14, fontWeight: '800', color: COLORS.carbon, flexShrink: 0 },
  ongoing: { fontSize: 13, fontWeight: '600', color: COLORS.fg3, flexShrink: 0 },
  sub: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 3 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.carbon,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  btnDisabled: { borderColor: COLORS.softGray200 },
  btnText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  btnTextDisabled: { color: COLORS.fg3 },
});
