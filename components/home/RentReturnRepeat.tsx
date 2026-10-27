import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Mask, Path } from 'react-native-svg';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, type AnyIcon } from '@/components/account/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HOME_COPY } from '@/constants/homeCopy';
import { DASH, DASH_PERIOD, PATH_OPACITY, useReduceMotion } from '@/components/account/AccountHeader';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// "Rent. Return. Repeat." — first-time renters only (replaces "How LANCHAI works" and the
// trust blocks). Three steps with icon circles in palette shades, linked by the same
// dotted bee trail as the My Account header (dots, amber, drawn on mount then drifting;
// static with "reduce motion"). Copy in constants/homeCopy.ts.
const CIRCLE = 44;
const PAD = 16;
const TAIL = 22;
const STEP_STYLE: { icon: AnyIcon & { set: 'mci' }; bg: string; fg: string }[] = [
  { icon: { set: 'mci', name: 'calendar-month-outline' }, bg: SHADES.amberLight, fg: SHADES.amberDeep },
  { icon: { set: 'mci', name: 'storefront-outline' }, bg: SHADES.carbon, fg: SHADES.amber },
  { icon: { set: 'mci', name: 'sync' }, bg: SHADES.amberMid, fg: SHADES.carbon },
];

/** Wavy cubic path through the circle centres, then a short tail below the last one. */
function trailPath(ys: number[], x: number): { d: string; length: number } {
  const pts = [...ys, ys[ys.length - 1] + CIRCLE / 2 + TAIL];
  let d = `M ${x} ${pts[0]}`;
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], h = (b - a) / 3, w = i % 2 ? 9 : -9;
    d += ` C ${x + w} ${a + h}, ${x - w} ${b - h}, ${x} ${b}`;
    length += Math.hypot(b - a, w * 1.4);
  }
  return { d, length: Math.ceil(length + 8) };
}

export default function RentReturnRepeat() {
  const reduce = useReduceMotion();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [rowYs, setRowYs] = useState<(number | null)[]>(HOME_COPY.steps.map(() => null));
  const draw = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const ready = !!size && rowYs.every(y => y != null);

  useEffect(() => {
    if (!ready) return;
    if (reduce) { draw.setValue(0); drift.setValue(0); return; }
    draw.setValue(1);
    const flow = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false }));
    const anim = Animated.timing(draw, { toValue: 0, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) flow.start(); });
    return () => { anim.stop(); flow.stop(); };
  }, [ready, reduce, draw, drift]);

  const onRow = (i: number) => (e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y + CIRCLE / 2;
    setRowYs(prev => (prev[i] === y ? prev : prev.map((v, j) => (j === i ? y : v))));
  };
  const trail = ready ? trailPath(rowYs as number[], PAD + CIRCLE / 2) : null;

  return (
    <View>
      <SectionTitle>{HOME_COPY.stepsTitle}</SectionTitle>
      <View
        style={[UI.card, s.card]}
        onLayout={e => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setSize(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
        }}
      >
        {size && trail && (
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Mask id="stepsReveal">
                <AnimatedPath
                  d={trail.d} stroke="#fff" strokeWidth={10} fill="none"
                  strokeDasharray={[trail.length, trail.length]}
                  strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [0, trail.length] })}
                />
              </Mask>
            </Defs>
            <AnimatedPath
              d={trail.d} stroke={SHADES.amber} strokeOpacity={PATH_OPACITY * 2} strokeWidth={2.5}
              strokeDasharray={DASH} strokeLinecap="round" fill="none" mask="url(#stepsReveal)"
              strokeDashoffset={drift.interpolate({ inputRange: [0, 1], outputRange: [0, -DASH_PERIOD] })}
            />
          </Svg>
        )}
        {HOME_COPY.steps.map((step, i) => {
          const st = STEP_STYLE[i];
          return (
            <View key={step.title} style={[s.row, i > 0 && s.rowGap]} onLayout={onRow(i)}>
              <View style={[s.circle, { backgroundColor: st.bg }]}>
                <MaterialCommunityIcons name={st.icon.name} size={21} color={st.fg} />
              </View>
              <View style={s.text}>
                <Text style={s.title}>{step.title}</Text>
                <Text style={UI.subtitle}>{step.text}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: PAD, paddingBottom: PAD + 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowGap: { marginTop: 18 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, paddingTop: 2 },
  title: { fontSize: 16, fontWeight: '700', color: SHADES.carbon },
});
