import React, { useEffect } from 'react';
import { View, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  FadeInUp, FadeOut, LinearTransition, useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  ReduceMotion, Easing,
} from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION, useReducedMotion as useReduceMotion } from '@/constants/motion';

// Home loading placeholders (palette greys, same shapes as each section) + the wrapper
// that swaps a skeleton for the real section with a fade, and lets an empty section
// collapse smoothly. Pulse and transitions are off with "reduce motion".

// Fade + slight rise (MOTION.riseY) when a section first appears after loading. It plays
// once: a section stays mounted across focus reloads / pull-to-refresh (its data flag
// stays true), so neither replays it — and scrolling never triggers anything.
const ENTER = FadeInUp.duration(MOTION.duration.base)
  .withInitialValues({ opacity: 0, transform: [{ translateY: MOTION.riseY }] })
  .reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(MOTION.duration.fast).reduceMotion(ReduceMotion.System);
const MOVE = LinearTransition.duration(MOTION.duration.base).reduceMotion(ReduceMotion.System);

/** Skeleton while `loading`; then the children (or nothing — the section collapses). */
export function HomeSection({ loading, skeleton, children }: { loading: boolean; skeleton: React.ReactNode; children?: React.ReactNode }) {
  if (loading) return <Reanimated.View key="sk" exiting={EXIT} layout={MOVE}>{skeleton}</Reanimated.View>;
  if (children == null || children === false) return null;
  return <Reanimated.View key="real" entering={ENTER} exiting={EXIT} layout={MOVE}>{children}</Reanimated.View>;
}

function Block({ w, h, r = 12, style }: { w: DimensionValue; h: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) { o.value = 1; return; }
    o.value = withRepeat(withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Reanimated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: SHADES.carbonLight }, anim, style]} />;
}

const Title = () => <Block w={170} h={20} r={8} style={{ marginTop: 24, marginBottom: 12 }} />;

export function RailSkeleton() {
  return (
    <View>
      <Title />
      <View style={s.row}>
        {[0, 1, 2].map(i => <Block key={i} w={150} h={200} r={18} />)}
      </View>
    </View>
  );
}

export function ThumbsSkeleton() {
  return (
    <View>
      <Title />
      <View style={s.row}>
        {[0, 1, 2].map(i => <Block key={i} w={104} h={150} r={18} />)}
      </View>
    </View>
  );
}

export function TilesSkeleton() {
  return (
    <View>
      <Title />
      <View style={s.grid}>
        {[0, 1, 2, 3].map(i => <Block key={i} w="48.4%" h={150} r={18} />)}
      </View>
    </View>
  );
}

export function ListSkeleton() {
  return (
    <View>
      <Title />
      <View style={s.card}>
        {[0, 1, 2].map(i => (
          <View key={i} style={s.listRow}>
            <Block w={44} h={44} />
            <View style={{ flex: 1, gap: 6 }}>
              <Block w="60%" h={14} r={6} />
              <Block w="40%" h={12} r={6} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PodiumSkeleton() {
  return (
    <View>
      <Title />
      <View style={[s.row, { alignItems: 'flex-end', gap: 8 }]}>
        {[78, 108, 58].map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            <Block w={56} h={56} r={28} />
            <Block w="100%" h={h} r={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function CardSkeleton({ height = 150 }: { height?: number }) {
  return <Block w="100%" h={height} r={18} style={{ marginTop: 24 }} />;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { backgroundColor: SHADES.white, borderRadius: 18, borderWidth: 0.5, borderColor: SHADES.border, paddingHorizontal: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
