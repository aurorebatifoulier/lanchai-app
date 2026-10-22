import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Image,
  FlatList,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { listenBagItems } from '@/lib/bag';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import ProductSocialProof from '@/components/ProductSocialProof';
import LanchaiIcon from '@/components/LanchaiIcon';
import SearchBar from '@/components/SearchBar';
import { getProducts, getFavorites, addFavorite, removeFavorite, type LoyaltyTier } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { getMinPrice } from '@/utils/pricing';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { useLoyaltyTier } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import WhyRentSection from '@/components/WhyRentSection';
import TrustSection from '@/components/TrustSection';

const CATEGORIES = [
  { id: 'all',     name: 'All',     icon: 'grid-outline'      },
  { id: 'home',    name: 'Home',    icon: 'home-outline'      },
  { id: 'kids',    name: 'Kids',    icon: 'happy-outline'     },
  { id: 'outdoor', name: 'Outdoor', icon: 'compass-outline'   },
  { id: 'tools',   name: 'Tools',   icon: 'construct-outline' },
  { id: 'sports',  name: 'Sports',  icon: 'trophy-outline'    },
  { id: 'fun',     name: 'Fun',     icon: 'book-outline'      },
] as const;

interface HeroSlide {
  // Local asset from assets/images/. null = placeholder tint shown until photo is added.
  // When ready: replace null with require('@/assets/images/FILENAME.jpg')
  // Recommended size: 1080 × 480 px (16:7 ratio)
  image: number | null;
  tint: string;  // background color shown when image is null or loading
  title: string;
  subtitle: string;
  cta: string;
  route: string;
}

