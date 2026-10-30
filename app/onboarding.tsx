import React, { useRef, useState } from 'react';
import { SHADES } from '@/constants/brandShades';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/Colors';
import { setOnboardingComplete } from '@/lib/onboarding';
import PressScale from '@/components/PressScale';

// ── Slides ──────────────────────────────────────────────────────────────────────
// Background photos are placeholders (picsum.photos, seeded so each slide is stable
// across reloads) — swap for real LANCHAI photography later.

interface Slide {
  title: string;
  subtitle: string;
  image: string;
}

const SLIDES: Slide[] = [
  {
    title: 'Rent what you need',
    subtitle: 'Hundreds of items to rent near you, without buying them.',
    image: 'https://picsum.photos/seed/lanchai1/800/1200',
  },
  {
    title: 'Book in a few clicks',
    subtitle: 'Pick your dates, book and pay in store. Simple and fast.',
    image: 'https://picsum.photos/seed/lanchai2/800/1200',
  },
  {
    title: 'Easy pick-up & return',
    subtitle: 'Collect and return your items easily, wherever you are.',
    image: 'https://picsum.photos/seed/lanchai3/800/1200',
  },
];

const LAST_INDEX = SLIDES.length - 1;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  // Tracks the gesture's direction (not just its start/end position) so a backward
  // swipe on the last slide can never be mistaken for a forward one — updated on every
  // onScroll tick during the drag, read once the finger lifts.
  const lastOffsetX = useRef(0);
  const dragDirection = useRef<'forward' | 'backward' | null>(null);

  const finish = () => {
    setOnboardingComplete();
    router.replace('/login');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          if (x > lastOffsetX.current) dragDirection.current = 'forward';
          else if (x < lastOffsetX.current) dragDirection.current = 'backward';
          lastOffsetX.current = x;
        }}
        onScrollBeginDrag={() => {
          dragDirection.current = null;
        }}
        onScrollEndDrag={() => {
          // Only a forward (left) swipe attempted while already on the last slide —
          // i.e. trying to page to a 4th slide that doesn't exist — completes
          // onboarding. A backward swipe on the last slide always pages back to slide
          // 2 normally; scrolling itself is never disabled.
          if (activeSlide === LAST_INDEX && dragDirection.current === 'forward') {
            finish();
          }
        }}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveSlide(i);
        }}
      >
        {SLIDES.map((slide, i) => (
          <ImageBackground key={i} source={{ uri: slide.image }} style={{ width, flex: 1 }} resizeMode="cover">
            <View style={styles.overlay} />
            <View style={[styles.slideContent, { paddingBottom: insets.bottom + 140 }]}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
            </View>
          </ImageBackground>
        ))}
      </ScrollView>

      {activeSlide < LAST_INDEX && (
        <TouchableOpacity
          style={[styles.skipBtn, { top: insets.top + 8 }]}
          onPress={finish}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.overlayFooter, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeSlide && styles.dotActive]} />
          ))}
        </View>

        <PressScale
          style={[styles.ctaBtn, activeSlide !== LAST_INDEX && styles.ctaBtnHidden]}
          onPress={finish}
          activeOpacity={0.85}
          disabled={activeSlide !== LAST_INDEX}
        >
          <Text style={styles.ctaText}>Get started</Text>
        </PressScale>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHADES.carbon,
  },
  skipBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '700',
    color: SHADES.white,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: SHADES.white,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: SHADES.white,
    textAlign: 'center',
    lineHeight: 20,
    alignSelf: 'center',
    maxWidth: 320,
    opacity: 0.9,
  },
  overlayFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 20,
    backgroundColor: COLORS.amber,
  },
  ctaBtn: {
    height: 54,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnHidden: {
    opacity: 0,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
