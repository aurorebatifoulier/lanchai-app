import React, { useState, useEffect, useCallback, useRef } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  FlatList,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/Colors';
import LanchaiIcon from '@/components/LanchaiIcon';
import { getProducts } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import WhyRentSection from '@/app/components/WhyRentSection';
import TrustSection from '@/app/components/TrustSection';

const CATEGORIES = [
  { id: 'all',              name: 'All',               icon: 'grid-outline' },
  { id: 'diy-garden',      name: 'DIY / Garden',      icon: 'hammer-outline' },
  { id: 'cleaning-home',   name: 'Cleaning / Home',   icon: 'sparkles-outline' },
  { id: 'kitchen',         name: 'Kitchen',            icon: 'restaurant-outline' },
  { id: 'event',           name: 'Event',              icon: 'star-outline' },
  { id: 'leisure',         name: 'Leisure',            icon: 'musical-notes-outline' },
  { id: 'kids-baby',       name: 'Kids / Baby',        icon: 'happy-outline' },
  { id: 'sports-outdoor',  name: 'Sports / Outdoor',  icon: 'bicycle-outline' },
  { id: 'beauty-wellness', name: 'Beauty / Wellness',  icon: 'heart-outline' },
] as const;

const SLIDES = [
  {
    image: 'https://picsum.photos/seed/rent/800/400',
    title: 'Why buy it when\nyou can rent it?',
    subtitle: 'Everything you need. Only when you need it.',
    cta: 'Explore Now',
    route: '/catalogue',
  },
  {
    image: 'https://picsum.photos/seed/outdoor/800/400',
    title: 'Planning a weekend\noutdoors?',
    subtitle: 'Rent camping gear instead of buying it.',
    cta: 'Explore Camping',
    route: '/category/sports-outdoor',
  },
  {
    image: 'https://picsum.photos/seed/creator/800/400',
    title: 'Creating content?',
    subtitle: 'Access professional equipment instantly.',
    cta: 'Explore Creator Gear',
    route: '/catalogue',
  },
  {
    image: 'https://picsum.photos/seed/tools/800/400',
    title: 'Working on a\nDIY project?',
    subtitle: 'Rent tools and get the job done.',
    cta: 'Explore Tools',
    route: '/category/diy-garden',
  },
] as const;

interface ProjectCollection {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  icon: string;
  itemCount: number;
}

// TODO: replace with Firestore query: collection(db, "projectCollections")
const PROJECT_COLLECTIONS: ProjectCollection[] = [
  { id: 'events',   title: 'Party & Events',       description: '', icon: 'balloon-outline',  itemCount: 10, imageUrl: 'https://picsum.photos/seed/party/400/500' },
  { id: 'home',     title: 'Home Improvement',      description: '', icon: 'hammer-outline',   itemCount: 15, imageUrl: 'https://picsum.photos/seed/home/400/500' },
  { id: 'camping',  title: 'Camping Weekend',        description: '', icon: 'bonfire-outline',  itemCount: 12, imageUrl: 'https://picsum.photos/seed/camping/400/500' },
  { id: 'creator',  title: 'Content Creator',        description: '', icon: 'camera-outline',   itemCount: 8,  imageUrl: 'https://picsum.photos/seed/creator2/400/500' },
  { id: 'roadtrip', title: 'Road Trip Essentials',   description: '', icon: 'car-outline',      itemCount: 9,  imageUrl: 'https://picsum.photos/seed/roadtrip/400/500' },
];

const NEW_ARRIVALS_DATA: Product[] = [
  {
    id: 'new-1', name: 'Power Drill Pro', shortDesc: 'Professional cordless drill',
    description: 'Heavy-duty 18V cordless drill for all your DIY projects.',
    category: 'diy-garden', pricePerDay: 12, price8to30: 10, price30plus: 8,
    deposit: 50, rating: 4.7, reviewCount: 8, rentalCount: 12,
    available: true, stockLeft: 3, specs: { condition: 'Excellent' },
    iconName: 'tool', iconSet: 'Feather', cardBg: 'default', tag: 'NEW', tagStyle: 'amber',
  },
  {
    id: 'new-2', name: 'Camping Tent 4P', shortDesc: '4-person camping tent',
    description: 'Spacious 4-person tent, easy to set up in minutes.',
    category: 'sports-outdoor', pricePerDay: 15, price8to30: 12, price30plus: 10,
    deposit: 80, rating: 4.9, reviewCount: 5, rentalCount: 7,
    available: true, stockLeft: 2, specs: { condition: 'New' },
    iconName: 'map', iconSet: 'Feather', cardBg: 'beige', tag: 'NEW', tagStyle: 'amber',
  },
  {
    id: 'new-3', name: 'Sony A7 Camera', shortDesc: 'Full-frame mirrorless camera',
    description: 'Professional Sony A7 III full-frame mirrorless camera.',
    category: 'leisure', pricePerDay: 50, price8to30: 40, price30plus: 35,
    deposit: 200, rating: 5.0, reviewCount: 3, rentalCount: 4,
    available: true, stockLeft: 1, specs: { condition: 'Like New' },
    iconName: 'camera', iconSet: 'Feather', cardBg: 'dark', tag: 'NEW', tagStyle: 'amber',
  },
];

