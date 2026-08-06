import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

export function PaymentAtPickupBox() {
  return (
    <View style={s.box}>
      <View style={s.header}>
        <Feather name="info" size={15} color="#854F0B" />
        <Text style={s.title}>Payment at pick-up</Text>
      </View>
      <Text style={s.note}>No online payment is required to confirm your booking.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    backgroundColor: '#FFFCF0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F0D860',
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  note: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
});
