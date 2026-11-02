import React, { useEffect } from 'react';
import { View, Text, StyleSheet, type ImageSourcePropType, type ViewStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Polygon } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withRepeat, withSequence, withSpring, withTiming,
  Easing, ReduceMotion, cancelAnimation,
} from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { MOTION, useReducedMotion } from '@/constants/motion';

// Building blocks of the "living cards" onboarding (validated mockup).

/**
 * Title with [highlighted] words. Cream slides: carbon text on an amber highlighter band
 * (≈ half the text height, lower part of the words, rounded, −1.5°). Dark slide: the
 * highlighted words are amber text. Words wrap naturally (one Text per word).
 */
export function HighlightTitle({ text, dark }: { text: string; dark?: boolean }) {
  const words: { w: string; hl: boolean }[] = [];
  let hl = false;
  for (const raw of text.split(/(\[|\])/)) {
    if (raw === '[') { hl = true; continue; }
    if (raw === ']') { hl = false; continue; }
    for (const w of raw.split(/\s+/).filter(Boolean)) words.push({ w, hl });
  }
  return (
    <View style={s.titleRow} accessible accessibilityRole="header" accessibilityLabel={text.replace(/[[\]]/g, '')}>
      {words.map((x, i) => {
        const nextHl = words[i + 1]?.hl;
        return (
          <View key={i} style={s.word}>
            {x.hl && !dark && (
              // Band also covers the gap to the next highlighted word → one continuous mark.
              <View style={[s.band, { right: nextHl ? -SPACE : -3 }]} />
            )}
            <Text style={[s.title, dark && s.titleDark, x.hl && dark && s.titleAccent]}>{x.w}</Text>
          </View>
        );
      })}
    </View>
  );
}

const SPACE = 7;

/** White-framed photo card, tilted, floating slowly (static with reduce motion). */
export function PhotoCard({
  source, width, rotate = 0, delay = 0, dark, label, style, children,
}: {
  source: ImageSourcePropType;
  width: number;
  rotate?: number;
  delay?: number;
  dark?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) { cancelAnimation(y); y.value = 0; return; }
    y.value = withDelay(delay, withRepeat(
      withTiming(-5, { duration: 3200, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), -1, true,
    ));
  }, [reduce, delay, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${rotate}deg` }] }));
  const pad = Math.max(5, Math.round(width * 0.035));
  return (
    <Animated.View style={[s.card, dark && s.cardDark, { width, padding: pad }, style, anim]}>
      <View style={[s.photo, { borderRadius: 12 }]}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      </View>
      {!!label && <Text style={[s.cardLabel, dark && s.cardLabelDark]} numberOfLines={2}>{label}</Text>}
      {children}
    </Animated.View>
  );
}

/** Pops in (0 → 1.1 → 1) after `delay` once `active`; static with reduce motion. */
export function Sticker({ active, delay, style, children }: {
  active: boolean; delay: number; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const sc = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { sc.value = 1; return; }
    if (!active) { sc.value = 0; return; }
    sc.value = withDelay(delay, withSequence(
      withTiming(1.1, { duration: MOTION.duration.base, reduceMotion: ReduceMotion.System }),
      withSpring(1, { ...MOTION.spring.press, reduceMotion: ReduceMotion.System }),
    ));
  }, [active, delay, reduce, sc]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }], opacity: sc.value > 0.01 ? 1 : 0 }));
  return <Animated.View style={[{ position: 'absolute' }, style, anim]}>{children}</Animated.View>;
}

/** Chip used as a sticker. */
export function Chip({ text, tone, icon }: { text: string; tone: 'carbon' | 'amber' | 'light' | 'dark'; icon?: React.ReactNode }) {
  const t = CHIP[tone];
  return (
    <View style={[s.chip, { backgroundColor: t.bg }]}>
      {icon}
      <Text style={[s.chipText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}
const CHIP = {
  carbon: { bg: SHADES.carbon, fg: SHADES.white },
  amber: { bg: SHADES.amber, fg: SHADES.carbon },
  light: { bg: SHADES.amberLight, fg: SHADES.amberDeep },
  dark: { bg: SHADES.carbonSoft, fg: SHADES.white },
} as const;

/** Hexagon pagination: active = amber and bigger, others light grey. */
export function HexDots({ count, index, dark }: { count: number; index: number; dark?: boolean }) {
  return (
    <View style={s.dots}>
      {Array.from({ length: count }, (_, i) => {
        const on = i === index;
        const size = on ? 20 : 13;
        return (
          <Svg key={i} width={size} height={size} viewBox="0 0 20 20">
            <Polygon points={hexPoints(10, 10, 9.5)} fill={on ? SHADES.amber : dark ? SHADES.carbonSoft : SHADES.border} />
          </Svg>
        );
      })}
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
  titleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  word: { marginRight: SPACE, justifyContent: 'flex-end' },
  band: {
    position: 'absolute', left: -3, bottom: 3, height: '46%', borderRadius: 6,
    backgroundColor: SHADES.amber, transform: [{ rotate: '-1.5deg' }],
  },
  title: { ...TYPE.screenTitle, lineHeight: 32, fontWeight: '800', color: SHADES.carbon },
  titleDark: { color: SHADES.white },
  titleAccent: { color: SHADES.amber },
  card: {
    position: 'absolute', backgroundColor: SHADES.white, borderRadius: 16,
    shadowColor: SHADES.carbon, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardDark: { backgroundColor: SHADES.carbon },
  photo: { width: '100%', aspectRatio: 4 / 5, overflow: 'hidden', backgroundColor: SHADES.carbonLight },
  cardLabel: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon, marginTop: 6, marginBottom: 2 },
  cardLabelDark: { color: SHADES.white },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { ...TYPE.body, fontWeight: '600' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
