import React, { useEffect, useMemo, useState } from 'react';
import {
  AppState, View, Text, StyleSheet, type ImageSourcePropType, type ViewStyle, type StyleProp,
  type TextLayoutLine,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Polygon } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withRepeat, withSequence, withSpring, withTiming,
  Easing, ReduceMotion, cancelAnimation, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { MOTION, useReducedMotion } from '@/constants/motion';

// Building blocks of the "living cards" onboarding (validated mockup). Every loop runs on
// the UI thread (Reanimated transforms / opacity only) and only while `running` — the
// slide is visible, the app is in the foreground and reduce motion is off.

const RM = ReduceMotion.System;

/** True while the app is in the foreground. */
export function useAppActive(): boolean {
  const [on, setOn] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setOn(s === 'active'));
    return () => sub.remove();
  }, []);
  return on;
}

/** Loops allowed: slide visible + app in foreground + reduce motion off. */
export function useRunning(active: boolean): { running: boolean; reduce: boolean } {
  const reduce = useReducedMotion();
  const app = useAppActive();
  return { running: active && app && !reduce, reduce };
}

// ── Highlighted title ────────────────────────────────────────────────────────

interface Seg { t: string; hl: boolean }

function parseTitle(text: string): Seg[] {
  const segs: Seg[] = [];
  let hl = false;
  for (const raw of text.split(/(\[|\])/)) {
    if (raw === '[') { hl = true; continue; }
    if (raw === ']') { hl = false; continue; }
    if (raw) segs.push({ t: raw, hl });
  }
  return segs;
}

function sameLines(a: TextLayoutLine[], b: TextLayoutLine[]): boolean {
  return a.length === b.length && a.every((l, i) =>
    l.text === b[i].text && Math.abs(l.x - b[i].x) < 0.5 && Math.abs(l.y - b[i].y) < 0.5 && Math.abs(l.width - b[i].width) < 0.5);
}

/** Hidden single-line measurement of a string (no wrapping). */
function Measure({ text, onWidth }: { text: string; onWidth: (w: number) => void }) {
  return (
    <View style={s.measureBox} pointerEvents="none">
      <Text style={s.title} onTextLayout={e => onWidth(e.nativeEvent.lines[0]?.width ?? 0)}>{text}</Text>
    </View>
  );
}

/**
 * Title with [highlighted] words. Cream slides: ONE continuous amber highlighter band
 * behind the whole phrase — one band per line the phrase actually occupies (from
 * onTextLayout + single-line measurements), rounded, ~half the text height on the lower
 * part of the letters, −1.5°. Dark slide: the highlighted words are amber text.
 */
export function HighlightTitle({ text, dark }: { text: string; dark?: boolean }) {
  const segs = useMemo(() => parseTitle(text), [text]);
  const plain = segs.map(x => x.t).join('');
  const ranges = useMemo(() => {
    const out: [number, number][] = [];
    let pos = 0;
    for (const x of segs) { if (x.hl) out.push([pos, pos + x.t.length]); pos += x.t.length; }
    return out;
  }, [segs]);
  const [lines, setLines] = useState<TextLayoutLine[] | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => { setLines(null); setWidths({}); }, [text]);

  // For each line: where the phrase starts on it (prefix width) and how wide it is.
  const pieces = useMemo(() => {
    if (dark || !lines) return [];
    const out: { line: TextLayoutLine; prefix: string; phrase: string }[] = [];
    let cursor = 0;
    for (const line of lines) {
      const body = line.text.replace(/\s+$/, '');
      const start = body ? plain.indexOf(body, cursor) : cursor;
      if (start < 0) continue;
      const end = start + body.length;
      cursor = end;
      for (const [a, b] of ranges) {
        const from = Math.max(a, start);
        const to = Math.min(b, end);
        if (to <= from) continue;
        const phrase = plain.slice(from, to).replace(/\s+$/, '');
        if (!phrase.trim()) continue;
        out.push({ line, prefix: plain.slice(start, from), phrase });
      }
    }
    return out;
  }, [dark, lines, plain, ranges]);

  const need = new Set<string>(['|']);
  for (const p of pieces) { need.add(`${p.prefix}|`); need.add(p.phrase); }
  const ready = [...need].every(k => widths[k] != null);

  return (
    <View accessible accessibilityRole="header" accessibilityLabel={plain}>
      {ready && pieces.map((p, i) => {
        const x = p.line.x + (widths[`${p.prefix}|`] - widths['|']);
        const fontSize = TYPE.screenTitle.fontSize;
        const baseline = p.line.y + (p.line.ascender ?? p.line.height * 0.78);
        const h = fontSize * 0.44;
        return (
          <View
            key={i}
            style={[s.band, { left: x - 4, width: widths[p.phrase] + 8, top: baseline - h + 3, height: h }]}
          />
        );
      })}
      <Text
        style={[s.title, dark && s.titleDark]}
        // Only when the lines really changed (Android may report the same layout again).
        onTextLayout={e => {
          const next = e.nativeEvent.lines;
          setLines(prev => (prev && sameLines(prev, next) ? prev : next));
        }}
      >
        {segs.map((x, i) => (
          <Text key={i} style={x.hl && dark ? s.titleAccent : undefined}>{x.t}</Text>
        ))}
      </Text>
      {!dark && [...need].filter(k => widths[k] == null).map(k => (
        <Measure key={k} text={k} onWidth={w => setWidths(prev => (prev[k] === w ? prev : { ...prev, [k]: w }))} />
      ))}
    </View>
  );
}

