import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

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

const SLIDES: WhyRentSlide[] = [
  {
    id: 'save',
    image: null, // → assets/images/why-spend-less.jpg  (savings / money scene — e.g. wallet, price tag)
    tint: '#1B3124',
    icon: 'wallet-outline',
    title: 'Spend Less',
    tagline: 'Own less. Do more.',
    description: 'Rent what you need for a fraction of the cost.',
  },
  {
    id: 'space',
    image: null, // → assets/images/why-live-lighter.jpg (minimal, airy living space)
    tint: '#2A2D38',
    icon: 'home-outline',
    title: 'Live Lighter',
    tagline: 'No storage. No clutter.',
    description: 'Use it. Return it. Enjoy more space.',
  },
  {
    id: 'eco',
    image: null, // → assets/images/why-consume-better.jpg (eco / nature / green scene)
    tint: '#1A2E20',
    icon: 'leaf-outline',
    title: 'Consume Better',
    tagline: 'Use. Return. Repeat.',
    description: 'A smarter way to access things without owning everything.',
  },
  {
    id: 'access',
    image: null, // → assets/images/why-access-more.jpg (professional gear laid out — camera, tools, etc.)
    tint: COLORS.carbon,
    icon: 'star-outline',
    title: 'Access More',
    tagline: 'Professional equipment. Whenever you need it.',
    description: 'Get access to quality gear without the commitment of ownership.',
  },
];

export default function WhyRentSection() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const slideIndex = useRef(0);

  const sectionOpacity = useSharedValue(0);
  const sectionTranslateY = useSharedValue(30);

  useEffect(() => {
    sectionOpacity.value = withTiming(1, { duration: 700 });
    sectionTranslateY.value = withTiming(0, { duration: 700 });

    const timer = setInterval(() => {
      const next = (slideIndex.current + 1) % SLIDES.length;
      slideIndex.current = next;
      setActiveSlide(next);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, 6000);

    return () => clearInterval(timer);
  }, [width]);

  const sectionAnimStyle = useAnimatedStyle(() => ({
    opacity: sectionOpacity.value,
    transform: [{ translateY: sectionTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.section, sectionAnimStyle]}>
      <View style={styles.carouselWrapper}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            slideIndex.current = i;
            setActiveSlide(i);
          }}
          scrollEventThrottle={16}
        >
          {SLIDES.map((slide, i) => (
            <View key={slide.id} style={[styles.slide, { width, backgroundColor: slide.tint }]}>
              {slide.image != null && (
                <Image
                  source={slide.image}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
              )}
              <View style={styles.overlay} />
              <View style={styles.slideContent}>
                <Ionicons name={slide.icon as never} size={32} color="#FFFFFF" style={styles.slideIcon} />
                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideTagline}>{slide.tagline}</Text>
                <Text style={styles.slideDesc}>{slide.description}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeSlide && styles.dotActive]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
    backgroundColor: COLORS.porcelain,
  },
  carouselWrapper: {
    marginHorizontal: -20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.porcelain,
  },
  slide: {
    height: 200,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  slideContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-end',
  },
  slideIcon: {
    marginBottom: 10,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.4,
    marginBottom: 4,
    lineHeight: 26,
  },
  slideTagline: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.amber,
    marginBottom: 6,
  },
  slideDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: COLORS.porcelain,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.disabledGray,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.amber,
  },
});
