// Home hero marketing banners (constants/homeBanners.ts) — shown when no Admin → Home
// slide is published for the hero placement. 16px gutter, one 16:9 card at a time (radius
// 20, cream fallback), snapping per card; no overlay / gradient / text shadow (the photos
// keep an empty zone for the text). 'light' = text centred-left on a bright photo, solid
// amber pill; 'dark' = text bottom-left, amber text link (subtitle across the whole 78%).
// Fit: the text block is MEASURED and steps down until it fits the card — title 20 →
// title 17 → subtitle 12 → (last resort, e.g. large system font) subtitle hidden. The
// subtitle is always hidden under 300px of card width. Text is invisible until it fits.
// Auto-advance every 5s (looping), paused while touched and for 5s after release, only
// while the Home is focused (useFocusEffect), never with reduce motion. Dots 8px under the
// card, tappable. The whole card is the button (opens ctaHref through openAppRoute, like
// every Home link); the CTA is its visual label.
// expo-image: borderRadius + overflow:'hidden' on the wrapping View, NEVER on the image
// (Android). Plain RN Animated for the dot width — no Reanimated in the Home hero.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/AppText';
import { useReducedMotion } from '@/constants/motion';
import { HOME_BANNERS, type HomeBanner } from '@/constants/homeBanners';
import { openAppRoute } from '@/lib/navigation';

const SIDE = 16;
const ADVANCE_MS = 5000;
const SMALL_CARD = 300;
// Free space kept around the light block (top + bottom) / above the dark block.
const LIGHT_PAD = 8;
const DARK_TOP = 12;
const DARK_BOTTOM = 18;
const LAST_LEVEL = 3;
// Fixed-height card: system font size is honoured, but capped lower than the app's 1.3.
const FONT_CAP = 1.15;

const C = {
  amber: '#F4B400',
  carbon: '#1E1E1E',
  cream: '#FAFAF7',
  lightEyebrow: '#4A4A45',
  lightSub: '#3D3D38',
  darkMuted: '#E2DCCF',
  dotIdle: '#D6D0C4',
};

