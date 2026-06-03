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

interface WhyRentSlide {
  id: string;
  image: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
}

const SLIDES: WhyRentSlide[] = [
  {
    id: 'save',
    image: 'https://picsum.photos/seed/piggy/800/400',
    icon: 'wallet-outline',
    title: 'Spend Less',
    tagline: 'Own less. Do more.',
    description: 'Rent what you need for a fraction of the cost.',
  },
  {
    id: 'space',
    image: 'https://picsum.photos/seed/minimal/800/400',
    icon: 'home-outline',
    title: 'Live Lighter',
    tagline: 'No storage. No clutter.',
    description: 'Use it. Return it. Enjoy more space.',
  },
  {
    id: 'eco',
    image: 'https://picsum.photos/seed/nature2/800/400',
    icon: 'leaf-outline',
    title: 'Consume Better',
    tagline: 'Use. Return. Repeat.',
    description: 'A smarter way to access things without owning everything.',
  },
  {
    id: 'access',
    image: 'https://picsum.photos/seed/equipment/800/400',
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
            <View key={slide.id} style={[styles.slide, { width }]}>
              <Image
                source={{ uri: slide.image }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
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
    backgroundColor: '#FAFAF7',
  },
  carouselWrapper: {
    marginHorizontal: -20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FAFAF7',
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
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
    lineHeight: 26,
  },
  slideTagline: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F4B400',
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
    backgroundColor: '#FAFAF7',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CCCCCC',
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F4B400',
  },
});
