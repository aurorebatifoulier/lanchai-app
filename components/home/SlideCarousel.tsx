import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { HOME_COPY } from '@/constants/homeCopy';
import InsetCarousel from '@/components/home/InsetCarousel';
import { slideTarget, type HomeSlide } from '@/lib/homeSlides';
import PressScale from '@/components/PressScale';

// Admin-managed Home slides (hero carousel / mid-page banner): photo full-bleed in the
// rounded 16px-margin card, a subtle dark overlay ONLY when there's text, amber button
// when there's a label and a link; a tap anywhere follows the link. `showDraft` (admin
// preview) marks unpublished slides.
export default function SlideCarousel({
  slides, height, intervalMs, showDraft,
}: {
  slides: HomeSlide[];
  height: number;
  intervalMs: number;
  showDraft?: boolean;
}) {
  const router = useRouter();
  return (
    <InsetCarousel
      height={height}
      intervalMs={intervalMs}
      slides={slides.map(slide => {
        const target = slideTarget(slide.link);
        const go = () => { if (target) router.push(target as never); };
        const hasText = !!(slide.title || slide.subtitle);
        return (
          <Pressable key={slide.id} style={s.slide} onPress={go} disabled={!target}>
            {slide.imageUrl && (
              <Image source={{ uri: slide.imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={250} />
            )}
            {hasText && <View style={s.overlay} />}
            {showDraft && !slide.published && (
              <View style={s.draft}><Text style={s.draftText}>{HOME_COPY.adminDraft}</Text></View>
            )}
            <View style={s.content}>
              {!!slide.title && <Text style={s.title} numberOfLines={2}>{slide.title}</Text>}
              {!!slide.subtitle && <Text style={s.sub} numberOfLines={2}>{slide.subtitle}</Text>}
              {!!slide.ctaLabel && target && (
                <PressScale style={s.cta} onPress={go} activeOpacity={0.85}>
                  <Text style={s.ctaText}>{slide.ctaLabel}</Text>
                </PressScale>
              )}
            </View>
          </Pressable>
        );
      })}
    />
  );
}

const s = StyleSheet.create({
  slide: { flex: 1, overflow: 'hidden', backgroundColor: SHADES.carbon },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.35)' },
  content: { flex: 1, justifyContent: 'flex-end', padding: 18, gap: 4 },
  title: { fontSize: 21, fontWeight: '800', color: SHADES.white, letterSpacing: -0.4, lineHeight: 25 },
  sub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  cta: { alignSelf: 'flex-start', backgroundColor: SHADES.amber, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, marginTop: 8 },
  ctaText: { fontSize: 13, fontWeight: '800', color: SHADES.carbon },
  draft: { position: 'absolute', top: 12, left: 12, backgroundColor: SHADES.amberLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  draftText: { fontSize: 11, fontWeight: '800', color: SHADES.amberDeep },
});