const SLIDES: HeroSlide[] = [
  {
    image: null, // → assets/images/hero-lifestyle.jpg  (LANCHAI store or rental lifestyle scene)
    tint: COLORS.carbon,
    title: 'Why buy it when\nyou can rent it?',
    subtitle: 'Everything you need. Only when you need it.',
    cta: 'Explore Now',
    route: '/explore',
  },
  {
    image: null, // → assets/images/hero-outdoor.jpg   (outdoor / camping gear in nature)
    tint: '#2D3A2E',
    title: 'Planning a weekend\noutdoors?',
    subtitle: 'Rent camping gear instead of buying it.',
    cta: 'Explore Camping',
    route: '/category/outdoor',
  },
  {
    image: null, // → assets/images/hero-creator.jpg   (camera / content creation setup)
    tint: COLORS.carbon,
    title: 'Creating content?',
    subtitle: 'Access professional equipment instantly.',
    cta: 'Explore Creator Gear',
    route: '/explore',
  },
  {
    image: null, // → assets/images/hero-tools.jpg     (power tools / DIY workshop)
    tint: '#3A2A18',
    title: 'Working on a\nDIY project?',
    subtitle: 'Rent tools and get the job done.',
    cta: 'Explore Tools',
    route: '/category/tools',
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
  const { user } = useAuth();
  const userTier = useLoyaltyTier();
  const exchangeRate = useExchangeRate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeCat, setActiveCat] = useState('all');
  const [homeQuery, setHomeQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [bagCount, setBagCount] = useState(0);
  const [firstName, setFirstName] = useState<string>('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      setLoadError(false);
      getProducts()
        .then(data => { setProducts(data); setLoading(false); })
        .catch(() => { setLoadError(true); setLoading(false); });
    }, [user])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getFavorites(user.uid).then(ids => setFavorites(new Set(ids)));
    }, [user])
  );

  const handleToggleFavorite = useCallback((productId: string) => {
    if (!user) return;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        removeFavorite(user.uid, productId);
      } else {
        next.add(productId);
        addFavorite(user.uid, productId);
      }
      return next;
    });
  }, [user]);

  // Personalized greeting: firstName from users/{uid}, fallbacks to displayName first word
  useEffect(() => {
    if (!user) { setFirstName(''); return; }
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data() as { firstName?: string; displayName?: string };
        const name = d.firstName?.trim() || d.displayName?.trim().split(' ')[0] || '';
        setFirstName(name || user.displayName?.split(' ')[0] || '');
      } else {
        setFirstName(user.displayName?.split(' ')[0] || '');
      }
    }).catch(() => setFirstName(''));
  }, [user]);

  // Real-time unread notification count for bell badge
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      where('readAt', '==', null),
    );
    return onSnapshot(q, snap => setUnreadCount(snap.size), () => setUnreadCount(0));
  }, [user]);

  // Real-time bag item count for bag badge
  useEffect(() => {
    if (!user) { setBagCount(0); return; }
    return listenBagItems(user.uid, items => setBagCount(items.length), () => setBagCount(0));
  }, [user]);

  const popularProducts = useMemo(
    () => products.filter(p => p.showInPopular === true),
    [products]
  );

  const newArrivals = useMemo(
    () => products.filter(p => p.showInNew === true),
    [products]
  );

  const premiumProducts = useMemo(
    () => products.filter(p => p.isPremium === true),
    [products]
  );

  const mostRented = useMemo(
    () => [...products].sort((a, b) => (b.rentalCount ?? b.bookingsCount ?? 0) - (a.rentalCount ?? a.bookingsCount ?? 0)).slice(0, 5),
    [products]
  );

  const handleProductPress = useCallback((id: string) => {
    router.push(`/product/${id}`);
  }, [router]);

  const handleCategoryPress = useCallback((catId: string) => {
    if (catId === 'all') {
      router.push('/explore');
    } else {
      router.push(`/category/${catId}`);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        {/* Left: chat + notifications */}
        <View style={styles.topLeftGroup}>
          <TouchableOpacity style={styles.topBtn} onPress={() => router.push('/chat')}>
            <Feather name="message-circle" size={22} color={COLORS.carbon} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => router.push('/notifications')}>
            <Feather name="bell" size={22} color={COLORS.carbon} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Logo — absolutely centred via a full-overlay wrapper */}
        <View style={styles.logoWrapper} pointerEvents="none">
          <Image
            source={require('@/assets/images/lanchai-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Right: liked + bag */}
        <View style={styles.topRightGroup}>
          <TouchableOpacity style={styles.topBtn} onPress={() => router.push('/liked')}>
            <Feather name="heart" size={22} color={COLORS.carbon} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => router.push('/bag')}>
            <Feather name="shopping-bag" size={22} color={COLORS.carbon} />
            {bagCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{bagCount > 9 ? '9+' : bagCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Carousel */}
        <HeroCarousel />

        {/* Search */}
        <SearchBar
          value={homeQuery}
          onChangeText={setHomeQuery}
          onSubmit={() => {
            if (homeQuery.trim()) {
              router.push({ pathname: '/explore', params: { q: homeQuery.trim() } } as never);
            }
          }}
          placeholder={firstName ? `Hi ${firstName}, what do you need today?` : 'What do you need today?'}
          style={{ marginBottom: 18 }}
        />

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
                  size={28}
                  color={COLORS.carbon}
                />
              </View>
              <Text style={[styles.catLabel, activeCat === cat.id && styles.catLabelActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* New arrivals — hides when no products are flagged showInNew */}
        {!loading && newArrivals.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>New arrivals</Text>
              <TouchableOpacity onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
              {newArrivals.map(p => (
                <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} exchangeRate={exchangeRate} userTier={userTier ?? null} isFavorite={favorites.has(p.id)} onToggleFavorite={() => handleToggleFavorite(p.id)} />
              ))}
            </ScrollView>
          </>
        )}

        {/* Popular near you — hides when no products are flagged showInPopular */}
        {(!loading && !loadError && popularProducts.length === 0) ? null : (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Popular near you</Text>
              <TouchableOpacity onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
            ) : loadError ? (
              <View style={styles.loadError}>
                <Feather name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={styles.loadErrorText}>Couldn&apos;t load products. Check your connection and try again.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
                {popularProducts.map(p => (
                  <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} exchangeRate={exchangeRate} userTier={userTier ?? null} isFavorite={favorites.has(p.id)} onToggleFavorite={() => handleToggleFavorite(p.id)} />
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* How LANCHAI works */}
        <HowItWorks />

        {/* Premium — only shown when at least one product is flagged isPremium */}
        {!loading && premiumProducts.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={styles.premiumSectionTitle}>
                <Feather name="award" size={14} color={COLORS.amber} />
                <Text style={styles.sectionTitle}>Premium</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
              {premiumProducts.map(p => (
                <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} exchangeRate={exchangeRate} userTier={userTier ?? null} isFavorite={favorites.has(p.id)} onToggleFavorite={() => handleToggleFavorite(p.id)} />
              ))}
            </ScrollView>
          </>
        )}

        {/* Why Rent */}
        <WhyRentSection />

        {/* Most rented this month */}
        {!loading && mostRented.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Most rented this month</Text>
              <TouchableOpacity onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
              {mostRented.map(p => (
                <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} exchangeRate={exchangeRate} userTier={userTier ?? null} isFavorite={favorites.has(p.id)} onToggleFavorite={() => handleToggleFavorite(p.id)} />
              ))}
            </ScrollView>
          </>
        )}

        {/* Trust */}
        <TrustSection />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProductCard({ product, onPress, tagBgOverride, exchangeRate, userTier, isFavorite, onToggleFavorite }: { product: Product; onPress: () => void; tagBgOverride?: string; exchangeRate: number | null; userTier: LoyaltyTier | null; isFavorite: boolean; onToggleFavorite: () => void }) {
  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.warmBeige,
  };
  const bg = bgColors[product.cardBg] ?? COLORS.warmBeige;
  const iconColor = product.cardBg === 'dark' ? COLORS.amber : COLORS.carbon;
  const minPrice = getMinPrice(product);
  const accessState = getProductAccessState(product, userTier);
  const sectionBadge: { label: string; icon?: string; bg: string; text: string } | null =
    accessState.badgeLabel ? {
      label: accessState.badgeLabel,
      bg:    accessState.badgeTone === 'unlocked' ? COLORS.amber : COLORS.carbon,
      text:  accessState.badgeTone === 'unlocked' ? COLORS.carbon : COLORS.white,
    } :
    product.isPremium     ? { label: 'Premium', icon: 'award', bg: COLORS.amber,   text: COLORS.carbon } :
    product.showInNew     ? { label: 'New',                    bg: COLORS.success, text: COLORS.white  } :
    product.showInPopular ? { label: 'Popular',                bg: COLORS.carbon,  text: COLORS.white  } :
    null;

  return (
    <TouchableOpacity style={styles.prodCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.prodImg, { backgroundColor: bg }]}>
        {product.images?.[0] ? (
          <Image
            source={{ uri: product.images[0] }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : null}
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
        <TouchableOpacity
          style={styles.prodFav}
          onPress={e => { e.stopPropagation(); onToggleFavorite(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.8}
        >
          <Feather name="heart" size={12} color={isFavorite ? COLORS.danger : COLORS.carbon} />
        </TouchableOpacity>
        {sectionBadge && (
          <View style={[styles.sectionBadge, { backgroundColor: sectionBadge.bg }]}>
            {sectionBadge.icon && (
              <Feather name={sectionBadge.icon as never} size={9} color={sectionBadge.text} />
            )}
            <Text style={[styles.sectionBadgeText, { color: sectionBadge.text }]}>
              {sectionBadge.label}
            </Text>
          </View>
        )}
        {!product.images?.[0] && (
          <Feather name={product.iconName as never} size={44} color={iconColor} />
        )}
      </View>
      <View style={styles.prodBody}>
        <Text style={styles.prodName} numberOfLines={2}>{product.name}</Text>
        {minPrice != null && exchangeRate != null
          ? <Text style={styles.prodPrice}>{toLak(minPrice, exchangeRate).toLocaleString('en-US')} <Text style={styles.prodPriceUnit}>LAK / day</Text></Text>
          : <Text style={styles.prodPriceUnavailable}>Price not set</Text>}
        {/* Same thresholds as Explore/Liked — a single low review is never promoted here. */}
        <ProductSocialProof product={product} />
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
          <View key={i} style={[styles.slide, { width, backgroundColor: slide.tint }]}>
            {slide.image != null && (
              <Image source={slide.image} style={styles.slideImage} resizeMode="cover" />
            )}
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
    backgroundColor: COLORS.porcelain,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    // Compact band: 40px buttons + 4px top/bottom = 48px (was 12px → 64px). The safe-area
    // inset stays with the SafeAreaView above — only our own padding shrinks.
    paddingVertical: 4,
    backgroundColor: COLORS.porcelain,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    backgroundColor: COLORS.amber,
    borderRadius: 8,
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
  logoWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The 62px logo PNG is mostly white margin (wordmark ≈ 26px tall, centred): clip it to
    // the 48px band so the margin never spills over the status bar area or the carousel.
    overflow: 'hidden',
  },
  logo: {
    width: 62,
    height: 62,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Carousel
  carouselWrapper: {
    marginHorizontal: -20,
    marginTop: 8,
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
    color: COLORS.white,
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
    backgroundColor: COLORS.amber,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  slideCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.carbon,
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
    backgroundColor: COLORS.disabledGray,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.amber,
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
    minWidth: 64,
  },
  catCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    height: 212,
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
    borderRadius: 6,
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
    lineHeight: 16,
    height: 32,
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
  prodPriceUnavailable: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    fontStyle: 'italic',
    marginBottom: 6,
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
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.amber,
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
    backgroundColor: COLORS.amber,
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
    backgroundColor: COLORS.amberTint,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.amber,
  },
  stepDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 19,
  },
  sectionEmpty: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  premiumSectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionBadge: {
    position: 'absolute',
    bottom: 7,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  sectionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  loadErrorText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.danger,
    flex: 1,
    lineHeight: 18,
  },
});