// ── Photo card ───────────────────────────────────────────────────────────────

/**
 * White-framed photo card: slides in from its side with a small rotation when the slide
 * becomes active, floats slowly (±5 px), lags slightly while swiping (parallax), and can
 * "lift" when the travelling hexagon passes (`lift` = hexagon progress, `liftAt` = where).
 */
export function PhotoCard({
  source, width, rotate = 0, delay = 0, dark, label, badge, style, active, from = 'left',
  scrollX, page, pageW, lift, liftAt, spot,
}: {
  source: ImageSourcePropType;
  width: number;
  rotate?: number;
  delay?: number;
  dark?: boolean;
  label?: string;
  /** Step number in an amber circle pinned on the top-left corner. */
  badge?: number;
  style?: StyleProp<ViewStyle>;
  active: boolean;
  from?: 'left' | 'right';
  scrollX?: SharedValue<number>;
  page?: number;
  pageW?: number;
  lift?: SharedValue<number>;
  liftAt?: number;
  /** Spotlight: focus 0..1 = interpolate(spot.t, inputs, outputs). Focused = scale 1.07,
   *  in front; others 0.96 and ~55% opacity. */
  spot?: { t: SharedValue<number>; inputs: number[]; outputs: number[] };
}) {
  const { running, reduce } = useRunning(active);
  const y = useSharedValue(0);
  const enter = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (running) {
      y.value = withDelay(delay, withRepeat(withTiming(-5, { duration: 3200, easing: Easing.inOut(Easing.sin), reduceMotion: RM }), -1, true));
    } else {
      cancelAnimation(y);
      y.value = withTiming(0, { duration: MOTION.duration.base, reduceMotion: RM });
    }
  }, [running, delay, y]);
  useEffect(() => {
    if (reduce) { enter.value = 1; return; }
    if (active) enter.value = withDelay(delay * 0.3, withSpring(1, { damping: 16, stiffness: 140, reduceMotion: RM }));
    else enter.value = 0;
  }, [active, reduce, delay, enter]);
  const dir = from === 'left' ? -1 : 1;
  const anim = useAnimatedStyle(() => {
    const e = enter.value;
    const parallax = scrollX && pageW ? (scrollX.value - (page ?? 0) * pageW) * 0.18 : 0;
    let lifted = 0;
    if (lift && liftAt != null) {
      lifted = -7 * interpolate(Math.abs(lift.value - liftAt), [0, 0.12], [1, 0], Extrapolation.CLAMP);
    }
    let scale = 1;
    let dim = 1;
    let front = 0;
    if (spot) {
      const f = interpolate(spot.t.value, spot.inputs, spot.outputs, Extrapolation.CLAMP);
      scale = 0.96 + 0.11 * f;
      dim = 0.55 + 0.45 * f;
      front = f > 0.5 ? 1 : 0;
    }
    return {
      // Always visible (the next slide shows while swiping); only the slide-in moves.
      opacity: interpolate(e, [0, 1], [0.6, 1], Extrapolation.CLAMP) * dim,
      zIndex: front ? 10 : 1,
      elevation: front ? 8 : 3,
      transform: [
        { translateX: (1 - e) * dir * 70 + parallax },
        { translateY: y.value + lifted },
        { rotate: `${rotate + (1 - e) * dir * 8}deg` },
        { scale },
      ],
    };
  });
  const pad = Math.max(5, Math.round(width * 0.035));
  return (
    <Animated.View style={[s.card, dark && s.cardDark, { width, padding: pad }, style, anim]}>
      <View style={s.photo}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      </View>
      {!!label && <Text style={[s.cardLabel, badge != null && s.cardLabelStep, dark && s.cardLabelDark]} numberOfLines={1}>{label}</Text>}
      {badge != null && (
        <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>
      )}
    </Animated.View>
  );
}

