// Home hero carousel: admin hero slides + built-in marketing banners in ONE admin order
// (lib/heroItems.ts — the Home passes the visible items, null while loading = a cream
// placeholder of the same size). 16px gutter, one 1.9:1 card at a time (radius 20, cream
// fallback), snapping per card. Admin slides = the shared <AdminSlideCard> in the same
// frame (photo cover, their own text layout). Built-in banners: no overlay / gradient /
// text shadow (the photos keep an empty zone for the text). 'light' = text centred-left on
// a bright photo, small amber pill; 'dark' = text bottom-left, amber text link. Text zone =
// the banner's `textWidth` (default 0.45 light / 0.58 dark) of the card width, from its
// left edge. Type: eyebrow 12, title 18/21, subtitle 12/16, ≤ 2 lines each; gaps
// eyebrow → title 8, title → subtitle 6, subtitle → pill 14 (never reduced to fit). Dark:
// the CTA link (11px, 1px underline) sits bottom-RIGHT, aligned with the text block bottom.
// Fit: the block height and the title / subtitle line counts are MEASURED and the type
// steps down until it fits — title 18 → 16 → 14 while it needs > 2 lines; subtitle hidden
// ONLY if the block is still taller than the card (last resort, e.g. large system font);
// always hidden under 300px of card width. Text invisible until it fits.
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
import { HOME_COPY } from '@/constants/homeCopy';
import { SHADES } from '@/constants/brandShades';
import { DEFAULT_TEXT_WIDTH, type HomeBanner } from '@/constants/homeBanners';
import type { HeroEntry } from '@/lib/heroItems';
import { openAppRoute } from '@/lib/navigation';
import AdminSlideCard from '@/components/home/AdminSlideCard';

const SIDE = 16;
const ADVANCE_MS = 5000;
const HERO_RATIO = 1.9;
const SMALL_CARD = 300;
// Free space kept around the light block (top + bottom) / above the dark block.
const LIGHT_PAD = 8;
const DARK_TOP = 12;
const DARK_BOTTOM = 18;
// Title steps: 18/21 → 16/19 → 14/17.
const TITLE_STEPS = [{ fontSize: 18, lineHeight: 21 }, { fontSize: 16, lineHeight: 19 }, { fontSize: 14, lineHeight: 17 }];
const TEXT_LEFT = 20;
// Title and subtitle: 2 lines max each (a longer one steps the type down).
const MAX_LINES = 2;
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