const HOT_PRODUCTS_DATA: Product[] = [
  {
    id: 'hot-1', name: 'Pressure Washer', shortDesc: 'High-pressure cleaning machine',
    description: 'Powerful pressure washer for cars, patios and driveways.',
    category: 'cleaning-home', pricePerDay: 18, price8to30: 15, price30plus: 12,
    deposit: 60, rating: 4.8, reviewCount: 41, rentalCount: 95,
    available: true, stockLeft: 2, specs: { condition: 'Good' },
    iconName: 'droplet', iconSet: 'Feather', cardBg: 'amber', tag: '🔥 HOT', tagStyle: 'dark',
  },
  {
    id: 'hot-2', name: 'Stand Mixer', shortDesc: 'Professional kitchen stand mixer',
    description: 'KitchenAid-style stand mixer for baking enthusiasts.',
    category: 'kitchen', pricePerDay: 20, price8to30: 16, price30plus: 13,
    deposit: 80, rating: 4.9, reviewCount: 35, rentalCount: 88,
    available: true, stockLeft: 3, specs: { condition: 'Excellent' },
    iconName: 'coffee', iconSet: 'Feather', cardBg: 'beige', tag: '🔥 HOT', tagStyle: 'dark',
  },
  {
    id: 'hot-3', name: 'PA Speaker System', shortDesc: 'Portable PA speaker with stand',
    description: 'Professional PA system perfect for events and parties.',
    category: 'event', pricePerDay: 35, price8to30: 28, price30plus: 22,
    deposit: 120, rating: 4.8, reviewCount: 29, rentalCount: 76,
    available: true, stockLeft: 2, specs: { condition: 'Good' },
    iconName: 'speaker', iconSet: 'Feather', cardBg: 'dark', tag: '🔥 HOT', tagStyle: 'dark',
  },
];

