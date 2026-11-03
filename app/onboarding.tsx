import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { setStatusBarStyle } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { ONBOARDING_COPY as c } from '@/constants/onboardingCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { HighlightTitle, HexDots } from '@/components/onboarding/Parts';
import { Slide1Art, Slide2Art, Slide3Art, artGroupBottom } from '@/components/onboarding/SlideArt';
import { setOnboardingComplete } from '@/lib/onboarding';
import { useOnboardingSlides, useLowestDailyPriceLak } from '@/lib/onboardingContent';

// Onboarding — "living cards" (validated mockup), shown ONCE per device (lib/onboarding.ts).
// FIXED proportions, identical on the 3 slides (validated schema):
//   • header (bee logo + LANCHAI, Skip on 1–2) at the top;
//   • visual area from ~16% to ~58% of the screen height, its card group centred;
//   • title + sub-line placed per slide so the gaps visual → title and sub-line → bottom
//     bar are EQUAL (~66–67% on slides 1–2; slide 3 from its own, taller bar);
//   • bottom bar (pagination + next / Start exploring + Sign in) above the safe area.
// Small screens: ≥ 32 px visual → title and ≥ 24 px sub-line → bar, the visual area
// shrinks first. The text is measured once (hidden until then) — nothing that loads, pops
// or counts can move it (highlight, stickers, count-up are all absolute). Cream slides 1–2 (dark status bar), carbon slide 3 (light).
// Loops pause off-screen / in background; reduce motion = static.

const VISUAL_TOP = 0.16;
const VISUAL_BOTTOM = 0.58;
const TITLE_TOP = 0.62;
/** Minimum gap between the visual group and the title. */
const TITLE_GAP = 40;
/** Small screens: minimum gaps visual → title and sub-line → bottom bar. */
const MIN_GAP_TITLE = 32;
const MIN_GAP_BAR = 24;
/** Fixed reserves (px) for the tallest title block and the tallest bottom bar. */
const TEXT_RESERVE = 3 * 32 + 10 + 2 * 22;
const BAR_RESERVE = 20 + 16 + 46 + 14 + 18;
const SIDE = 20;
// The Home header's bee logo, cropped + transparent (carbon wings / white wings).
const LOGO = {
  dark: require('@/assets/images/lanchai-mark-onb.png'),
  light: require('@/assets/images/lanchai-mark-onb-light.png'),
};

