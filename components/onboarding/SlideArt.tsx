import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, ReduceMotion, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { ONBOARDING_COPY as c } from '@/constants/onboardingCopy';
import CountUpText from '@/components/CountUpText';
import type { OnboardingSlide } from '@/lib/onboardingContent';
import {
  PhotoCard, Sticker, Chip, Heartbeat, Sparkle, hexPoints, chipTextStyle, useRunning,
} from '@/components/onboarding/Parts';

// The animated middle of each onboarding slide, laid out on the visual area (w × h, ~16%
// → 58% of the screen, set by the screen). Each slide computes its group's real bounding
// box (cards + stickers) from the card width, picks the biggest card width that fits the
// height (within its width rule) and CENTRES the group vertically and horizontally.

/** Breathing room kept above and below the group inside the visual area. */
const BOTTOM_GAP = 8;
/** Top of a group of height `g` centred in an `h` box. */
const groupTop = (h: number, g: number) => Math.max(0, (h - g) / 2);

interface ArtProps {
  slide: OnboardingSlide;
  active: boolean;
  w: number;
  h: number;
  scrollX: SharedValue<number>;
  page: number;
  pageW: number;
}

export function Slide1Art({ slide, active, w, h, scrollX, page, pageW, priceLak }: ArtProps & { priceLak: number | null }) {
  // Group: heart above (16) + cards (ch, left card 0.08·cw lower) + gap 10 + amber chip 42.
  const HEART = 16; const CHIP = 52;
  const k = 1.32 + 0.08; // card height + left-card offset, per unit of width
  const cw = Math.max(80, Math.min(w * 0.44, (h - 2 * BOTTOM_GAP - HEART - CHIP) / k));
  const ch = cw * 1.32;
  const g = HEART + cw * k + CHIP;
  const top = groupTop(h, g) + HEART; // top of the right card
  const par = { scrollX, page, pageW };
  // Count-up restarts each time the slide becomes active (new id = new count).
  const [run, setRun] = useState(0);
  useEffect(() => { if (active) setRun(n => n + 1); }, [active]);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-8} active={active} from="left" {...par}
        style={{ left: w * 0.5 - cw * 1.02, top: top + cw * 0.08 }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={6} delay={600} active={active} from="right" {...par}
        style={{ left: w * 0.5 + cw * 0.02, top }} />
      <Sticker active={active} delay={300} hold={3400} wait={1600} style={{ left: Math.max(0, w * 0.5 - cw * 1.12), top: top - HEART - 6 }}>
        <Heartbeat active={active}>
          <View style={s.heart}><MaterialCommunityIcons name="heart" size={22} color={SHADES.amber} /></View>
        </Heartbeat>
      </Sticker>
      {priceLak != null && (
        <Sticker active={active} delay={700} hold={3000} wait={1200} style={{ right: 0, top: top + ch * 0.74 }}>
          <Chip tone="carbon" text={
            <CountUpText
              id={`onb-price-${run}`}
              value={priceLak}
              format={v => c.priceChip((Math.round(v / 1000) * 1000).toLocaleString('en-US'))}
              style={chipTextStyle('carbon')}
            />
          } />
        </Sticker>
      )}
      <Sticker active={active} delay={1300} hold={2600} wait={1800} style={{ left: w * 0.08, top: top + cw * 0.08 + ch + 10 }}>
        <Chip tone="light" text={slide.stickers.chip} />
      </Sticker>
    </View>
  );
}

/**
 * Slide 2: three step cards in a zigzag across the full width with a small gap between
 * them (Book and Bring back higher, Pick up lower by ~25% of a card; −5° / 0° / +5°) —
 * cards may touch at a corner at most, no label is ever covered. Numbered amber circles,
 * the dotted bee trajectory through the three (45%, bigger dots) with an 18 px hexagon
 * travelling along it; each card lifts as it passes. "Vientiane shop" under Pick up.
 */
