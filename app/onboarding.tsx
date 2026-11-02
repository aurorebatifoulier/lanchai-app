import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
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
// Cream slides 1–2, carbon slide 3. Top: LANCHAI + Skip (1–2). Middle: tilted photo cards
// floating slowly + stickers popping in one after the other. Bottom: highlighted title,
// sub-line, hexagon pagination, round carbon "next" (1–2) or Start exploring + Sign in (3).
// Swipe both ways, no auto-advance. Reduce motion: no float / travelling hexagon, stickers
// shown statically. Content from Admin → Onboarding (lib/onboardingContent.ts).

export default function OnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { width, height } = useWindowDimensions();
  const slides = useOnboardingSlides();
  const priceLak = useLowestDailyPriceLak();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;

  const artW = width - 40;
  const artH = Math.round(Math.min(height * 0.44, artW * 1.05));

  const finish = (to: '/' | '/login') => {
    setOnboardingComplete();
    router.replace(to);
  };
  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  return (
    <View style={[s.root, index === last && s.rootDark]}>
      <StatusBar style={index === last ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {slides.map((slide, i) => {
          const dark = i === last;
          const active = i === index;
          return (
            <View key={i} style={[s.page, dark && s.rootDark, { width, paddingTop: screen.top + 10, paddingBottom: screen.bottom + 16 }]}>
              <View style={s.top}>
                <Text style={[s.wordmark, dark && s.wordmarkDark]}>{c.wordmark}</Text>
                {!dark && (
                  <TouchableOpacity onPress={() => finish('/')} hitSlop={10}>
                    <Text style={s.skip}>{c.skip}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[s.art, { height: artH }]}>
                {i === 0 && <Slide1Art slide={slide} active={active} w={artW} h={artH} priceLak={priceLak} />}
                {i === 1 && <Slide2Art slide={slide} active={active} w={artW} h={artH} />}
                {i === 2 && <Slide3Art slide={slide} active={active} w={artW} h={artH} />}
              </View>

              <View style={s.bottom}>
                <HighlightTitle text={slide.title} dark={dark} />
                <Text style={[s.sub, dark && s.subDark]}>{slide.sub}</Text>
                <View style={{ flex: 1 }} />
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
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  rootDark: { backgroundColor: SHADES.carbon },
  page: { flex: 1, paddingHorizontal: 20, backgroundColor: SHADES.cream },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  wordmark: { fontSize: 17, fontWeight: '800', letterSpacing: 3, color: SHADES.carbon },
  wordmarkDark: { color: SHADES.white },
  skip: { ...TYPE.body, fontWeight: '600', color: SHADES.carbonMuted },
  art: { marginTop: 18 },
  bottom: { flex: 1, marginTop: 18 },
  sub: { ...TYPE.body, fontSize: 15, lineHeight: 22, color: SHADES.carbonMuted, marginTop: 10 },
  subDark: { color: SHADES.carbonFaint },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  next: { width: 60, height: 60, borderRadius: 30, backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  dotsCenter: { alignItems: 'center', marginBottom: 16 },
  start: { alignSelf: 'stretch' },
  member: { ...TYPE.secondary, color: SHADES.carbonFaint, textAlign: 'center', marginTop: 14 },
  signIn: { fontWeight: '700', color: SHADES.amber },
});
