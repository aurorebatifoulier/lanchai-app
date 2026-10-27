import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { formatLakAmount } from '@/utils/currency';

// Canonical Subtotal → VAT → Total → Deposit block, shared by every screen
// that shows a billing breakdown (single-item summary, multi-item checkout,
// post-booking confirmation) so they can never visually drift apart again.
export interface BillingSummaryProps {
  subtotalHt: number;
  vatAmount: number;
  /** null → VAT display off: only the total (and deposit) rows. */
  vatPct: number | null;
  total: number;
  totalLabel: string;
  // Omit both to render just Subtotal/VAT/Total with no Deposit row — for a context
  // (e.g. the settlement receipt) that already shows deposit accounting elsewhere on
  // the same screen, where repeating it here would duplicate the same figure.
  deposit?: number;
  depositLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function BillingSummary({
  subtotalHt,
  vatAmount,
  vatPct,
  total,
  totalLabel,
  deposit,
  depositLabel,
  style,
}: BillingSummaryProps) {
  return (
    <View style={style}>
      {vatPct != null && (
        <>
          <View style={s.row}>
            <Text style={s.label}>Subtotal (excl. VAT)</Text>
            <Text style={s.value}>{formatLakAmount(subtotalHt)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>VAT ({vatPct}%)</Text>
            <Text style={s.value}>{formatLakAmount(vatAmount)}</Text>
          </View>
        </>
      )}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{totalLabel}</Text>
        <Text style={s.totalValue}>{formatLakAmount(total)}</Text>
      </View>
      {deposit != null && depositLabel != null && (
        <View style={s.row}>
          <Text style={s.label}>{depositLabel}</Text>
          <Text style={s.value}>{formatLakAmount(deposit)}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: SHADES.carbonMuted,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
  },
});
