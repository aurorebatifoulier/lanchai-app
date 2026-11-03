import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, ReduceMotion, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { ONBOARDING_COPY as c } from '@/constants/onboardingCopy';
import { DASH, PATH_OPACITY } from '@/components/account/AccountHeader';
import CountUpText from '@/components/CountUpText';
import type { OnboardingSlide } from '@/lib/onboardingContent';
import {
  PhotoCard, Sticker, Chip, Heartbeat, Sparkle, hexPoints, chipTextStyle, useRunning,
} from '@/components/onboarding/Parts';

// The animated middle of each onboarding slide, laid out on the art box (w × h measured
// by the screen — about 55% of the height, content centred). Sizes scale with h.

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
  const cw = Math.min(w * 0.42, h * 0.56);
  const ch = cw * 1.25 + cw * 0.07;
  const top = Math.max(0, (h - ch) / 2 - h * 0.06);
  const par = { scrollX, page, pageW };
  // Count-up restarts each time the slide becomes active (new id = new count).
  const [run, setRun] = useState(0);
  useEffect(() => { if (active) setRun(n => n + 1); }, [active]);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-8} active={active} from="left" {...par}
        style={{ left: w * 0.5 - cw * 1.02, top: top + h * 0.04 }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={6} delay={600} active={active} from="right" {...par}
        style={{ left: w * 0.5 + cw * 0.02, top }} />
      <Sticker active={active} delay={300} hold={3400} wait={1600} style={{ left: w * 0.5 - cw * 1.12, top: top - 10 }}>
        <Heartbeat active={active}>
          <View style={s.heart}><MaterialCommunityIcons name="heart" size={22} color={SHADES.amber} /></View>
        </Heartbeat>
      </Sticker>
      {priceLak != null && (
        <Sticker active={active} delay={700} hold={3000} wait={1200} style={{ right: w * 0.02, top: top + ch * 0.8 }}>
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
      <Sticker active={active} delay={1300} hold={2600} wait={1800} style={{ left: w * 0.1, top: Math.min(h - 44, top + ch + 8) }}>
        <Chip tone="light" text={slide.stickers.chip} />
      </Sticker>
    </View>
  );
}

/**
 * Three small cards on the dotted bee trajectory (My Account style: DASH, fade 3% → 30%)
 * with the amber hexagon travelling along it; each card lifts a little as it passes.
 */
export function Slide2Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const { running, reduce } = useRunning(active);
  const cw = Math.min(w * 0.27, h * 0.3);
  const ch = cw * 1.25 + 34;
  const card1 = { x: w * 0.04, y: h - ch - h * 0.12 };
  const card2 = { x: w * 0.5 - cw / 2, y: (h - ch) / 2 - h * 0.04 };
  const card3 = { x: w * 0.96 - cw, y: h * 0.02 };
  const P0 = { x: card1.x + cw * 0.95, y: card1.y + ch * 0.2 };
  const P1 = { x: card2.x - cw * 0.2, y: card2.y + ch * 1.2 };
  const P2 = { x: card2.x + cw * 1.3, y: card3.y + ch * 1.4 };
  const P3 = { x: card3.x + cw * 0.1, y: card3.y + ch * 0.85 };
  const d = `M ${P0.x},${P0.y} C ${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`;

  const t = useSharedValue(0);
  useEffect(() => {
    if (!running) { cancelAnimation(t); return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false);
  }, [running, t]);
  const hexStyle = useAnimatedStyle(() => {
    const u = t.value; const v = 1 - u;
    const x = v * v * v * P0.x + 3 * v * v * u * P1.x + 3 * v * u * u * P2.x + u * u * u * P3.x;
    const y = v * v * v * P0.y + 3 * v * v * u * P1.y + 3 * v * u * u * P2.y + u * u * u * P3.y;
    return { transform: [{ translateX: x - 8 }, { translateY: y - 8 }] };
  });
  const par = { scrollX, page, pageW, lift: t };

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="onbFade" gradientUnits="userSpaceOnUse" x1={P0.x} y1={0} x2={P0.x + w * 0.4} y2={0}>
            <Stop offset={0} stopColor={SHADES.amber} stopOpacity={0.03} />
            <Stop offset={1} stopColor={SHADES.amber} stopOpacity={PATH_OPACITY} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke="url(#onbFade)" strokeWidth={2} strokeDasharray={DASH} strokeLinecap="round" fill="none" />
      </Svg>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-3} label={slide.stickers.step1} active={active} from="left" liftAt={0.04} {...par}
        style={{ left: card1.x, top: card1.y }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={-6} delay={400} dark label={slide.stickers.step2} active={active} from="left" liftAt={0.5} {...par}
        style={{ left: card2.x, top: card2.y }} />
      <PhotoCard source={slide.photos[2]} width={cw} rotate={7} delay={800} label={slide.stickers.step3} active={active} from="right" liftAt={0.96} {...par}
        style={{ left: card3.x, top: card3.y }} />
      {!reduce && (
        <Animated.View style={[s.hex, hexStyle]} pointerEvents="none">
          <Svg width={16} height={16} viewBox="0 0 20 20"><Polygon points={hexPoints(10, 10, 9.5)} fill={SHADES.amber} /></Svg>
        </Animated.View>
      )}
      <Sticker active={active} delay={900} hold={3200} wait={1500} style={{ right: w * 0.04, top: Math.min(h - 44, card1.y + ch * 0.55) }}>
        <Chip tone="light" text={slide.stickers.place} icon={<Feather name="map-pin" size={15} color={SHADES.amberDeep} />} />
      </Sticker>
    </View>
  );
}

export function Slide3Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const cw = Math.min(w * 0.5, h * 0.62);
  const ch = cw * 1.25 + cw * 0.07;
  const left = (w - cw) / 2;
  const top = Math.max(0, (h - ch) / 2 - h * 0.05);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-2} active={active} from="right" scrollX={scrollX} page={page} pageW={pageW}
        style={{ left, top }} />
      <Sparkle active={active} delay={200} style={{ left: left - 22, top: top + ch * 0.35 }} />
      <Sparkle active={active} delay={900} size={12} style={{ left: left + cw + 8, top: top + 6 }} />
      <Sparkle active={active} delay={1500} size={18} style={{ left: left + cw + 14, top: top + ch * 0.78 }} />
      <Sparkle active={active} delay={2200} size={11} style={{ left: left + cw * 0.2, top: top + ch + 6 }} />
      <Sticker active={active} delay={200} hold={3400} wait={1300} style={{ left: Math.max(4, left - cw * 0.25), top: top + ch * 0.12 }}>
        <Chip tone="amber" text={slide.stickers.checked} icon={<Feather name="check" size={16} color={SHADES.carbon} />} />
      </Sticker>
      <Sticker active={active} delay={1000} hold={2800} wait={1700} style={{ right: Math.max(4, w - left - cw - cw * 0.3), top: top + ch * 0.5 }}>
        <Chip tone="dark" text={slide.stickers.clean} icon={<MaterialCommunityIcons name="creation" size={16} color={SHADES.amber} />} />
      </Sticker>
      <Sticker active={active} delay={1700} hold={3000} wait={1500} style={{ left: w * 0.12, top: Math.min(h - 44, top + ch - 20) }}>
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
