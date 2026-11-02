import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, ReduceMotion,
} from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { useReducedMotion } from '@/constants/motion';
import { CategoryBadge } from '@/components/account/ui';
import RotatingLine from '@/components/explore/RotatingLine';
import { AUTH_COPY } from '@/constants/authCopy';

// Sign-in header (validated mockup): the LANCHAI wordmark + tagline, a dotted "bee
// flight" in the BACKGROUND (amber, low opacity) with category bubbles floating around
// it and the hexagon at its end, then a rotating witty line. Bubbles drift a few pixels
// (slow loop); everything is static with reduce motion.

const H = 210;

function Bubble({ cat, size, x, y, delay }: { cat: string; size: number; x: number; y: number; delay: number }) {
  const reduce = useReducedMotion();
  const dy = useSharedValue(0);
  useEffect(() => {
    if (reduce) { dy.value = 0; return; }
    dy.value = withDelay(delay, withRepeat(
      withTiming(-6, { duration: 2600, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
      -1, true,
    ));
  }, [reduce, delay, dy]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, anim]}>
      <CategoryBadge cat={cat} size={size} />
    </Animated.View>
  );
}

export function AuthHeaderDecor() {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 420);
  // Path on a 340×200 reference box, scaled to the header width.
  const k = w / 340;
  const P = (x: number, y: number) => `${(x * k).toFixed(1)},${(y * H / 200).toFixed(1)}`;
  const d = `M ${P(0, 150)} C ${P(40, 175)} ${P(70, 165)} ${P(95, 140)} S ${P(150, 70)} ${P(200, 60)} S ${P(280, 20)} ${P(310, 22)}`;
  return (
    <View style={[s.box, { width: w }]}>
      <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
        <Path d={d} stroke={SHADES.amber} strokeOpacity={0.35} strokeWidth={2.5} strokeDasharray="0.1 8" strokeLinecap="round" fill="none" />
        <Polygon
          points={hexagon(w * (318 / 340), 24, 9)}
          fill={SHADES.amberSoft}
          opacity={0.9}
        />
      </Svg>
      <Bubble cat="fun" size={52} x={w * 0.06} y={18} delay={0} />
      <Bubble cat="tools" size={52} x={w * 0.76} y={92} delay={600} />
      <Bubble cat="outdoor" size={44} x={w * 0.2} y={150} delay={1200} />

      <View style={s.center}>
        <Text style={s.wordmark}>LANCHAI</Text>
        <Text style={s.tagline}>Rent. Return. Repeat.</Text>
      </View>
      <View style={s.lineWrap}>
        <RotatingLine lines={AUTH_COPY.signIn.lines} style={s.line} />
      </View>
    </View>
  );
}

function hexagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const s = StyleSheet.create({
  box: { height: H + 34, alignSelf: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 72, alignItems: 'center' },
  wordmark: { fontSize: 30, fontWeight: '800', letterSpacing: 4, color: SHADES.carbon },
  tagline: { fontSize: 14, fontWeight: '600', color: SHADES.amberText, marginTop: 2 },
  lineWrap: { position: 'absolute', left: 0, right: 0, top: H - 4, alignItems: 'center' },
  line: { fontSize: 17, fontWeight: '600', color: SHADES.carbon, textAlign: 'center' },
});
