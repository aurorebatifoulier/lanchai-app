import React from 'react';
import { StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import PressScale from '@/components/PressScale';
import { SHADES } from '@/constants/brandShades';

/** 'now' = available today (amber); 'later' = not today (white + outline; the sheet opens on the next free dates). */
export type QuickAddState = 'now' | 'later';

// Round quick-add "+" on product cards (bottom-right of the card body).
// ONE size everywhere (Explore, category page, Liked, Home): 24px, icon 14px.
export default function QuickAddButton({ state, onPress, size = 24 }: { state: QuickAddState; onPress: () => void; size?: number }) {
  const now = state === 'now';
  return (
    <PressScale
      style={[s.btn, { width: size, height: size, borderRadius: size / 2 }, now ? s.now : s.later]}
      onPress={e => { e.stopPropagation(); onPress(); }}
      hitSlop={10}
      accessibilityLabel="Quick add to bag"
    >
      <Feather name="plus" size={Math.round(size * 0.58)} color={SHADES.carbon} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  now: { backgroundColor: SHADES.amber },
  later: { backgroundColor: SHADES.white, borderWidth: 1, borderColor: SHADES.carbonFaint },
});
