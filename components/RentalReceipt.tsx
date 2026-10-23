import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import type { RentalDoc } from '@/lib/firestore';
import { buildReceiptSummary } from '@/utils/receiptSummary';
import { downloadReceipt } from '@/lib/receiptPdf';

// End-of-service receipt — ONE "Your rental summary" card, aligned with the receipt
// email. The lines come from buildReceiptSummary (utils/receiptSummary.ts), shared with
// the PDF (lib/receiptPdf.ts). Renters never see staff names; `staffView` (admin
// reservation detail) adds them.
export interface RentalReceiptProps {
  rental: RentalDoc;
  vatPercent: number | null;
  staffView?: boolean;
}

export function RentalReceipt({ rental: r, vatPercent, staffView }: RentalReceiptProps) {
  const { lines, totalLabel, totalValues } = buildReceiptSummary(r, vatPercent, { staffView });

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const result = await downloadReceipt(r, vatPercent);
    if (!result.ok) {
      setDownloadError(
        result.reason === 'unavailable'
          ? 'Sharing isn’t available on this device.'
          : 'Couldn’t generate the receipt. Please try again.',
      );
    }
    setDownloading(false);
  };

  return (
    <View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Your rental summary</Text>

        {lines.map((l, i) => l.kind === 'row' ? (
          <Row key={i} label={l.label} value={l.value} danger={l.danger} strong={l.strong} />
        ) : l.kind === 'detail' ? (
          <Text key={i} style={s.detail}>{l.text}</Text>
        ) : (
          <View key={i} style={[s.pill, l.tone === 'success' ? s.pillSuccess : l.tone === 'danger' ? s.pillDanger : s.pillMuted]}>
            {l.tone === 'success' && <Feather name="check" size={12} color={COLORS.success} />}
            <Text style={[s.pillText, l.tone === 'success' ? s.pillTextSuccess : l.tone === 'danger' ? s.pillTextDanger : s.pillTextMuted]}>
              {l.label}
            </Text>
          </View>
        ))}

        <View style={s.divider} />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{totalLabel}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            {totalValues.map(v => <Text key={v} style={s.totalValue}>{v}</Text>)}
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[s.downloadBtn, downloading && s.downloadBtnDisabled]}
        onPress={handleDownload}
        activeOpacity={0.85}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator color={COLORS.carbon} size="small" />
        ) : (
          <>
            <Feather name="download" size={16} color={COLORS.carbon} />
            <Text style={s.downloadBtnText}>Download / share receipt</Text>
          </>
        )}
      </TouchableOpacity>
      {downloadError && <Text style={s.downloadError}>{downloadError}</Text>}
    </View>
  );
}

function Row({ label, value, danger, strong }: { label: string; value: string; danger?: boolean; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, strong && s.rowLabelStrong]}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowValueStrong, danger && s.rowValueDanger]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
    marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.carbon, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.carbon },
  rowLabelStrong: { fontWeight: '700' },
  rowValue: { fontSize: 14, fontWeight: '600', color: COLORS.carbon, flexShrink: 0 },
  rowValueStrong: { fontWeight: '800' },
  rowValueDanger: { color: COLORS.danger },
  detail: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },
  pill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8,
  },
  pillSuccess: { backgroundColor: '#E8F5EE' },
  pillDanger: { backgroundColor: '#FEE2E2' },
  pillMuted: { backgroundColor: COLORS.softGray200 },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextSuccess: { color: COLORS.success },
  pillTextDanger: { color: COLORS.danger },
  pillTextMuted: { color: COLORS.fg2 },
  divider: { height: 1, backgroundColor: COLORS.softGray200, marginVertical: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  totalLabel: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.white,
    marginTop: 14,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  downloadError: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 8,
  },
});