const STEPS = [
  { n: '1', icon: 'search-outline',     title: 'Find',     duration: '30 sec', desc: 'Browse and discover what you need.' },
  { n: '2', icon: 'calendar-outline',   title: 'Reserve',  duration: '1 min',  desc: 'Choose your rental dates and confirm your booking instantly.' },
  { n: '3', icon: 'storefront-outline', title: 'Pick Up',  duration: '5 min',  desc: 'Collect your equipment from the LANCHAI store in Vientiane.' },
  { n: '4', icon: 'refresh-outline',    title: 'Return',   duration: '2 min',  desc: 'Bring it back when you\'re done. Quick and easy return process.' },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const featured = products.slice(0, 4);

  const handleProductPress = useCallback((id: string) => {
    router.push(`/product/${id}`);
  }, [router]);

  const handleCategoryPress = useCallback((catId: string) => {
    if (catId === 'all') {
      router.push('/catalogue');
    } else {
      router.push(`/category/${catId}`);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn}>
          <Ionicons name="chatbubble-outline" size={22} color={COLORS.carbon} />
        </TouchableOpacity>
        <Text style={styles.wordmark}>LANCHAI</Text>
        <TouchableOpacity style={styles.topBtn}>
          <Feather name="bell" size={22} color={COLORS.carbon} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>2</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Location */}
        <TouchableOpacity style={styles.locRow}>
          <Feather name="map-pin" size={13} color={COLORS.amber} />
          <Text style={styles.locText}>Vientiane, Laos</Text>
          <Feather name="chevron-down" size={13} color={COLORS.fg3} />
        </TouchableOpacity>

        {/* Carousel */}
        <HeroCarousel />

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Feather name="search" size={18} color={COLORS.fg3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for items"
              placeholderTextColor={COLORS.fg3}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
          <TouchableOpacity style={styles.filterBtn}>
            <Feather name="sliders" size={20} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>

        {/* Category circles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.catItem}
              onPress={() => {
                setActiveCat(cat.id);
                handleCategoryPress(cat.id);
              }}
            >
              <View style={[styles.catCircle, activeCat === cat.id && styles.catCircleActive]}>
                <Ionicons
                  name={cat.icon as never}
                  size={20}
                  color={COLORS.carbon}
                />
              </View>
              <Text style={[styles.catLabel, activeCat === cat.id && styles.catLabelActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Popular near you */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Popular near you</Text>
          <TouchableOpacity onPress={() => router.push('/catalogue')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
            {featured.map(p => (
              <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} />
            ))}
          </ScrollView>
        )}

        {/* New Arrivals */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>New Arrivals</Text>
          <TouchableOpacity onPress={() => router.push('/catalogue')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
          {NEW_ARRIVALS_DATA.map(p => (
            <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} />
          ))}
        </ScrollView>

        {/* How LANCHAI works */}
        <HowItWorks />

        {/* Explore by Project */}
        <ExploreByProject />

        {/* Most Rented This Month */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Most Rented This Month</Text>
          <TouchableOpacity onPress={() => router.push('/catalogue')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
          {HOT_PRODUCTS_DATA.map(p => (
            <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} tagBgOverride="#FF5722" />
          ))}
        </ScrollView>

        {/* Why Rent */}
        <WhyRentSection />

        {/* Trust */}
        <TrustSection />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProductCard({ product, onPress, tagBgOverride }: { product: Product; onPress: () => void; tagBgOverride?: string }) {
  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.warmBeige,
  };
  const bg = bgColors[product.cardBg] ?? COLORS.warmBeige;
  const iconColor = product.cardBg === 'dark' ? COLORS.amber : COLORS.carbon;

  return (
    <TouchableOpacity style={styles.prodCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.prodImg, { backgroundColor: bg }]}>
        {product.tag && (
          <View style={[
            styles.prodTag,
            product.tagStyle === 'dark' && styles.prodTagDark,
            product.tagStyle === 'amber' && styles.prodTagAmber,
            tagBgOverride ? { backgroundColor: tagBgOverride } : null,
          ]}>
            <Text style={[styles.prodTagText, (product.tagStyle === 'dark' || tagBgOverride) && styles.prodTagTextLight]}>
              {product.tag}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.prodFav}>
          <Feather name="heart" size={12} color={COLORS.carbon} />
        </TouchableOpacity>
        <Feather name={product.iconName as never} size={44} color={iconColor} />
      </View>
      <View style={styles.prodBody}>
        <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.prodPrice}>From {product.pricePerDay}K <Text style={styles.prodPriceUnit}>LAK / day</Text></Text>
        <View style={styles.prodRating}>
          <Feather name="star" size={11} color={COLORS.amber} />
          <Text style={styles.prodRatingText}>{product.rating} ({product.reviewCount})</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const STEP_DELAYS = [100, 250, 400, 550];

function HowItWorks() {
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(30);
  const sv0 = useSharedValue(0);
  const sv1 = useSharedValue(0);
  const sv2 = useSharedValue(0);
  const sv3 = useSharedValue(0);

  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 600 });
    cardTranslateY.value = withTiming(0, { duration: 600 });
    [sv0, sv1, sv2, sv3].forEach((sv, i) => {
      sv.value = withDelay(STEP_DELAYS[i], withTiming(1, { duration: 400 }));
    });
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));
  const anim0 = useAnimatedStyle(() => ({ opacity: sv0.value }));
  const anim1 = useAnimatedStyle(() => ({ opacity: sv1.value }));
  const anim2 = useAnimatedStyle(() => ({ opacity: sv2.value }));
  const anim3 = useAnimatedStyle(() => ({ opacity: sv3.value }));
  const stepAnimStyles = [anim0, anim1, anim2, anim3];

  return (
    <View style={styles.howSection}>
      <Text style={styles.howTitle}>How LANCHAI works</Text>
      <Text style={styles.howSubtitle}>Renting equipment has never been easier.</Text>
      <Animated.View style={[styles.howCard, cardAnimStyle]}>
        {STEPS.map((step, i) => (
          <Animated.View key={step.n} style={[styles.stepRow, stepAnimStyles[i]]}>
            {/* Left column: number + vertical line */}
            <View style={styles.stepLeft}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{step.n}</Text>
              </View>
              {i < STEPS.length - 1 && <View style={styles.stepLine} />}
            </View>
            {/* Right column */}
            <View style={styles.stepRight}>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconCircle}>
                  <Ionicons name={step.icon as never} size={22} color="#FFFFFF" />
                </View>
                <View style={styles.stepTitleRow}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{step.duration}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

function ProjectCard({ project }: { project: ProjectCollection }) {
  const router = useRouter();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.projCard, animStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 150 }); }}
        onPressOut={() => { scale.value = withTiming(1.0, { duration: 150 }); }}
        onPress={() => router.push({ pathname: '/project/[id]', params: { projectId: project.id, projectName: project.title } } as never)}
        style={styles.projCardInner}
      >
        <Image source={{ uri: project.imageUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.projCardContent}>
          <Text style={styles.projCardTitle} numberOfLines={1} ellipsizeMode="tail">{project.title}</Text>
          <Text style={styles.projCardCount}>{project.itemCount} Items</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ExploreByProject() {
  const router = useRouter();
  const sectionOpacity = useSharedValue(0);
  const sectionTranslateY = useSharedValue(20);

  useEffect(() => {
    sectionOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    sectionTranslateY.value = withDelay(200, withTiming(0, { duration: 600 }));
  }, []);

  const sectionAnimStyle = useAnimatedStyle(() => ({
    opacity: sectionOpacity.value,
    transform: [{ translateY: sectionTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.projSection, sectionAnimStyle]}>
      <View style={styles.projHeader}>
        <Text style={styles.projHeaderTitle}>Explore by Project</Text>
        <TouchableOpacity onPress={() => router.push('/catalogue')}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
        style={styles.projStripOuter}
      >
        {PROJECT_COLLECTIONS.map(p => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function HeroCarousel() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const slideIndex = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (slideIndex.current + 1) % SLIDES.length;
      slideIndex.current = next;
      setActiveSlide(next);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, 10000);
    return () => clearInterval(timer);
  }, [width]);

  return (
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
          <View key={i} style={[styles.slide, { width }]}>
            <Image source={{ uri: slide.image }} style={styles.slideImage} resizeMode="cover" />
            <View style={styles.slideOverlay} />
            <View style={styles.slideContent}>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideSub}>{slide.subtitle}</Text>
              <TouchableOpacity style={styles.slideCta} onPress={() => router.push(slide.route as never)}>
                <Text style={styles.slideCtaText}>{slide.cta}</Text>
              </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF7',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.porcelain,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.porcelain,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmark: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 5,
    color: COLORS.carbon,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#FAFAF7',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Carousel
  carouselWrapper: {
    marginHorizontal: -20,
    marginBottom: 16,
  },
  slide: {
    height: 220,
    overflow: 'hidden',
  },
  slideImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  slideOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 16,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 6,
  },
  slideSub: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
    marginBottom: 14,
  },
  slideCta: {
    alignSelf: 'flex-start',
    backgroundColor: '#F4B400',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  slideCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E1E1E',
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
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
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  locText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg1,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  filterBtn: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  // Categories
  catScroll: {
    gap: 14,
    paddingBottom: 4,
    marginBottom: 22,
    paddingLeft: 0,
    paddingRight: 8,
  },
  catItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 52,
  },
  catCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCircleActive: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg1,
    textAlign: 'center',
  },
  catLabelActive: {
    fontWeight: '700',
  },
  // Section head
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.amber,
  },
  // Product strip
  productStrip: {
    gap: 12,
    paddingRight: 20,
    paddingLeft: 20,
    marginLeft: -20,
    marginBottom: 22,
  },
  prodCard: {
    width: 138,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  prodImg: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  prodTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: COLORS.porcelain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodTagAmber: {
    backgroundColor: COLORS.amber,
  },
  prodTagDark: {
    backgroundColor: COLORS.carbon,
  },
  prodTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: 0.4,
  },
  prodTagTextLight: {
    color: COLORS.amber,
  },
  prodFav: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodBody: {
    padding: 10,
  },
  prodName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 3,
    letterSpacing: -0.1,
  },
  prodPrice: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 6,
  },
  prodPriceUnit: {
    fontSize: 10,
  },
  prodRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prodRatingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  // How it works
  howSection: {
    marginBottom: 24,
  },
  howTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  howSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 16,
  },
  howCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stepLeft: {
    alignItems: 'center',
    width: 32,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4B400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#F4B400',
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  stepRight: {
    flex: 1,
    paddingBottom: 24,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stepIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F4B400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitleRow: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  durationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F4B400',
  },
  stepDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 19,
  },
  // Explore by Project
  projSection: {
    marginBottom: 24,
  },
  projHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  projHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
  },
  projStripOuter: {
    marginHorizontal: -20,
  },
  projCard: {
    width: 140,
    height: 200,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
  },
  projCardInner: {
    flex: 1,
  },
  projCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  projCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  projCardCount: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
});