export function Slide2Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const { running, reduce } = useRunning(active);
  const LABEL_H = 30; const BADGE = 9; const CHIP = 52; const DROP = 0.25; const GAP = 10;
  const chOf = (cw: number) => cw * 1.32 + LABEL_H;
  const byWidth = (w - 2 * GAP) / 3;
  const byHeight = ((h - 2 * BOTTOM_GAP - BADGE - CHIP) / (1 + DROP) - LABEL_H) / 1.32;
  const cw = Math.max(70, Math.min(byWidth, byHeight));
  const ch = chOf(cw);
  const gap = Math.min(24, (w - 3 * cw) / 2);
  const x0 = (w - (3 * cw + 2 * gap)) / 2;
  const top = groupTop(h, BADGE + ch * (1 + DROP) + CHIP) + BADGE;
  const card1 = { x: x0, y: top };
  const card2 = { x: x0 + cw + gap, y: top + ch * DROP };
  const card3 = { x: x0 + 2 * (cw + gap), y: top };
  const C1 = { x: card1.x + cw * 0.5, y: card1.y + ch * 0.5 };
  const C2 = { x: card2.x + cw * 0.5, y: card2.y + ch * 0.5 };
  const C3 = { x: card3.x + cw * 0.5, y: card3.y + ch * 0.5 };
  // Two cubic segments C1 → C2 → C3, a gentle wave (smooth through C2).
  const A1 = { x: C1.x + cw * 0.5, y: C1.y + ch * 0.35 };
  const A2 = { x: C2.x - cw * 0.6, y: C2.y + ch * 0.1 };
  const B1 = { x: C2.x + cw * 0.6, y: C2.y - ch * 0.1 };
  const B2 = { x: C3.x - cw * 0.5, y: C3.y + ch * 0.35 };
  const d = `M ${C1.x},${C1.y} C ${A1.x},${A1.y} ${A2.x},${A2.y} ${C2.x},${C2.y} C ${B1.x},${B1.y} ${B2.x},${B2.y} ${C3.x},${C3.y}`;

  const t = useSharedValue(0);
  useEffect(() => {
    if (!running) { cancelAnimation(t); return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false);
  }, [running, t]);
  const hexStyle = useAnimatedStyle(() => {
    const first = t.value < 0.5;
    const u = first ? t.value * 2 : (t.value - 0.5) * 2;
    const v = 1 - u;
    const p0 = first ? C1 : C2; const p1 = first ? A1 : B1; const p2 = first ? A2 : B2; const p3 = first ? C2 : C3;
    const x = v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x;
    const y = v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y;
    return { transform: [{ translateX: x - 9 }, { translateY: y - 9 }] };
  });
  const par = { scrollX, page, pageW, lift: t };
  const label = (x: string) => x.replace(/^\d+\s*·\s*/, ''); // old "1 · Book" texts

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="onbFade" gradientUnits="userSpaceOnUse" x1={C1.x} y1={0} x2={C1.x + w * 0.35} y2={0}>
            <Stop offset={0} stopColor={SHADES.amber} stopOpacity={0.08} />
            <Stop offset={1} stopColor={SHADES.amber} stopOpacity={0.45} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke="url(#onbFade)" strokeWidth={3} strokeDasharray={[0.1, 8]} strokeLinecap="round" fill="none" />
      </Svg>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-5} badge={1} label={label(slide.stickers.step1)} active={active} from="left" liftAt={0.03} {...par}
        style={{ left: card1.x, top: card1.y }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={0} delay={400} dark badge={2} label={label(slide.stickers.step2)} active={active} from="left" liftAt={0.5} {...par}
        style={{ left: card2.x, top: card2.y }} />
      <PhotoCard source={slide.photos[2]} width={cw} rotate={5} delay={800} badge={3} label={label(slide.stickers.step3)} active={active} from="right" liftAt={0.97} {...par}
        style={{ left: card3.x, top: card3.y }} />
      {!reduce && (
        <Animated.View style={[s.hex, hexStyle]} pointerEvents="none">
          <Svg width={18} height={18} viewBox="0 0 20 20"><Polygon points={hexPoints(10, 10, 9.5)} fill={SHADES.amber} /></Svg>
        </Animated.View>
      )}
      <Sticker active={active} delay={900} hold={3200} wait={1500}
        style={{ left: 0, right: 0, top: card2.y + ch + 10, alignItems: 'center' }}>
        <Chip tone="light" text={slide.stickers.place} icon={<Feather name="map-pin" size={15} color={SHADES.amberDeep} />} />
      </Sticker>
    </View>
  );
}

export function Slide3Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  // Group: card (ch) + the deposit chip overhanging its bottom by ~24.
  const OVER = 26;
  const cw = Math.max(90, Math.min(w * 0.52, (h - 2 * BOTTOM_GAP - OVER) / 1.32));
  const ch = cw * 1.32;
  const left = (w - cw) / 2;
  const top = groupTop(h, ch + OVER);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-2} active={active} from="right" scrollX={scrollX} page={page} pageW={pageW}
        style={{ left, top }} />
      <Sparkle active={active} delay={200} style={{ left: left - 24, top: top + ch * 0.35 }} />
      <Sparkle active={active} delay={900} size={12} style={{ left: left + cw + 8, top: top + 6 }} />
      <Sparkle active={active} delay={1500} size={18} style={{ left: left + cw + 14, top: top + ch * 0.74 }} />
      <Sparkle active={active} delay={2200} size={11} style={{ left: left + cw * 0.15, top: top - 16 }} />
      <Sticker active={active} delay={200} hold={3400} wait={1300} style={{ left: Math.max(0, left - cw * 0.28), top: top + ch * 0.12 }}>
        <Chip tone="amber" text={slide.stickers.checked} icon={<Feather name="check" size={16} color={SHADES.carbon} />} />
      </Sticker>
      <Sticker active={active} delay={1000} hold={2800} wait={1700} style={{ right: Math.max(0, w - left - cw - cw * 0.3), top: top + ch * 0.5 }}>
        <Chip tone="dark" text={slide.stickers.clean} icon={<MaterialCommunityIcons name="creation" size={16} color={SHADES.amber} />} />
      </Sticker>
      <Sticker active={active} delay={1700} hold={3000} wait={1500} style={{ left: 0, right: 0, top: top + ch - 16, alignItems: 'center' }}>
        <Chip tone="light" text={slide.stickers.deposit} />
      </Sticker>
    </View>
  );
}

const s = StyleSheet.create({
  heart: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: SHADES.carbon, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  hex: { position: 'absolute', left: 0, top: 0 },
});
