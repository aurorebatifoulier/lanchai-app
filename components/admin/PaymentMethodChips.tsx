import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SHADES } from '@/constants/brandShades';
import { RENTAL_PAYMENT_METHODS, type RentalPaymentMethod } from '@/functions/src/shared/rentalAgreement';

// Handover: how the rental was paid at pick-up — REQUIRED (single checklist and chained
// order summary), stored as handoverChecklist.rentalPaymentMethod and printed on the
// rental agreement ("Rental paid at pick-up: … LAK · Cash USD").
export function PaymentMethodChips({ value, onChange, labelStyle }: {
  value: RentalPaymentMethod | null;
  onChange: (m: RentalPaymentMethod) => void;
  labelStyle?: object;
}) {
  return (
    <View>
      <Text style={[s.label, labelStyle]}>Rental payment received</Text>
      <View style={s.row}>
        {RENTAL_PAYMENT_METHODS.map(m => {
          const on = value === m.key;
          return (
            <TouchableOpacity key={m.key} style={[s.chip, on && s.chipOn]} onPress={() => onChange(m.key)} activeOpacity={0.8}>
              <Text style={[s.text, on && s.textOn]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: SHADES.carbon, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, height: 36, borderRadius: 10, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  text: { fontSize: 13.5, fontWeight: '600', color: SHADES.carbon },
  textOn: { color: SHADES.cream },
});
