import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { COLORS } from '@/constants/Colors';
import { splitHtVat } from '@/utils/currency';

// Shared price line — renders exactly like today (`{amount} LAK`) for everyone except
// approved business accounts, who instead see the same stored LAK total broken out into
// Subtotal (HT) / VAT (X%) / Total (TTC) — a render-time-only breakdown, the underlying
// figure never changes. `customerType` drives the switch, matching the same field the
// existing deposit-waiver logic already keys off (lib/loyalty.ts's depositPercentFor).
export interface PriceLakProps {
  lak: number;
  customerType?: string | null;
  vatPercent?: number | null;
  bold?: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function PriceLak({
  lak,
  customerType,
  vatPercent,
  bold,
  size = 14,
  color = COLORS.carbon,
  style,
  textStyle,
}: PriceLakProps) {
  const fmt = (n: number) => `${n.toLocaleString('en-US')} LAK`;
  const isBusiness = customerType === 'business';

  // VAT display off (vatPercent null — see vatDisplayPercent): plain price for everyone.
  if (!isBusiness || vatPercent == null) {
    return (
      <Text style={[{ fontSize: size, fontWeight: bold ? '800' : '600', color }, textStyle]}>
        {fmt(lak)}
      </Text>
    );
  }

  const pct = vatPercent;
  const { ht, vat, ttc } = splitHtVat(lak, pct);

  return (
    <View style={style}>
      <Text style={[{ fontSize: size, fontWeight: bold ? '800' : '600', color }, textStyle]}>
        {fmt(ht)} <Text style={s.htTag}>HT</Text>
      </Text>
      <Text style={s.vatLine}>
        + {fmt(vat)} VAT ({pct}%) · {fmt(ttc)} TTC
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  htTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.fg3,
  },
  vatLine: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 1,
  },
});
