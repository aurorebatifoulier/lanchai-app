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
  PhotoCard, Sticker, SpotSticker, Chip, Heartbeat, Sparkle, hexPoints, chipTextStyle, useRunning,
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
 * Slide 2 — step-by-step story (validated mockup). Strong zigzag: Book top-left (−7°),
 * Pick up much lower (top at ~38% of the visual area, +2°), Bring back top-right (+7°);
 * cards ~31% of the width, numbered amber circles. Spotlight loop (6 s): the hexagon
 * travels along the dotted trajectory and STOPS on each card in turn (1 → 2 → 3, then
 * restarts); the focused card scales to 1.07 and comes to the front, the others 0.96 at
 * ~55% opacity (~300 ms transitions); one sticker per step pops in while its card is
 * focused. Trajectory behind the cards, 55% max, 3 px dots. Reduce motion: no loop, all
 * cards normal, only the "QR scanned · Vientiane shop" sticker.
 */
const CYCLE_MS = 6000;
// Timeline on t ∈ [0, 1): hold on card 1 → travel → hold on 2 → travel → hold on 3 → reset.
const K = { h1: 0.2, t12: 0.32, h2: 0.52, t23: 0.64, h3: 0.84 };
const R = 0.05; // ~300 ms ramps
const FOCUS = [
  { inputs: [0, K.h1, K.h1 + R, 1 - R, 1], outputs: [1, 1, 0, 0, 1] },
  { inputs: [0, K.t12 - R, K.t12, K.h2, K.h2 + R, 1], outputs: [0, 0, 1, 1, 0, 0] },
  { inputs: [0, K.t23 - R, K.t23, K.h3, K.h3 + R, 1], outputs: [0, 0, 1, 1, 0, 0] },
];

