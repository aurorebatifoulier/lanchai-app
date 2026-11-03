import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
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
import { Slide1Art, Slide2Art, Slide3Art } from '@/components/onboarding/SlideArt';
import { setOnboardingComplete } from '@/lib/onboarding';
import { useOnboardingSlides, useLowestDailyPriceLak } from '@/lib/onboardingContent';

// Onboarding — "living cards" (validated mockup), shown ONCE per device (lib/onboarding.ts).
// FIXED proportions, identical on the 3 slides (validated schema):
//   • header (bee logo + LANCHAI, Skip on 1–2) at the top;
//   • visual area from ~16% to ~58% of the screen height, its card group centred;
//   • title + sub-line anchored at ~62%;
//   • the flexible empty space between the sub-line and the bottom bar (pagination +
//     next / Start exploring + Sign in), above the bottom safe area.
// Small screens: the title moves UP (fixed reserves, same for every slide — never below
// ~62%), and the visual area shrinks first. Nothing in the layout depends on a measurement
// that changes while a slide loads (highlight, stickers, count-up are all absolute). Cream slides 1–2 (dark status bar), carbon slide 3 (light).
// Loops pause off-screen / in background; reduce motion = static.

const VISUAL_TOP = 0.16;
const VISUAL_BOTTOM = 0.58;
const TITLE_TOP = 0.62;
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
  // ONE title position for all three slides, computed from FIXED reserves (never from a
  // measurement — nothing that loads, pops or counts can move it): at 62%, or higher on a
  // small screen so the tallest title block (3-line title + 2-line sub-line) and the
  // tallest bottom bar (slide 3) still fit.
  const titleTop = Math.min(H * TITLE_TOP, H - barBottom - BAR_RESERVE - 20 - TEXT_RESERVE);
  // Visual area 16% → 58%, shrinking first on small screens (keeps a gap to the title).
  const visualTop = Math.max(H * VISUAL_TOP, headerBottom + 8);
  const visualBottom = Math.min(H * VISUAL_BOTTOM, titleTop - H * 0.03);
  const art = { w: width - 2 * SIDE, h: Math.max(120, visualBottom - visualTop) };

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
          const artProps = { slide, active, w: art.w, h: art.h, scrollX, page: i, pageW: width };
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

              <View style={[s.visual, { top: visualTop, height: art.h }]}>
                {i === 0 && <Slide1Art {...artProps} priceLak={priceLak} />}
                {i === 1 && <Slide2Art {...artProps} />}
                {i === 2 && <Slide3Art {...artProps} />}
              </View>

              <View style={[s.text, { top: titleTop }]}>
                <HighlightTitle text={slide.title} dark={dark} />
                <Text style={[s.sub, dark && s.subDark]}>{slide.sub}</Text>
              </View>

              <View style={[s.bar, { bottom: barBottom }]}>
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