export default function HeroCarousel({ items, showDraft }: {
  items: HeroEntry<HomeBanner>[] | null;
  /** Admin preview: unpublished items are marked "Draft". */
  showDraft?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const width = screenW - SIDE * 2;
  // 1.9:1 (≈173px on a 328px card) — admin slides use the same frame.
  const height = Math.round(width / HERO_RATIO);
  const small = width < SMALL_CARD;
  const list = items ?? [];
  const count = list.length;

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
  // The list changed (data loaded, admin preview toggled): back to the first card.
  const listKey = list.map(e => e.key).join('|');
  useEffect(() => {
    if (index.current === 0) return;
    index.current = 0;
    setActive(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [listKey]);

  const onTouchStart = useCallback(() => { touching.current = true; stop(); }, [stop]);
  const onTouchEnd = useCallback(() => { touching.current = false; schedule(); }, [schedule]);

  if (items === null) {
    return <View style={[s.card, s.placeholder, { width, height }]} />;
  }
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
          {list.map(e => (e.kind === 'slide' ? (
            <AdminSlideCard key={e.key} slide={e.slide} showDraft={showDraft} style={[s.card, s.slideCard, { width, height }]} />
          ) : (
            <BannerCard
              key={`${e.key}-${width}`}
              banner={e.banner}
              width={width}
              height={height}
              small={small}
              draft={!!showDraft && !e.published}
              onPress={() => openAppRoute(router, e.banner.ctaHref)}
            />
          )))}
        </ScrollView>
      </View>
      {count > 1 && (
        <View style={s.dots}>
          {list.map((e, i) => (
            <Dot
              key={e.key}
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

function BannerCard({ banner: b, width, height, small, draft, onPress }: {
  banner: HomeBanner; width: number; height: number; small: boolean; draft: boolean; onPress: () => void;
}) {
  const dark = b.variant === 'dark';
  // Text zone = textWidth × card width from the card's left edge (the 20px inset included).
  const zone = b.textWidth ?? DEFAULT_TEXT_WIDTH[b.variant];
  const textW = Math.max(80, Math.round(width * zone) - TEXT_LEFT);
  // Two independent steps: the title shrinks while it needs more than 2 lines; the
  // subtitle is hidden ONLY if the block is still taller than the card (last resort).
  const [titleStep, setTitleStep] = useState(0);
  const [subHidden, setSubHidden] = useState(small);
  const [fits, setFits] = useState(false);
  const showSub = !subHidden;
  const level = titleStep * 2 + (subHidden ? 1 : 0);
  // Measures of the CURRENT step: block height + title / subtitle line counts (measured
  // without a line limit; the 2-line limit applies once it fits).
  const [m, setM] = useState<{ level: number; h?: number; t?: number; s?: number }>({ level });
  const avail = dark ? height - DARK_TOP - DARK_BOTTOM : height - LIGHT_PAD * 2;
  useEffect(() => {
    if (fits || m.level !== level || m.h == null || m.t == null || (showSub && m.s == null)) return;
    if (m.t > MAX_LINES && titleStep < TITLE_STEPS.length - 1) {
      setTitleStep(titleStep + 1);
      setM({ level: (titleStep + 1) * 2 + (subHidden ? 1 : 0) });
    } else if (m.h > avail && showSub) {
      setSubHidden(true);
      setM({ level: titleStep * 2 + 1 });
    } else setFits(true);
  }, [m, level, fits, avail, showSub, subHidden, titleStep]);
  // Safety net: never leave the text invisible if a step didn't trigger a new measure.
  useEffect(() => {
    const t = setTimeout(() => setFits(true), 400);
    return () => clearTimeout(t);
  }, [level]);
  // Dev only: which fit step each banner ended on (Metro log) — to tune `textWidth`.
  useEffect(() => {
    if (!fits || !__DEV__) return;
    console.log(`[hero fit] ${b.id} @${width}px: title ${TITLE_STEPS[titleStep].fontSize}px${subHidden ? ', subtitle HIDDEN' : ''}`);
  }, [fits, b.id, width, titleStep, subHidden]);
  const lines = fits ? MAX_LINES : undefined;
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
      {draft && <View style={s.draft}><Text style={s.draftText}>{HOME_COPY.adminDraft}</Text></View>}
      <View style={[dark ? s.darkBlock : s.lightBlock, { width: textW }]} pointerEvents="none">
        <View
          style={!fits && s.hidden}
          onLayout={e => { const h = e.nativeEvent.layout.height; setM(x => (x.level === level ? { ...x, h } : x)); }}
        >
          <View style={s.eyebrowRow}>
            <Hexagon />
            <Text style={[s.eyebrow, { color: dark ? C.darkMuted : C.lightEyebrow }]} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
              {b.eyebrow}
            </Text>
          </View>
          <Text
            style={[s.title, TITLE_STEPS[titleStep], { color: dark ? C.cream : C.carbon }]}
            numberOfLines={lines}
            adjustsFontSizeToFit={fits}
            minimumFontScale={0.85}
            maxFontSizeMultiplier={FONT_CAP}
            onTextLayout={e => { const t = e.nativeEvent.lines.length; setM(x => (x.level === level ? { ...x, t } : x)); }}
          >
            {b.title}
          </Text>
          {showSub && (
            <Text
              style={[s.sub, { color: dark ? C.darkMuted : C.lightSub }]}
              numberOfLines={lines}
              maxFontSizeMultiplier={FONT_CAP}
              onTextLayout={e => { const n = e.nativeEvent.lines.length; setM(x => (x.level === level ? { ...x, s: n } : x)); }}
            >
              {b.subtitle}
            </Text>
          )}
          {!dark && (
            <View style={s.pill}>
              <Text style={s.pillText} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{b.ctaLabel}</Text>
            </View>
          )}
        </View>
      </View>
      {/* Dark: the CTA link sits in the bottom-right corner, bottom aligned with the text
          block (the whole card is the touch target). */}
      {dark && (
        <View style={[s.link, !fits && s.hidden]} pointerEvents="none">
          <Text style={s.linkText} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{b.ctaLabel}</Text>
          <Feather name="arrow-right" size={12} color={C.amber} />
        </View>
      )}
    </Pressable>
  );
}

function Hexagon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
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
  // Admin slide: dark frame behind its photo (AdminSlideCard's own background).
  slideCard: { backgroundColor: C.carbon },
  placeholder: { alignSelf: 'center', marginBottom: 14 },
  draft: { position: 'absolute', top: 12, right: 12, backgroundColor: SHADES.amberLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  draftText: { fontSize: 11, fontWeight: '800', color: SHADES.amberDeep },
  pressed: { opacity: 0.9 },

  lightBlock: { position: 'absolute', left: TEXT_LEFT, top: 0, bottom: 0, justifyContent: 'center' },
  darkBlock: { position: 'absolute', left: TEXT_LEFT, bottom: DARK_BOTTOM },
  hidden: { opacity: 0 },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  title: { fontWeight: '700', letterSpacing: -0.3 },
  sub: { fontSize: 12, lineHeight: 16, marginTop: 6 },

  pill: {
    alignSelf: 'flex-start', marginTop: 14, height: 30, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: C.amber, justifyContent: 'center',
  },
  pillText: { fontSize: 12, fontWeight: '600', color: C.carbon },
  link: {
    position: 'absolute', right: TEXT_LEFT, bottom: DARK_BOTTOM, flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingBottom: 1, borderBottomWidth: 1, borderBottomColor: C.amber,
  },
  linkText: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: C.amber },

  // Dots 8px under the card (paddingTop of each tap area), centred.
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  dotHit: { paddingTop: 8, paddingHorizontal: 3 },
  dot: { height: 6, borderRadius: 3 },
});
