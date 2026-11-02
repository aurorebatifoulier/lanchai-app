import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing, ReduceMotion, cancelAnimation } from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { useReducedMotion } from '@/constants/motion';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { setOnboardingComplete } from '@/lib/onboarding';
import { useOnboardingSlides, type OnboardingSlide } from '@/lib/onboardingContent';

// Onboarding (validated mockup, first launch only): 3 slides — photo on the top ~2/3 with
// a slow zoom (off with reduce motion), a bottom card (white; carbon on the last one) with
// title, text, dots and the button. Photos / texts from Admin → Onboarding
// (config/onboarding), bundled placeholders otherwise. Skip / Start exploring → Home as a
// guest; "I already have an account · Sign in" → sign-in.

const COPY = {
  skip: 'Skip',
  next: 'Next',
  start: 'Start exploring',
  haveAccount: 'I already have an account · ',
  signIn: 'Sign in',
};

function ZoomPhoto({ slide, active, height }: { slide: OnboardingSlide; active: boolean; height: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(scale); scale.value = 1; return; }
    scale.value = withRepeat(
      withTiming(1.08, { duration: 8000, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      -1, true,
    );
  }, [active, reduce, scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={{ height, overflow: 'hidden', backgroundColor: SHADES.carbonLight }}>
      <Animated.View style={[StyleSheet.absoluteFill, anim]}>
        <Image source={slide.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { width, height } = useWindowDimensions();
  const slides = useOnboardingSlides();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;
  const photoH = Math.round(height * 0.64);

  const finish = (to: '/' | '/login') => {
    setOnboardingComplete();
    router.replace(to);
  };
  const next = () => {
    if (index >= last) { finish('/'); return; }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {slides.map((slide, i) => {
          const dark = i === last;
          const [lead, ...rest] = splitLast(slide.title);
          return (
            <View key={i} style={{ width, height }}>
              <ZoomPhoto slide={slide} active={i === index} height={photoH} />
              <View style={[s.card, dark && s.cardDark, { minHeight: height - photoH + 28, paddingBottom: screen.bottom + 20 }]}>
                <Text style={[s.title, dark && s.titleDark]}>
                  {dark && rest.length ? <>{lead} <Text style={s.titleAccent}>{rest.join(' ')}</Text></> : slide.title}
                </Text>
                <Text style={[s.text, dark && s.textDark]}>{slide.text}</Text>
                <View style={{ flex: 1 }} />
                <Dots count={slides.length} index={index} />
                {dark ? (
                  <>
                    <PressScale style={[UI.btnPrimary, s.btn]} onPress={() => finish('/')}>
                      <Text style={UI.btnPrimaryText}>{COPY.start}</Text>
                    </PressScale>
                    <Text style={s.haveAccount} onPress={() => finish('/login')}>
                      {COPY.haveAccount}<Text style={s.signIn}>{COPY.signIn}</Text>
                    </Text>
                  </>
                ) : (
                  <PressScale style={[UI.btnPrimary, s.btn, s.btnCarbon]} onPress={next}>
                    <Text style={[UI.btnPrimaryText, { color: SHADES.white }]}>{COPY.next}</Text>
                  </PressScale>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {index < last && (
        <TouchableOpacity style={[s.skip, { top: screen.top + 10 }]} onPress={() => finish('/')} hitSlop={10}>
          <Text style={s.skipText}>{COPY.skip}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** "Checked. Clean. Yours for a while." → the last sentence is highlighted on the dark card. */
function splitLast(title: string): string[] {
  const parts = title.match(/[^.!?]+[.!?]?/g)?.map(p => p.trim()).filter(Boolean) ?? [title];
  if (parts.length < 2) return [title];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View style={s.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.dot, i === index && s.dotOn]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  card: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: SHADES.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 26,
  },
  cardDark: { backgroundColor: SHADES.carbon },
  title: { ...TYPE.screenTitle, fontWeight: '800', color: SHADES.carbon },
  titleDark: { color: SHADES.white },
  titleAccent: { color: SHADES.amber },
  text: { ...TYPE.body, fontSize: 15, lineHeight: 22, color: SHADES.carbonMuted, marginTop: 10 },
  textDark: { color: SHADES.carbonFaint },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 18, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SHADES.carbonFaint },
  dotOn: { width: 26, backgroundColor: SHADES.amber },
  btn: { alignSelf: 'stretch' },
  btnCarbon: { backgroundColor: SHADES.carbon },
  haveAccount: { ...TYPE.secondary, color: SHADES.carbonFaint, textAlign: 'center', marginTop: 14 },
  signIn: { fontWeight: '700', color: SHADES.amber },
  skip: {
    position: 'absolute', right: 16, paddingHorizontal: 12, height: 30, borderRadius: 15,
    justifyContent: 'center', backgroundColor: 'rgba(30,30,30,0.35)',
  },
  skipText: { ...TYPE.small, color: SHADES.white },
});