// ── Stickers ─────────────────────────────────────────────────────────────────

/**
 * Sticker cycle: pop in (0 → 1.1 → 1) → stay `hold` ms with a gentle bob (±3 px) → pop out
 * → wait `wait` ms → again. `delay` staggers the stickers so they never all move at once.
 * Not running: shown statically (reduce motion) or hidden until the slide is active.
 */
export function Sticker({ active, delay, hold = 3000, wait = 1400, style, children }: {
  active: boolean; delay: number; hold?: number; wait?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const { running, reduce } = useRunning(active);
  const sc = useSharedValue(reduce ? 1 : 0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduce) { cancelAnimation(sc); cancelAnimation(bob); sc.value = 1; bob.value = 0; return; }
    if (!running) {
      cancelAnimation(sc); cancelAnimation(bob);
      if (!active) sc.value = 0;      // replays when the slide comes back
      bob.value = 0;
      return;
    }
    sc.value = 0;
    sc.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1.1, { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: RM }),
      withSpring(1, { ...MOTION.spring.press, reduceMotion: RM }),
      withDelay(hold, withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic), reduceMotion: RM })),
      withDelay(wait, withTiming(0, { duration: 1, reduceMotion: RM })),
    ), -1, false));
    bob.value = withRepeat(withTiming(-3, { duration: 1300, easing: Easing.inOut(Easing.sin), reduceMotion: RM }), -1, true);
  }, [running, active, reduce, delay, hold, wait, sc, bob]);
  const anim = useAnimatedStyle(() => ({
    opacity: sc.value > 0.02 ? 1 : 0,
    transform: [{ translateY: bob.value }, { scale: sc.value }],
  }));
  return <Animated.View style={[{ position: 'absolute' }, style, anim]}>{children}</Animated.View>;
}

/**
 * Sticker tied to a spotlight step: pops in (0 → 1.1 → 1) while its card is focused and
 * pops out after — focus = interpolate(t, inputs, outputs), on the UI thread.
 */
export function SpotSticker({ t, inputs, outputs, style, children }: {
  t: SharedValue<number>; inputs: number[]; outputs: number[]; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const anim = useAnimatedStyle(() => {
    const f = interpolate(t.value, inputs, outputs, Extrapolation.CLAMP);
    return {
      opacity: f > 0.02 ? 1 : 0,
      transform: [{ scale: interpolate(f, [0, 0.7, 1], [0, 1.1, 1], Extrapolation.CLAMP) }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', zIndex: 20 }, style, anim]} pointerEvents="none">{children}</Animated.View>;
}

/** Soft heartbeat every few seconds. */
export function Heartbeat({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { running } = useRunning(active);
  const sc = useSharedValue(1);
  useEffect(() => {
    if (!running) { cancelAnimation(sc); sc.value = 1; return; }
    sc.value = withRepeat(withSequence(
      withTiming(1.14, { duration: 140, reduceMotion: RM }),
      withTiming(1, { duration: 140, reduceMotion: RM }),
      withTiming(1.09, { duration: 120, reduceMotion: RM }),
      withTiming(1, { duration: 180, reduceMotion: RM }),
      withDelay(2600, withTiming(1, { duration: 1, reduceMotion: RM })),
    ), -1, false);
  }, [running, sc]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/** Small amber sparkle twinkling (scale + opacity) on its own rhythm. */
export function Sparkle({ active, delay, size = 16, style }: { active: boolean; delay: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const { running, reduce } = useRunning(active);
  const t = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { t.value = 1; return; }
    if (!running) { cancelAnimation(t); t.value = 0; return; }
    t.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.quad), reduceMotion: RM }),
      withTiming(0, { duration: 620, easing: Easing.in(Easing.quad), reduceMotion: RM }),
      withDelay(900 + (delay % 700), withTiming(0, { duration: 1, reduceMotion: RM })),
    ), -1, false));
  }, [running, reduce, delay, t]);
  const anim = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.4 + 0.6 * t.value }, { rotate: `${t.value * 25}deg` }] }));
  return (
    <Animated.View style={[{ position: 'absolute' }, style, anim]} pointerEvents="none">
      <MaterialCommunityIcons name="star-four-points" size={size} color={SHADES.amber} />
    </Animated.View>
  );
}