export function Slide2Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const { running, reduce } = useRunning(active);
  const LABEL_H = 30; const BADGE = 10; const PICK_TOP = 0.38;
  // ~31% of the width, smaller only if the lower card wouldn't fit the height.
  const byHeight = (h * (1 - PICK_TOP) - 2 * BOTTOM_GAP - LABEL_H) / 1.32;
  const cw = Math.max(70, Math.min(w * 0.31, byHeight));
  const ch = cw * 1.32 + LABEL_H;
  const card1 = { x: w * 0.02, y: BADGE + 2 };
  const card2 = { x: (w - cw) / 2, y: h * PICK_TOP };
  const card3 = { x: w * 0.98 - cw, y: BADGE + 8 };
  const C1 = { x: card1.x + cw * 0.5, y: card1.y + ch * 0.72 };
  const C2 = { x: card2.x + cw * 0.45, y: card2.y + ch * 0.78 };
  const C3 = { x: card3.x + cw * 0.5, y: card3.y + ch * 0.45 };
  const A1 = { x: C1.x + cw * 0.05, y: C1.y + ch * 0.45 };
  const A2 = { x: C2.x - cw * 0.55, y: C2.y + ch * 0.05 };
  const B1 = { x: C2.x + cw * 0.55, y: C2.y - ch * 0.05 };
  const B2 = { x: C3.x - cw * 0.15, y: C3.y + ch * 0.45 };
  const d = `M ${C1.x},${C1.y} C ${A1.x},${A1.y} ${A2.x},${A2.y} ${C2.x},${C2.y} C ${B1.x},${B1.y} ${B2.x},${B2.y} ${C3.x},${C3.y}`;

  const t = useSharedValue(0.1);
  useEffect(() => {
    if (!running) { cancelAnimation(t); t.value = 0.1; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
  }, [running, t]);
  const hexStyle = useAnimatedStyle(() => {
    const v0 = t.value;
    // Segment progress: 0 while holding, eased 0 → 1 while travelling.
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    let first = true; let u = 0; let opacity = 1;
    if (v0 < K.h1) { u = 0; }
    else if (v0 < K.t12) { u = ease((v0 - K.h1) / (K.t12 - K.h1)); }
    else if (v0 < K.h2) { u = 1; }
    else if (v0 < K.t23) { first = false; u = ease((v0 - K.h2) / (K.t23 - K.h2)); }
    else { first = false; u = 1; opacity = v0 > K.h3 ? Math.max(0, 1 - (v0 - K.h3) / 0.06) : 1; }
    if (v0 > 1 - 0.06) { first = true; u = 0; opacity = (v0 - (1 - 0.06)) / 0.06; } // back in on card 1
    const p0 = first ? C1 : C2; const p1 = first ? A1 : B1; const p2 = first ? A2 : B2; const p3 = first ? C2 : C3;
    const q = 1 - u;
    const x = q * q * q * p0.x + 3 * q * q * u * p1.x + 3 * q * u * u * p2.x + u * u * u * p3.x;
    const y = q * q * q * p0.y + 3 * q * q * u * p1.y + 3 * q * u * u * p2.y + u * u * u * p3.y;
    return { opacity, transform: [{ translateX: x - 10 }, { translateY: y - 10 }] };
  });
  const par = { scrollX, page, pageW };
  const spot = (i: number) => (reduce ? undefined : { t, ...FOCUS[i] });
  const label = (x: string) => x.replace(/^\d+\s*·\s*/, ''); // old "1 · Book" texts
  const qrChip = (
    <Chip tone="light" text={slide.stickers.place} icon={<MaterialCommunityIcons name="qrcode-scan" size={15} color={SHADES.amberDeep} />} />
  );

  return (
    <View style={{ width: w, height: h }}>
      {/* Trajectory BEHIND the cards. */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="onbFade" gradientUnits="userSpaceOnUse" x1={C1.x} y1={0} x2={C1.x + w * 0.3} y2={0}>
            <Stop offset={0} stopColor={SHADES.amber} stopOpacity={0.12} />
            <Stop offset={1} stopColor={SHADES.amber} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke="url(#onbFade)" strokeWidth={3} strokeDasharray={[0.1, 8]} strokeLinecap="round" fill="none" />
      </Svg>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-7} badge={1} label={label(slide.stickers.step1)} active={active} from="left" spot={spot(0)} {...par}
        style={[s.soft, { left: card1.x, top: card1.y }]} />
      <PhotoCard source={slide.photos[2]} width={cw} rotate={7} delay={800} badge={3} label={label(slide.stickers.step3)} active={active} from="right" spot={spot(2)} {...par}
        style={[s.soft, { left: card3.x, top: card3.y }]} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={2} delay={400} dark badge={2} label={label(slide.stickers.step2)} active={active} from="left" spot={spot(1)} {...par}
        style={[s.soft, { left: card2.x, top: card2.y }]} />
      {!reduce && (
        <Animated.View style={[s.hex, hexStyle]} pointerEvents="none">
          <Svg width={20} height={20} viewBox="0 0 20 20"><Polygon points={hexPoints(10, 10, 9.5)} fill={SHADES.amber} /></Svg>
        </Animated.View>
      )}
      {reduce ? (
        <View style={[s.stickerRow, { top: Math.max(0, card2.y - 46) }]} pointerEvents="none">{qrChip}</View>
      ) : (
        <>
          <SpotSticker t={t} {...FOCUS[0]} style={{ left: card1.x + 4, top: card1.y + ch + 6 }}>
            <Chip tone="carbon" text={slide.stickers.booked} icon={<MaterialCommunityIcons name="calendar-check" size={15} color={SHADES.amber} />} />
          </SpotSticker>
          <SpotSticker t={t} {...FOCUS[1]} style={[s.stickerRow, { top: Math.max(0, card2.y - 46) }]}>
            {qrChip}
          </SpotSticker>
          <SpotSticker t={t} {...FOCUS[2]} style={{ right: w * 0.02 + 4, top: card3.y + ch + 6 }}>
            <Chip tone="amber" text={slide.stickers.points} icon={<MaterialCommunityIcons name="star-four-points" size={14} color={SHADES.carbon} />} />
          </SpotSticker>
        </>
      )}
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
  hex: { position: 'absolute', left: 0, top: 0, zIndex: 15 },
  stickerRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  // Softer shadow on the step cards.
  soft: { shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
});
