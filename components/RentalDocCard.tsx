import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI, StatusChip } from '@/components/account/ui';
import type { RentalDoc } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import { AGREEMENT_UI } from '@/constants/agreementCopy';
import { openAgreementPdf } from '@/lib/rentalAgreement';
import {
  hasReceipt, hasPickupReport, hasReturnReport, displayOrderId, fmtDay, fmtRange,
} from '@/utils/rentalDocs';

// One rental with its documents (validated mockup): name (one line) + amount, a grey
// "Returned … · LNC-…" line, and Receipt / Pick-up / Return / Agreement buttons — greyed when that
// document doesn't exist yet. Used by app/profile/documents.tsx (Receipts & reports) and app/profile/rentals.tsx (All rentals). Text-only buttons.
export function RentalDocCard({ rental: r }: { rental: RentalDoc }) {
  const router = useRouter();
  const receipt = hasReceipt(r);
  const orderId = displayOrderId(r);
  const when = r.status === 'returned'
    ? `Returned ${fmtDay(r.returnedAt ?? r.returnAt)}`
    : fmtRange(r.pickupAt, r.returnAt);
  const name = r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName;

  // "Agreement" = the rental agreement signed at pick-up (PDF → share sheet).
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openAgreement = async () => {
    if (!r.agreementId || opening) return;
    setOpening(true);
    setOpenError(null);
    const res = await openAgreementPdf(r.agreementId, orderId ?? r.id);
    if (res !== 'ok') setOpenError(res === 'unavailable' ? AGREEMENT_UI.errors.share : AGREEMENT_UI.errors.open);
    setOpening(false);
  };

  const buttons: { label: string; enabled: boolean; onPress: () => void }[] = [
    { label: 'Receipt', enabled: receipt, onPress: () => router.push(`/rentals/${r.id}/receipt` as never) },
    { label: 'Pick-up', enabled: hasPickupReport(r), onPress: () => router.push(`/rentals/${r.id}/report?type=pickup` as never) },
    { label: 'Return', enabled: hasReturnReport(r), onPress: () => router.push(`/rentals/${r.id}/report?type=return` as never) },
    { label: AGREEMENT_UI.renterButton, enabled: !!r.agreementId && !opening, onPress: openAgreement },
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
            onPress={b.onPress}
            activeOpacity={0.75}
          >
            <Text style={[s.btnText, !b.enabled && s.btnTextDisabled]} numberOfLines={1}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!openError && <Text style={[UI.errorText, { marginTop: 6 }]}>{openError}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amount: { fontSize: 15, fontWeight: '800', color: SHADES.carbon, flexShrink: 0 },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  // Compact secondary buttons (white, carbon outline); greyed when the document doesn't exist.
  btn: {
    // Text only, 4 equal buttons — always fits on one line (no icons).
    flex: 1, minWidth: 0, height: 36, borderRadius: 12, borderWidth: 1.5, borderColor: SHADES.carbon, backgroundColor: SHADES.white,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  btnDisabled: { borderColor: SHADES.border, borderWidth: 1 },
  btnText: { fontSize: 12, fontWeight: '700', color: SHADES.carbon },
  btnTextDisabled: { color: SHADES.carbonFaint },
});
