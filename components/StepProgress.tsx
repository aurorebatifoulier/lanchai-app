import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';

// Segmented progress bar for a multi-step flow (return: 3 steps, pick-up: 4): one
// segment per step with its label under it — done = green + ✓, current = amber,
// upcoming = grey. Purely visual: the screen owns navigation (no skipping).
export default function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={s.row} accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <View key={label} style={s.step}>
            <View style={[s.bar, state === 'done' ? s.done : state === 'current' ? s.current : s.upcoming]} />
            <View style={s.labelRow}>
              {state === 'done' && <Feather name="check" size={12} color={COLORS.success} />}
              {/* Never overlaps: one line, shrinks to fit its segment (4 steps on a 360dp phone). */}
              <Text style={[s.label, state === 'upcoming' && s.labelMuted, state === 'current' && s.labelCurrent]}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  step: { flex: 1, gap: 6 },
  bar: { height: 6, borderRadius: 3 },
  done: { backgroundColor: COLORS.success },
  current: { backgroundColor: SHADES.amber },
  upcoming: { backgroundColor: SHADES.carbonLight },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  label: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: SHADES.carbon },
  labelCurrent: { fontWeight: '800' },
  labelMuted: { color: SHADES.carbonMuted },
});
