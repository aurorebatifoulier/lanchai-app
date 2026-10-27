import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, StatusChip } from '@/components/account/ui';
import type { RentalDoc } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import {
  hasReceipt, hasPickupReport, hasReturnReport, displayOrderId, fmtDay, fmtRange,
} from '@/utils/rentalDocs';

// One rental with its documents (validated mockup): name (one line) + amount, a grey
// "Returned … · LNC-…" line, and Receipt / Pick-up / Return buttons — greyed when that
// document doesn't exist yet. Used by app/profile/documents.tsx (Receipts & reports) and app/profile/rentals.tsx.
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
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <View style={s.topRow}>
        <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>{name}</Text>
        {receipt ? (
          <Text style={s.amount}>{formatLakAmount(r.total)}</Text>
        ) : r.status === 'active' ? (
          <StatusChip label="Ongoing" tone="grey" />
        ) : null}
      </View>
      <Text style={UI.subtitle} numberOfLines={1}>{orderId ? `${when} · ${orderId}` : when}</Text>
      <View style={s.btnRow}>
        {buttons.map(b => (
          <TouchableOpacity
            key={b.label}
            style={[s.btn, !b.enabled && s.btnDisabled]}
            disabled={!b.enabled}
            onPress={() => router.push(b.route as never)}
            activeOpacity={0.75}
          >
            {icons && <Feather name={b.icon} size={13} color={b.enabled ? SHADES.carbon : SHADES.carbonFaint} />}
            <Text style={[s.btnText, !b.enabled && s.btnTextDisabled]} numberOfLines={1}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amount: { fontSize: 15, fontWeight: '800', color: SHADES.carbon, flexShrink: 0 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  // Compact secondary buttons (white, carbon outline); greyed when the document doesn't exist.
  btn: {
    flex: 1, height: 38, borderRadius: 12, borderWidth: 1.5, borderColor: SHADES.carbon, backgroundColor: SHADES.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4,
  },
  btnDisabled: { borderColor: SHADES.border, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700', color: SHADES.carbon },
  btnTextDisabled: { color: SHADES.carbonFaint },
});
