import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import InsetCarousel from '@/components/home/InsetCarousel';

// Home "Consume better" banner: inset photo carousel (16px margins, radius 18) like the
// hero. Placeholder tints are brand carbon shades until the photos are added.

interface WhyRentSlide {
  id: string;
  // Local asset from assets/images/. null = placeholder tint shown until photo is added.
  // When ready: replace null with require('@/assets/images/FILENAME.jpg')
  // Recommended size: 800 × 400 px (2:1 ratio)
  image: number | null;
  tint: string;  // background color shown when image is null or loading
  icon: string;
  title: string;
  tagline: string;
  description: string;
}

export const WHY_RENT_SLIDES: WhyRentSlide[] = [
  {
    id: 'save',
    image: null, // → assets/images/why-spend-less.jpg  (savings / money scene — e.g. wallet, price tag)
    tint: SHADES.carbon,
    icon: 'wallet-outline',
    title: 'Spend less',
    tagline: 'Own less. Do more.',
    description: 'Rent what you need for a fraction of the cost.',
  },
  {
    id: 'space',
    image: null, // → assets/images/why-live-lighter.jpg (minimal, airy living space)
    tint: SHADES.carbonSoft,
    icon: 'home-outline',
    title: 'Live lighter',
    tagline: 'No storage. No clutter.',
    description: 'Use it. Return it. Enjoy more space.',
  },
  {
    id: 'eco',
    image: null, // → assets/images/why-consume-better.jpg (eco / nature / green scene)
    tint: SHADES.carbon,
    icon: 'leaf',
    title: 'Consume better',
    tagline: 'Use. Return. Repeat.',
    description: 'A smarter way to access things without owning everything.',
  },
  {
    id: 'access',
    image: null, // → assets/images/why-access-more.jpg (professional gear laid out — camera, tools, etc.)
    tint: SHADES.carbonSoft,
    icon: 'star-outline',
    title: 'Access more',
    tagline: 'Professional equipment. Whenever you need it.',
    description: 'Get access to quality gear without the commitment of ownership.',
  },
];

export default function WhyRentSection() {
  return (
    <InsetCarousel
      height={200}
      intervalMs={6000}
      slides={WHY_RENT_SLIDES.map(slide => (
        <View key={slide.id} style={[styles.slide, { backgroundColor: slide.tint }]}>
          {slide.image != null && (
            <Image source={slide.image} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
          <View style={styles.overlay} />
          <View style={styles.slideContent}>
            <MaterialCommunityIcons name={slide.icon as never} size={30} color={SHADES.white} style={styles.slideIcon} />
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideTagline}>{slide.tagline}</Text>
            <Text style={styles.slideDesc}>{slide.description}</Text>
          </View>
        </View>
      ))}
    />
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.45)' },
  slideContent: { flex: 1, padding: 20, justifyContent: 'flex-end' },
  slideIcon: { marginBottom: 10 },
  slideTitle: { fontSize: 22, fontWeight: '800', color: SHADES.white, letterSpacing: -0.4, marginBottom: 4, lineHeight: 26 },
  slideTagline: { fontSize: 13, fontWeight: '700', color: SHADES.amber, marginBottom: 6 },
  slideDesc: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
});
