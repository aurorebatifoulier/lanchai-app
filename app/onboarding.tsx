import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
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
// Each page: header (LANCHAI + Skip on 1–2) at the top → the animated visual in the
// flexible middle (≤ 55% of the screen, centred) → title + sub-line anchored just above the
// bottom bar (hexagon pagination + round next / Start exploring + Sign in) → bottom safe
// area. Cream slides 1–2 (dark status bar), carbon slide 3 (light status bar). Swipe both
// ways, no auto-advance. Loops pause off-screen / in background; reduce motion = static.

export default function OnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { width, height } = useWindowDimensions();
  const slides = useOnboardingSlides();
  const priceLak = useLowestDailyPriceLak();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  // Visual area measured PER PAGE (the bottom block of slide 3 is taller).
  const [arts, setArts] = useState<Record<number, { w: number; h: number }>>({});
  const last = slides.length - 1;

  // Status bar follows the active slide (the screens below may have set another style).
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

  const onArtLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setArts(prev => {
      const p = prev[i];
      return p && Math.abs(p.w - w) < 1 && Math.abs(p.h - h) < 1 ? prev : { ...prev, [i]: { w, h } };
    });
  };

  return (
    <View style={[s.root, index === last && s.dark]}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // No scroll indicator / Android edge effect — that thin grey line on the right.
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
          const art = arts[i];
          const artProps = art ? { slide, active, w: art.w, h: art.h, scrollX, page: i, pageW: width } : null;
          return (
            <View key={i} style={[s.page, dark && s.dark, { width, paddingTop: screen.top + 8, paddingBottom: screen.bottom + 14 }]}>
              <View style={s.top}>
                <Text style={[s.wordmark, dark && s.wordmarkDark]}>{c.wordmark}</Text>
                {!dark && (
                  <TouchableOpacity onPress={() => finish('/')} hitSlop={10}>
                    <Text style={s.skip}>{c.skip}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Flexible middle: the visual, centred, at most ~55% of the screen. */}
              <View style={s.middle}>
                <View style={[s.art, { maxHeight: height * 0.55 }]} onLayout={onArtLayout(i)}>
                  {artProps && i === 0 && <Slide1Art {...artProps} priceLak={priceLak} />}
                  {artProps && i === 1 && <Slide2Art {...artProps} />}
                  {artProps && i === 2 && <Slide3Art {...artProps} />}
                </View>
              </View>

              {/* Title + sub-line anchored just above the bottom bar. */}
              <View style={s.text}>
                <HighlightTitle text={slide.title} dark={dark} />
                <Text style={[s.sub, dark && s.subDark]}>{slide.sub}</Text>
              </View>

              {dark ? (
                <View>
                  <View style={s.dotsCenter}><HexDots count={slides.length} index={index} dark /></View>
                  <PressScale style={[UI.btnPrimary, s.start]} onPress={() => finish('/')}>
                    <Text style={UI.btnPrimaryText}>{c.start}</Text>
                  </PressScale>
                  <Text style={s.member} onPress={() => finish('/login')}>
                    {c.member}<Text style={s.signIn}>{c.signIn}</Text>
                  </Text>
                </View>
              ) : (
                <View style={s.navRow}>
                  <HexDots count={slides.length} index={index} />
                  <PressScale style={s.next} onPress={() => goTo(i + 1)} accessibilityLabel={c.next}>
                    <Feather name="arrow-right" size={24} color={SHADES.amber} />
                  </PressScale>
                </View>
              )}
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
  // neighbouring slide, and no edge of the next page shows at rest.
  page: { flex: 1, paddingHorizontal: 20, backgroundColor: SHADES.cream, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  wordmark: { fontSize: 17, fontWeight: '800', letterSpacing: 3, color: SHADES.carbon },
  wordmarkDark: { color: SHADES.white },
  skip: { ...TYPE.body, fontWeight: '600', color: SHADES.carbonMuted },
  // Leftover space goes ABOVE the visual (under the header), never between it and the
  // title: the visual hugs the title with a ~24–32 px gap.
  middle: { flex: 1, justifyContent: 'flex-end', paddingTop: 8, paddingBottom: 12 },
  art: { flex: 1, width: '100%' },
  text: { marginBottom: 22 },
  sub: { ...TYPE.body, fontSize: 15, lineHeight: 22, color: SHADES.carbonMuted, marginTop: 10 },
  subDark: { color: SHADES.carbonFaint },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  next: { width: 60, height: 60, borderRadius: 30, backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  dotsCenter: { alignItems: 'center', marginBottom: 16 },
  start: { alignSelf: 'stretch' },
  member: { ...TYPE.secondary, color: SHADES.carbonFaint, textAlign: 'center', marginTop: 14 },
  signIn: { fontWeight: '700', color: SHADES.amber },
});
