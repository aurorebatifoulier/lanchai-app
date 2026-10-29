import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import PressScale from '@/components/PressScale';

/**
 * Staff choice of how many of a reservation's units a charge is about (damage on the
 * return checklist, "Report lost/stolen"). Only rendered when quantity > 1 — callers
 * keep the value at 1..max (chargeUnits, shared/returnStock.ts).
 */
export default function UnitsStepper({ label, value, max, onChange }: {
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const dec = value > 1;
  const inc = value < max;
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.control}>
        <PressScale style={[s.btn, !dec && s.btnOff]} disabled={!dec} onPress={() => onChange(value - 1)} accessibilityLabel="Fewer units" hitSlop={6}>
          <Feather name="minus" size={14} color={dec ? SHADES.carbon : SHADES.carbonFaint} />
        </PressScale>
        <Text style={s.value}>{`${value} of ${max}`}</Text>
        <PressScale style={[s.btn, !inc && s.btnOff]} disabled={!inc} onPress={() => onChange(value + 1)} accessibilityLabel="More units" hitSlop={6}>
          <Feather name="plus" size={14} color={inc ? SHADES.carbon : SHADES.carbonFaint} />
        </PressScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: SHADES.carbon, flexShrink: 1, marginRight: 12 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: SHADES.carbon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SHADES.white,
  },
  btnOff: { borderColor: SHADES.border },
  value: { fontSize: 14, fontWeight: '700', color: SHADES.carbon, minWidth: 52, textAlign: 'center' },
});
