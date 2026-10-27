import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import type { ProductSignal } from '@/lib/productSignal';

// The ONE renderer of a product card's signal line (lib/productSignal.ts) — Home rails,
// Explore, Liked, category pages. Amber star / repeat icons + bold numbers, grey words;
// "·" separators with a small (~6px) gap. Callers reserve the "+" width (paddingRight).
/** `large`: product page (14px) — cards use the default 12px. */
export default function SignalLine({ signal, large }: { signal: ProductSignal | null; large?: boolean }) {
  if (!signal) return null;
  return (
    <View style={s.row}>
      {signal.parts.map((part, i) => part.sep ? (
        <Text key={i} style={[s.sep, large && s.lg]}>·</Text>
      ) : (
        <View key={i} style={s.part}>
          {part.icon && (
            <Feather
              name={part.icon}
              size={(part.icon === 'clock' ? 11 : 12) + (large ? 2 : 0)}
              color={part.icon === 'clock' ? SHADES.carbonMuted : SHADES.amber}
            />
          )}
          <Text
            style={[
              s.text, large && s.lg, signal.tone === 'amber' && s.amber, signal.tone === 'muted' && s.muted,
              part.strong && s.strong, signal.tone === 'plain' && !part.strong && s.secondary,
            ]}
            numberOfLines={1}
          >
            {part.text}
            {part.suffix && <Text style={s.secondary}>{part.suffix}</Text>}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  part: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  sep: { fontSize: 12, color: SHADES.carbonFaint, marginHorizontal: 6 },
  lg: { fontSize: 14 },
  text: { fontSize: 12, fontWeight: '600', color: SHADES.carbon, flexShrink: 1 },
  amber: { color: SHADES.amberText },
  muted: { color: SHADES.carbonMuted, fontWeight: '500' },
  strong: { fontWeight: '700', color: SHADES.carbon },
  secondary: { fontWeight: '500', color: SHADES.carbonMuted },
});
