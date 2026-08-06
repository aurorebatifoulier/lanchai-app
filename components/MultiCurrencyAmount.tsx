import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/Colors';
import { lakToUsd, lakToThb } from '@/utils/currency';

// Informational-only reference row showing a LAK amount converted into all three
// currencies simultaneously — not stored anywhere, just helps the admin pick a currency
// before the actual (frozen) selection is made.
export function MultiCurrencyAmount({
  lakAmount,
  exchangeRate,
  thbRate,
}: {
  lakAmount: number;
  exchangeRate: number | null;
  thbRate: number | null;
}) {
  const usd = exchangeRate != null ? lakToUsd(lakAmount, exchangeRate) : null;
  const thb = thbRate != null ? lakToThb(lakAmount, thbRate) : null;

  return (
    <View style={s.row}>
      <Text style={s.text}>
        {lakAmount.toLocaleString('en-US')} LAK
        {'  ≈  '}
        {usd != null ? `$${usd} USD` : '— USD'}
        {'  ≈  '}
        {thb != null ? `฿${thb} THB` : '— THB'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    marginBottom: 10,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
});
