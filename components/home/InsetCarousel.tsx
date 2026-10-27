import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SHADES } from '@/constants/brandShades';

// Home photo carousels (hero + "Consume better"): 16px side margins, radius 18 like every
// card, auto-advancing pages, dots below — only the active one amber.
export const CAROUSEL_SIDE = 16;

export default function InsetCarousel({
  slides, height, intervalMs,
}: {
  slides: React.ReactNode[];
  height: number;
  intervalMs: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = screenW - CAROUSEL_SIDE * 2;
  const scrollRef = useRef<ScrollView>(null);
  const index = useRef(0);
  const [active, setActive] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      const next = (index.current + 1) % count;
      index.current = next;
      setActive(next);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [width, count, intervalMs]);

  return (
    <View>
      <View style={[s.frame, { width, height }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            index.current = i;
            setActive(i);
          }}
          scrollEventThrottle={16}
        >
          {slides.map((slide, i) => (
            <View key={i} style={{ width, height }}>{slide}</View>
          ))}
        </ScrollView>
      </View>
      {count > 1 && (
        <View style={s.dots}>
          {slides.map((_, i) => <View key={i} style={[s.dot, i === active && s.dotActive]} />)}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', backgroundColor: SHADES.carbonLight },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SHADES.carbonFaint },
  dotActive: { width: 18, backgroundColor: SHADES.amber },
});
