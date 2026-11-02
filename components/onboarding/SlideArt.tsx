import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, ReduceMotion, cancelAnimation,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { useReducedMotion } from '@/constants/motion';
import { ONBOARDING_COPY as c } from '@/constants/onboardingCopy';
import { DASH, PATH_OPACITY } from '@/components/account/AccountHeader';
import type { OnboardingSlide } from '@/lib/onboardingContent';
import { PhotoCard, Sticker, Chip, hexPoints } from '@/components/onboarding/Parts';

// The animated middle of each onboarding slide, laid out on the art box (w × h).

const STAGGER = 180;

export function Slide1Art({ slide, active, w, h, priceLak }: {
  slide: OnboardingSlide; active: boolean; w: number; h: number; priceLak: number | null;
}) {
  const cw = Math.min(w * 0.44, h * 0.62);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-8} style={{ left: w * 0.06, top: h * 0.08 }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={6} delay={700} style={{ left: w * 0.5, top: h * 0.02 }} />
      <Sticker active={active} delay={0} style={{ left: w * 0.03, top: 0 }}>
        <View style={s.heart}><MaterialCommunityIcons name="heart" size={22} color={SHADES.amber} /></View>
      </Sticker>
      {priceLak != null && (
        <Sticker active={active} delay={STAGGER} style={{ right: w * 0.04, top: h * 0.64 }}>
          <Chip tone="carbon" text={c.priceChip(priceLak.toLocaleString('en-US'))} />
        </Sticker>
      )}
      <Sticker active={active} delay={STAGGER * 2} style={{ left: w * 0.12, top: h * 0.82 }}>
        <Chip tone="light" text={slide.stickers.chip} />
      </Sticker>
    </View>
  );
}

/**
 * Three small cards linked by the dotted bee trajectory (My Account style: DASH, fade
 * 3% → 30%) with the amber hexagon travelling along it (static with reduce motion).
 */
export function Slide2Art({ slide, active, w, h }: { slide: OnboardingSlide; active: boolean; w: number; h: number }) {
  const reduce = useReducedMotion();
  const cw = Math.min(w * 0.27, h * 0.36);
  const card1 = { x: w * 0.04, y: h * 0.44 };
  const card2 = { x: w * 0.36, y: h * 0.2 };
  const card3 = { x: w * 0.68, y: h * 0.0 };
  // One cubic from card 1 to card 3, passing by card 2.
  const P0 = { x: card1.x + cw * 0.95, y: card1.y + cw * 0.15 };
  const P1 = { x: card2.x - cw * 0.1, y: card2.y + cw * 1.6 };
  const P2 = { x: card2.x + cw * 1.3, y: card3.y + cw * 1.9 };
  const P3 = { x: card3.x + cw * 0.1, y: card3.y + cw * 1.25 };
  const d = `M ${P0.x},${P0.y} C ${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`;

  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false);
  }, [reduce, active, t]);
  const hexStyle = useAnimatedStyle(() => {
    const u = t.value; const v = 1 - u;
    const x = v * v * v * P0.x + 3 * v * v * u * P1.x + 3 * v * u * u * P2.x + u * u * u * P3.x;
    const y = v * v * v * P0.y + 3 * v * v * u * P1.y + 3 * v * u * u * P2.y + u * u * u * P3.y;
    return { transform: [{ translateX: x - 8 }, { translateY: y - 8 }] };
  });

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
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-3} label={slide.stickers.step1} style={{ left: card1.x, top: card1.y }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={-6} delay={500} dark label={slide.stickers.step2} style={{ left: card2.x, top: card2.y }} />
      <PhotoCard source={slide.photos[2]} width={cw} rotate={7} delay={1000} label={slide.stickers.step3} style={{ left: card3.x, top: card3.y }} />
      {!reduce && (
        <Animated.View style={[s.hex, hexStyle]} pointerEvents="none">
          <Svg width={16} height={16} viewBox="0 0 20 20"><HexPoly /></Svg>
        </Animated.View>
      )}
      <Sticker active={active} delay={STAGGER} style={{ right: w * 0.04, top: h * 0.8 }}>
        <Chip tone="light" text={slide.stickers.place} icon={<Feather name="map-pin" size={15} color={SHADES.amberDeep} />} />
      </Sticker>
    </View>
  );
}

function HexPoly() {
  return <Polygon points={hexPoints(10, 10, 9.5)} fill={SHADES.amber} />;
}

export function Slide3Art({ slide, active, w, h }: { slide: OnboardingSlide; active: boolean; w: number; h: number }) {
  const cw = Math.min(w * 0.5, h * 0.68);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-2} style={{ left: (w - cw) / 2, top: h * 0.02 }} />
      <Sticker active={active} delay={0} style={{ left: w * 0.08, top: h * 0.08 }}>
        <Chip tone="amber" text={slide.stickers.checked} icon={<Feather name="check" size={16} color={SHADES.carbon} />} />
      </Sticker>
      <Sticker active={active} delay={STAGGER} style={{ right: w * 0.04, top: h * 0.44 }}>
        <Chip tone="dark" text={slide.stickers.clean} icon={<MaterialCommunityIcons name="creation" size={16} color={SHADES.amber} />} />
      </Sticker>
      <Sticker active={active} delay={STAGGER * 2} style={{ left: w * 0.14, top: h * 0.84 }}>
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