export default function OnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const win = useWindowDimensions();
  const width = win.width;
  const slides = useOnboardingSlides();
  const priceLak = useLowestDailyPriceLak();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [H, setH] = useState(win.height);
  // Measured once per page (static content): the text block and the bottom bar.
  const [textH, setTextH] = useState<Record<number, number>>({});
  const [barH, setBarH] = useState<Record<number, number>>({});
  const last = slides.length - 1;

  const applyBar = useCallback((i: number) => setStatusBarStyle(i === last ? 'light' : 'dark', true), [last]);
  useFocusEffect(useCallback(() => { applyBar(index); }, [applyBar, index]));

  const settle = useCallback((i: number) => {
    setIndex(prev => (prev === i ? prev : i));
    applyBar(i);
  }, [applyBar]);
  const onScroll = useAnimatedScrollHandler({
    onScroll: e => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: e => { runOnJS(settle)(Math.round(e.contentOffset.x / width)); },
  });

  const finish = (to: '/' | '/login') => {
    setOnboardingComplete();
    setStatusBarStyle('dark', true);
    router.replace(to);
  };
  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    settle(i);
  };
  const headerBottom = screen.top + 8 + 36;
  const barBottom = screen.bottom + 14;
  // Visual area (unchanged): 16% → ~58%, from fixed reserves so it never moves.
  const refTitle = Math.min(H * TITLE_TOP, H - barBottom - BAR_RESERVE - 20 - TEXT_RESERVE);
  const visualTop = Math.max(H * VISUAL_TOP, headerBottom + 8);
  const visualBottom = Math.min(H * VISUAL_BOTTOM, refTitle - TITLE_GAP);
  const artW = width - 2 * SIDE;
  const baseArtH = Math.max(120, visualBottom - visualTop);

  /**
   * Text position PER SLIDE (each has its own bar): the space between the lowest point of
   * the visual group (card or sticker) and the top of the bottom bar, minus the text block,
   * is split into two EQUAL gaps (visual → title, sub-line → bar). Small screens: at least
   * 32 px / 24 px — the visual area shrinks first. Text block and bar are measured ONCE
   * (static content); the text stays invisible until then, so it never jumps.
   */
  const layoutFor = (i: number) => {
    const tH = textH[i]; const bH = barH[i];
    let artH = baseArtH;
    if (tH == null || bH == null) return { artH, titleTop: H * TITLE_TOP, ready: false };
    const barTop = H - barBottom - bH;
    let groupBottom = visualTop + artGroupBottom(i, artW, artH, width);
    for (let k = 0; k < 4; k++) {
      const deficit = groupBottom + MIN_GAP_TITLE + tH + MIN_GAP_BAR - barTop;
      if (deficit <= 0.5 || artH <= 120) break;
      artH = Math.max(120, artH - deficit);
      groupBottom = visualTop + artGroupBottom(i, artW, artH, width);
    }
    const free = barTop - groupBottom - tH;
    const gap = Math.min(Math.max(MIN_GAP_TITLE, free / 2), Math.max(MIN_GAP_TITLE, free - MIN_GAP_BAR));
    return { artH, titleTop: groupBottom + gap, ready: true };
  };
  const measure = (set: typeof setTextH, i: number) => (e: LayoutChangeEvent) => {
    const v = e.nativeEvent.layout.height;
    set(prev => (prev[i] != null && Math.abs(prev[i] - v) < 1 ? prev : { ...prev, [i]: v }));
  };

  return (
    <View style={[s.root, index === last && s.dark]} onLayout={e => setH(e.nativeEvent.layout.height)}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // No scroll indicator / Android edge effect.
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {slides.map((slide, i) => {
          const dark = i === last;
          const active = i === index;
          const L = layoutFor(i);
          const artProps = { slide, active, w: artW, h: L.artH, scrollX, page: i, pageW: width };
          return (
            <View key={i} style={[s.page, dark && s.dark, { width, height: H }]}>
              <View style={[s.top, { top: screen.top + 8 }]}>
                <View style={s.brand}>
                  <Image source={dark ? LOGO.light : LOGO.dark} style={s.logo} contentFit="contain" />
                  <Text style={[s.wordmark, dark && s.wordmarkDark]}>{c.wordmark}</Text>
                </View>
                {!dark && (
                  <TouchableOpacity onPress={() => finish('/')} hitSlop={10}>
                    <Text style={s.skip}>{c.skip}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[s.visual, { top: visualTop, height: L.artH }]}>
                {i === 0 && <Slide1Art {...artProps} priceLak={priceLak} />}
                {i === 1 && <Slide2Art {...artProps} />}
                {i === 2 && <Slide3Art {...artProps} />}
              </View>

              <View style={[s.text, { top: L.titleTop, opacity: L.ready ? 1 : 0 }]} onLayout={measure(setTextH, i)}>
                <HighlightTitle text={slide.title} dark={dark} />
                <Text style={[s.sub, dark && s.subDark]}>{slide.sub}</Text>
              </View>

              <View style={[s.bar, { bottom: barBottom }]} onLayout={measure(setBarH, i)}>
                {dark ? (
                  <>
                    <View style={s.dotsCenter}><HexDots count={slides.length} index={index} dark /></View>
                    <PressScale style={[UI.btnPrimary, s.start]} onPress={() => finish('/')}>
                      <Text style={UI.btnPrimaryText}>{c.start}</Text>
                    </PressScale>
                    <Text style={s.member} onPress={() => finish('/login')}>
                      {c.member}<Text style={s.signIn}>{c.signIn}</Text>
                    </Text>
                  </>
                ) : (
                  <View style={s.navRow}>
                    <HexDots count={slides.length} index={index} />
                    <PressScale style={s.next} onPress={() => goTo(i + 1)} accessibilityLabel={c.next}>
                      <Feather name="arrow-right" size={24} color={SHADES.amber} />
                    </PressScale>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  dark: { backgroundColor: SHADES.carbon },
  // Each page CLIPS its own content: entering / parallax-offset cards never show on a
  // neighbouring slide.
  page: { backgroundColor: SHADES.cream, overflow: 'hidden' },
  top: { position: 'absolute', left: SIDE, right: SIDE, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 35, height: 22 },
  wordmark: { fontSize: 17, fontWeight: '800', letterSpacing: 3, color: SHADES.carbon },
  wordmarkDark: { color: SHADES.white },
  skip: { ...TYPE.body, fontWeight: '600', color: SHADES.carbonMuted },
  visual: { position: 'absolute', left: SIDE, right: SIDE },
  text: { position: 'absolute', left: SIDE, right: SIDE },
  sub: { ...TYPE.body, fontSize: 15, lineHeight: 22, color: SHADES.carbonMuted, marginTop: 10 },
  subDark: { color: SHADES.carbonFaint },
  bar: { position: 'absolute', left: SIDE, right: SIDE },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  next: { width: 60, height: 60, borderRadius: 30, backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  dotsCenter: { alignItems: 'center', marginBottom: 16 },
  start: { alignSelf: 'stretch' },
  member: { ...TYPE.secondary, color: SHADES.carbonFaint, textAlign: 'center', marginTop: 14 },
  signIn: { fontWeight: '700', color: SHADES.amber },
});