/** Chip used as a sticker. */
export function Chip({ text, tone, icon }: { text: React.ReactNode; tone: 'carbon' | 'amber' | 'light' | 'dark'; icon?: React.ReactNode }) {
  const t = CHIP[tone];
  return (
    <View style={[s.chip, { backgroundColor: t.bg }]}>
      {icon}
      {typeof text === 'string' ? <Text style={[s.chipText, { color: t.fg }]}>{text}</Text> : text}
    </View>
  );
}
export const CHIP = {
  carbon: { bg: SHADES.carbon, fg: SHADES.white },
  amber: { bg: SHADES.amber, fg: SHADES.carbon },
  light: { bg: SHADES.amberLight, fg: SHADES.amberDeep },
  dark: { bg: SHADES.carbonSoft, fg: SHADES.white },
} as const;
export const chipTextStyle = (tone: keyof typeof CHIP) => [{ ...TYPE.body, fontWeight: '600' as const }, { color: CHIP[tone].fg }];

// ── Hexagon pagination ───────────────────────────────────────────────────────

function HexDot({ on, dark }: { on: boolean; dark?: boolean }) {
  const reduce = useReducedMotion();
  const sc = useSharedValue(on ? 1 : 0.62);
  useEffect(() => {
    const target = on ? 1 : 0.62;
    sc.value = reduce ? target : withSpring(target, { ...MOTION.spring.bounce, reduceMotion: RM });
  }, [on, reduce, sc]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={anim}>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Polygon points={hexPoints(10, 10, 9.5)} fill={on ? SHADES.amber : dark ? SHADES.carbonSoft : SHADES.border} />
      </Svg>
    </Animated.View>
  );
}

/** Active = amber and bigger (springs when the slide changes), others light grey. */
export function HexDots({ count, index, dark }: { count: number; index: number; dark?: boolean }) {
  return (
    <View style={s.dots}>
      {Array.from({ length: count }, (_, i) => <HexDot key={i} on={i === index} dark={dark} />)}
    </View>
  );
}

export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

const s = StyleSheet.create({
  measureBox: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
  band: {
    position: 'absolute', borderRadius: 6, backgroundColor: SHADES.amber, transform: [{ rotate: '-1.5deg' }],
  },
  title: { ...TYPE.screenTitle, lineHeight: 32, fontWeight: '800', color: SHADES.carbon },
  titleDark: { color: SHADES.white },
  titleAccent: { color: SHADES.amber },
  card: {
    position: 'absolute', backgroundColor: SHADES.white, borderRadius: 16,
    shadowColor: SHADES.carbon, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardDark: { backgroundColor: SHADES.carbon },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, overflow: 'hidden', backgroundColor: SHADES.carbonLight },
  cardLabel: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon, marginTop: 6, marginBottom: 2 },
  cardLabelStep: { ...TYPE.body, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 7, marginBottom: 3 },
  cardLabelDark: { color: SHADES.white },
  badge: {
    position: 'absolute', left: -9, top: -9, width: 26, height: 26, borderRadius: 13,
    backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 14, fontWeight: '800', color: SHADES.carbon },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { ...TYPE.body, fontWeight: '600' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
