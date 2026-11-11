import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { HOME_COPY } from '@/constants/homeCopy';
import { slideTarget, type HomeSlide } from '@/lib/homeSlides';
import PressScale from '@/components/PressScale';
import { openCategory } from '@/lib/navigation';

// ONE admin-managed Home slide (Admin → Home slides), shared by the hero carousel
// (components/home/HeroCarousel.tsx, 16:9 card) and the mid-page banner (SlideCarousel):
// photo full-bleed (cover), a subtle dark overlay ONLY when there's text, amber button
// when there's a label and a link; a tap anywhere follows the link. "Photo only" = no
// text. `showDraft` (admin preview) marks unpublished slides. The caller's `style` gives
// the frame (size, radius + overflow on THIS wrapper — never on the expo-image).
export default function AdminSlideCard({ slide, showDraft, style }: {
  slide: HomeSlide;
  showDraft?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const target = slideTarget(slide.link);
  const go = () => {
    if (!target) return;
    if (slide.link.kind === 'category') openCategory(router, slide.link.id); // → Explore with that category
    else router.push(target as never);
  };
  const hasText = !!(slide.title || slide.subtitle);
  return (
    <Pressable
      style={({ pressed }) => [s.slide, style, pressed && !!target && s.pressed]}
      onPress={go}
      disabled={!target}
      accessibilityRole={target ? 'button' : undefined}
      accessibilityLabel={[slide.title, slide.ctaLabel].filter(Boolean).join('. ') || undefined}
    >
      {slide.imageUrl && (
        <Image source={{ uri: slide.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessible={false} />
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
}

const s = StyleSheet.create({
  slide: { overflow: 'hidden', backgroundColor: SHADES.carbon },
  pressed: { opacity: 0.9 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.35)' },
  content: { flex: 1, justifyContent: 'flex-end', padding: 18, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', color: SHADES.white, letterSpacing: -0.4, lineHeight: 26 },
  sub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  cta: { alignSelf: 'flex-start', backgroundColor: SHADES.amber, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, marginTop: 8 },
  ctaText: { fontSize: 13, fontWeight: '800', color: SHADES.carbon },
  draft: { position: 'absolute', top: 12, left: 12, backgroundColor: SHADES.amberLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  draftText: { fontSize: 11, fontWeight: '800', color: SHADES.amberDeep },
});