export default function HeroCarousel({ banners = HOME_BANNERS }: { banners?: HomeBanner[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const width = screenW - SIDE * 2;
  const height = Math.round((width * 9) / 16);
  const small = width < SMALL_CARD;
  const count = banners.length;

  const scrollRef = useRef<ScrollView>(null);
  const index = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  const touching = useRef(false);
  const [active, setActive] = useState(0);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const goTo = useCallback((i: number, animated = true) => {
    index.current = i;
    setActive(i);
    scrollRef.current?.scrollTo({ x: i * width, animated });
  }, [width]);

  // (Re)starts the 5s countdown — only when focused, not touched, several banners and no
  // reduce motion. Each tick schedules the next one.
  const schedule = useCallback(() => {
    stop();
    if (reduce || count < 2 || !focused.current || touching.current) return;
    timer.current = setTimeout(function tick() {
      goTo((index.current + 1) % count);
      timer.current = setTimeout(tick, ADVANCE_MS);
    }, ADVANCE_MS);
  }, [reduce, count, goTo, stop]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    schedule();
    return () => { focused.current = false; stop(); };
  }, [schedule, stop]));
  useEffect(() => stop, [stop]);

  const onTouchStart = useCallback(() => { touching.current = true; stop(); }, [stop]);
  const onTouchEnd = useCallback(() => { touching.current = false; schedule(); }, [schedule]);

  if (count === 0) return null;
  return (
    <View>
      <View style={{ width, height, alignSelf: 'center' }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onScrollBeginDrag={onTouchStart}
          onMomentumScrollEnd={e => {
            const i = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
            index.current = i;
            setActive(i);
            if (!touching.current) schedule();
          }}
        >
          {banners.map(b => (
            <BannerCard
              key={`${b.id}-${width}`}
              banner={b}
              width={width}
              height={height}
              small={small}
              onPress={() => openAppRoute(router, b.ctaHref)}
            />
          ))}
        </ScrollView>
      </View>
      {count > 1 && (
        <View style={s.dots}>
          {banners.map((b, i) => (
            <Dot
              key={b.id}
              active={i === active}
              reduce={reduce}
              label={`Show banner ${i + 1} of ${count}`}
              onPress={() => { goTo(i); schedule(); }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function BannerCard({ banner: b, width, height, small, onPress }: {
  banner: HomeBanner; width: number; height: number; small: boolean; onPress: () => void;
}) {
  const dark = b.variant === 'dark';
  // 0 = title 20 · 1 = title 17 · 2 = + subtitle 12 · 3 = subtitle hidden.
  const [level, setLevel] = useState(small ? LAST_LEVEL : 0);
  const [fits, setFits] = useState(false);
  const avail = dark ? height - DARK_TOP - DARK_BOTTOM : height - LIGHT_PAD * 2;
  const onContentLayout = (h: number) => {
    if (h > avail && level < LAST_LEVEL) setLevel(level + 1);
    else setFits(true);
  };
  // Safety net: never leave the text invisible if a step didn't trigger a new layout.
  useEffect(() => {
    const t = setTimeout(() => setFits(true), 400);
    return () => clearTimeout(t);
  }, [level]);
  const showSub = level < LAST_LEVEL;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={b.accessibilityLabel}
      style={({ pressed }) => [s.card, { width, height }, pressed && s.pressed]}
    >
      <Image
        source={b.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={b.focalPoint}
        accessible={false}
      />
      <View style={dark ? s.darkBlock : s.lightBlock} pointerEvents="none">
        <View style={!fits && s.hidden} onLayout={e => onContentLayout(e.nativeEvent.layout.height)}>
        <View style={s.eyebrowRow}>
          <Hexagon />
          <Text style={[s.eyebrow, { color: dark ? C.darkMuted : C.lightEyebrow }]} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
            {b.eyebrow}
          </Text>
        </View>
        <Text
          style={[s.title, level >= 1 && s.titleTight, { color: dark ? C.cream : C.carbon }]}
          numberOfLines={dark ? 3 : 4}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={FONT_CAP}
        >
          {b.title}
        </Text>
        {showSub && (
          <Text style={[s.sub, level >= 2 && s.subTight, { color: dark ? C.darkMuted : C.lightSub }]} numberOfLines={dark ? 2 : 4} maxFontSizeMultiplier={FONT_CAP}>
            {b.subtitle}
          </Text>
        )}
        {dark ? (
          <View style={s.link}>
            <Text style={s.linkText} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{b.ctaLabel}</Text>
            <Feather name="arrow-right" size={14} color={C.amber} />
          </View>
        ) : (
          <View style={s.pill}>
            <Text style={s.pillText} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{b.ctaLabel}</Text>
          </View>
        )}
        </View>
      </View>
    </Pressable>
  );
}

function Hexagon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" fill="none" stroke={C.amber} strokeWidth={2.2} strokeLinejoin="round" />
    </Svg>
  );
}

// Width 6 ↔ 18 animated in ~200ms (JS-driven: width can't use the native driver).
function Dot({ active, reduce, label, onPress }: { active: boolean; reduce: boolean; label: string; onPress: () => void }) {
  const w = useRef(new Animated.Value(active ? 18 : 6)).current;
  useEffect(() => {
    const to = active ? 18 : 6;
    if (reduce) { w.setValue(to); return; }
    Animated.timing(w, { toValue: to, duration: 200, useNativeDriver: false }).start();
  }, [active, reduce, w]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 4, bottom: 10, left: 2, right: 2 }}
      style={s.dotHit}
    >
      <Animated.View style={[s.dot, { width: w, backgroundColor: active ? C.amber : C.dotIdle }]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Rounded clip on the wrapper (never on the expo-image itself — Android).
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: C.cream },
  pressed: { opacity: 0.9 },

  lightBlock: { position: 'absolute', left: 20, top: 0, bottom: 0, maxWidth: '55%', justifyContent: 'center' },
  darkBlock: { position: 'absolute', left: 20, bottom: DARK_BOTTOM, maxWidth: '78%' },
  hidden: { opacity: 0 },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  title: { fontSize: 20, lineHeight: 23, fontWeight: '700', letterSpacing: -0.3 },
  titleTight: { fontSize: 17, lineHeight: 20 },
  sub: { fontSize: 13, lineHeight: 17, marginTop: 4 },
  subTight: { fontSize: 12, lineHeight: 16 },

  pill: {
    alignSelf: 'flex-start', marginTop: 8, height: 34, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: C.amber, justifyContent: 'center',
  },
  pillText: { fontSize: 13, fontWeight: '600', color: C.carbon },
  link: {
    alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: C.amber,
  },
  linkText: { fontSize: 13, fontWeight: '600', color: C.amber },

  // Dots 8px under the card (paddingTop of each tap area), centred.
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  dotHit: { paddingTop: 8, paddingHorizontal: 3 },
  dot: { height: 6, borderRadius: 3 },
});
