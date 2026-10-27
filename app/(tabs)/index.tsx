import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { listenBagItems } from '@/lib/bag';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { HOME_COPY } from '@/constants/homeCopy';
import { UI, SectionTitle, CategoryBadge, ToggleRow, SCREEN_BOTTOM_GAP } from '@/components/account/ui';
import SearchBar from '@/components/SearchBar';
import ProductRailCard from '@/components/ProductRailCard';
import InsetCarousel from '@/components/home/InsetCarousel';
import NextPickupCard, { nextPickup } from '@/components/home/NextPickupCard';
import RentReturnRepeat from '@/components/home/RentReturnRepeat';
import CollectionTiles from '@/components/home/CollectionTiles';
import RentAgainList from '@/components/home/RentAgainList';
import MostRentedPodium from '@/components/home/MostRentedPodium';
import WhyBuyCard from '@/components/home/WhyBuyCard';
import ReferralPromoCard from '@/components/home/ReferralPromoCard';
import { RailHeader } from '@/components/home/RailHeader';
import {
  HomeSection, RailSkeleton, ThumbsSkeleton, TilesSkeleton, ListSkeleton, PodiumSkeleton, CardSkeleton,
} from '@/components/home/Skeletons';
import { useReduceMotion } from '@/components/account/AccountHeader';
import {
  rentAgainRows, podiumPick, whyBuyMine, whyBuyCatalogue, whyBuyMineRanked, whyBuyCatalogueRanked,
  weekendWindow, freeThisWeekend, budgetPicks, bookableByPopularity, pickSections, type WhyBuy,
} from '@/lib/homeData';
import FreeWeekend from '@/components/home/FreeWeekend';
import BudgetPicks from '@/components/home/BudgetPicks';
import { getHomeConfig, DEFAULT_BUDGET_THRESHOLD_LAK } from '@/lib/homeConfig';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { fetchAllOccupancy, type OccupancyRecord } from '@/utils/availability';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { getPublishedCollections, getAllCollections, type CollectionDoc } from '@/lib/collections';
import WhyRentSection from '@/components/WhyRentSection';
import { HERO_BUILT_IN } from '@/components/home/builtInSlides';
import SlideCarousel from '@/components/home/SlideCarousel';
import BagButton from '@/components/home/BagButton';
import { getPublishedSlides, getAllSlides, type HomeSlide } from '@/lib/homeSlides';
import {
  getProducts, getFavorites, addFavorite, removeFavorite, getMyReservations, type RentalDoc, type LoyaltyTier,
} from '@/lib/firestore';
import { CATEGORIES, type Product } from '@/lib/mockData';
import { useExchangeRate } from '@/lib/exchangeRate';
import { cached, clearHomeCache, HOME_TTL } from '@/lib/homeCache';
import { DEFAULT_REFERRAL_REWARD_POINTS } from '@/lib/loyalty';
import PressScale from '@/components/PressScale';

// Home (validated mockup) — the My Account design language: white cards with a thin
// border, radius 18, section titles, palette icon circles, a carbon highlight card.
// Copy in constants/homeCopy.ts; category looks in constants/categoryStyle.ts.

const HOME_CATEGORIES = CATEGORIES.filter(c => c.id !== 'all');
// Admin "Preview all sections" toggle, remembered per device.
const PREVIEW_KEY = 'home.adminPreviewAll';
// Sticky search geometry: inline field top padding, overlay vertical padding.
const SEARCH_PAD_TOP = 16;
const STICKY_PAD = 8;

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const exchangeRate = useExchangeRate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState(false);
  // Per-source "loaded" flags — each section waits only for its own data (skeletons).
  const [ready, setReady] = useState({ products: false, mine: false, collections: false, occupancy: false });
  const [refreshing, setRefreshing] = useState(false);
  const [reservations, setReservations] = useState<RentalDoc[]>([]);
  const [collections, setCollections] = useState<CollectionDoc[]>([]);
  const [allCollections, setAllCollections] = useState<CollectionDoc[]>([]);
  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [allSlides, setAllSlides] = useState<HomeSlide[]>([]);
  const [previewAll, setPreviewAll] = useState(false);
  const [homeQuery, setHomeQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  // null until the bag listener answers (BagButton animates only later increases).
  const [bagCount, setBagCount] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // ONE live users/{uid} read (loyalty snapshot) also gives the first name and tier.
  const loyalty = useMyLoyalty();
  const profile = loyalty.profile as { firstName?: string; displayName?: string; loyaltyTier?: LoyaltyTier } | null;
  const firstName = profile?.firstName?.trim() || profile?.displayName?.trim().split(' ')[0]
    || user?.displayName?.split(' ')[0] || '';
  const userTier: LoyaltyTier | null | undefined = loyalty.loading ? undefined : (profile?.loyaltyTier ?? null);
  const shop = useShopInfo();
  const timeSlots = useMemo(() => getShopTimeSlots(shop), [shop]);
  // "Free this weekend": all live occupancy in ONE query (null = not loaded / failed →
  // section hidden, never a false "free"). "Under X": threshold from config/home.
  const [occupancy, setOccupancy] = useState<Map<string, OccupancyRecord[]> | null>(null);
  const [budgetLak, setBudgetLak] = useState(DEFAULT_BUDGET_THRESHOLD_LAK);
  const [focusTick, setFocusTick] = useState(0);
  const reduceMotion = useReduceMotion();
  const { width: screenW } = useWindowDimensions();

  // Sticky search: an overlay copy of the field pins under the header once the inline
  // field reaches the top of the scroll area (threshold from its measured position).
  const scrollY = useRef(new Animated.Value(0)).current;
  const [searchY, setSearchY] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinAt = searchY != null ? searchY + SEARCH_PAD_TOP - STICKY_PAD : Number.MAX_SAFE_INTEGER;

  // Every independent Home read in parallel. Admin-managed / slow data comes from a
  // short in-memory cache (lib/homeCache.ts); `force` (pull-to-refresh) bypasses it.
  // Reservations and favourites are always re-read (pick-up card, hearts).
  const loadHome = useCallback(async (force: boolean) => {
    if (!user) return;
    const uid = user.uid;
    setFocusTick(t => t + 1);
    setLoadError(false);
    await Promise.allSettled([
      cached('products', HOME_TTL.products, getProducts, force)
        .then(setProducts, () => setLoadError(true))
        .finally(() => setReady(r => ({ ...r, products: true }))),
      Promise.all([getMyReservations(uid).catch(() => [] as RentalDoc[]), getFavorites(uid)])
        .then(([res, favs]) => { setReservations(res); setFavorites(new Set(favs)); })
        .finally(() => setReady(r => ({ ...r, mine: true }))),
      cached('collections:published', HOME_TTL.config, getPublishedCollections, force)
        .then(setCollections, () => setCollections([]))
        .finally(() => setReady(r => ({ ...r, collections: true }))),
      cached('occupancy', HOME_TTL.occupancy, fetchAllOccupancy, force)
        .then(setOccupancy, () => setOccupancy(null))
        .finally(() => setReady(r => ({ ...r, occupancy: true }))),
      cached('homeConfig', HOME_TTL.config, getHomeConfig, force).then(c => setBudgetLak(c.budgetThresholdLak)),
      // Failure → no admin slides → the built-in ones (the Home never looks broken).
      cached('slides:published', HOME_TTL.config, getPublishedSlides, force).then(setSlides, () => setSlides([])),
    ]);
  }, [user]);

  useFocusEffect(useCallback(() => { loadHome(false); }, [loadHome]));

  // Signed out / another account: nothing cached may leak to the next user.
  useEffect(() => {
    clearHomeCache();
    setReady({ products: false, mine: false, collections: false, occupancy: false });
  }, [user?.uid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearHomeCache();
    await Promise.all([
      loadHome(true),
      isAdmin && previewAll ? getAllCollections().then(setAllCollections, () => setAllCollections([])) : null,
      isAdmin && previewAll ? getAllSlides().then(setAllSlides, () => setAllSlides([])) : null,
    ]);
    setRefreshing(false);
  }, [loadHome, isAdmin, previewAll]);

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

  // Admin preview: read the remembered toggle; load drafts too while it's on.
  useEffect(() => {
    if (!isAdmin) { setPreviewAll(false); return; }
    AsyncStorage.getItem(PREVIEW_KEY).then(v => setPreviewAll(v === '1')).catch(() => {});
  }, [isAdmin]);
  const togglePreview = useCallback((on: boolean) => {
    setPreviewAll(on);
    AsyncStorage.setItem(PREVIEW_KEY, on ? '1' : '0').catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!isAdmin || !previewAll) return;
      getAllCollections().then(setAllCollections).catch(() => setAllCollections([]));
      getAllSlides().then(setAllSlides).catch(() => setAllSlides([]));
    }, [isAdmin, previewAll])
  );
  const preview = isAdmin && previewAll;

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
    if (!user) { setBagCount(null); return; }
    return listenBagItems(user.uid, items => setBagCount(items.length), () => setBagCount(null));
  }, [user]);

  const newArrivals = useMemo(() => products.filter(p => p.showInNew === true), [products]);
  const mostRented = useMemo(
    () => [...products].sort((a, b) => (b.rentalCount ?? b.bookingsCount ?? 0) - (a.rentalCount ?? a.bookingsCount ?? 0)).slice(0, 5),
    [products]
  );
  const podium = useMemo(() => podiumPick(products), [products]);
  // "Got plans?": hide a collection with no product the renter can see.
  const visibleCollections = useMemo(() => {
    const ids = new Set(products.map(p => p.id));
    return collections.filter(c => c.productIds.some(id => ids.has(id)));
  }, [collections, products]);
  const pickup = useMemo(() => nextPickup(reservations), [reservations]);
  const returnedCount = useMemo(() => reservations.filter(r => r.status === 'returned').length, [reservations]);
  const rentAgain = useMemo(() => rentAgainRows(reservations, products), [reservations, products]);
  const returning = returnedCount > 0;
  const whyMine = useMemo(() => whyBuyMine(reservations, products, exchangeRate), [reservations, products, exchangeRate]);
  const whyCatalogue = useMemo(() => whyBuyCatalogue(products, exchangeRate), [products, exchangeRate]);
  const referralPts = loyalty.config?.referralRewardPoints ?? DEFAULT_REFERRAL_REWARD_POINTS;

  const weekend = useMemo(
    () => weekendWindow(new Date(), d => getAvailableTimeSlots(d, timeSlots)),
    // focusTick: recompute the window each time Home is shown (the day may have changed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeSlots, focusTick],
  );
  const weekendFree = useMemo(
    // max 12: every free candidate, so the no-repeat picker has room to choose.
    () => (weekend && occupancy ? freeThisWeekend(products, occupancy, weekend, userTier ?? null, { max: 12 }) : []),
    [products, occupancy, weekend, userTier],
  );
  const budget = useMemo(
    () => budgetPicks(products, budgetLak, exchangeRate, userTier ?? null),
    [products, budgetLak, exchangeRate, userTier],
  );
  const whyRanked = useMemo(
    () => (returning ? [...whyBuyMineRanked(reservations, products, exchangeRate), ...whyBuyCatalogueRanked(products, exchangeRate)]
      : whyBuyCatalogueRanked(products, exchangeRate)),
    [returning, reservations, products, exchangeRate],
  );

  // No repeated products across nearby sections (display order; Rent again and the
  // ranking — podium / most-rented rail — are shown as is but count as shown).
  const picked = useMemo(() => {
    type Item = { id: string; product?: Product; why?: WhyBuy };
    const prod = (list: Product[]): Item[] => list.map(p => ({ id: p.id, product: p }));
    const r = pickSections<Item>([
      { key: 'newArrivals', items: prod(newArrivals), min: 1, max: newArrivals.length },
      { key: 'weekend', items: prod(weekendFree), min: 3, max: 8 },
      { key: 'rentAgain', items: rentAgain.map(x => ({ id: x.product.id, product: x.product })), min: 1, max: 3, exempt: true },
      { key: 'ranking', items: prod(podium ? podium.top : mostRented), min: 1, max: 5, exempt: true },
      { key: 'budget', items: prod(budget), min: 2, max: 4 },
      { key: 'why', items: whyRanked.map(w => ({ id: w.product.id, why: w })), min: 1, max: 1 },
    ], it => it.id);
    const ps = (k: string) => r[k].map(it => it.product!);
    return { newArrivals: ps('newArrivals'), weekend: ps('weekend'), budget: ps('budget'), why: r.why[0]?.why ?? null };
  }, [newArrivals, weekendFree, rentAgain, podium, mostRented, budget, whyRanked]);
  const whyBuy = picked.why;

  // Admin preview: example products when not enough match right now.
  const weekendShown = picked.weekend.length >= 3 ? picked.weekend
    : preview ? bookableByPopularity(products, userTier ?? null).slice(0, 8) : [];
  const budgetShown = picked.budget.length >= 2 ? picked.budget
    : preview ? [...bookableByPopularity(products, userTier ?? null)].sort((a, b) => a.pricePerDay - b.pricePerDay).slice(0, 4) : [];

  // Admin slides per placement (preview: drafts too); none → the built-in slides.
  const slideSource = preview ? allSlides : slides;
  const heroSlides = useMemo(() => slideSource.filter(x => x.placement === 'hero'), [slideSource]);
  const bannerSlides = useMemo(() => slideSource.filter(x => x.placement === 'banner'), [slideSource]);

  // Categories: all on one row (≤ 6) sized to the width; horizontal scroll from 7.
  const catFit = HOME_CATEGORIES.length <= 6;
  const catItemW = catFit ? (screenW - 32) / HOME_CATEGORIES.length : 72;
  const catCircle = Math.min(52, Math.floor(catItemW - 6));

  const rail = (items: Product[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail}>
      {items.map(p => (
        <ProductRailCard
          key={p.id}
          product={p}
          onPress={() => router.push(`/product/${p.id}`)}
          exchangeRate={exchangeRate}
          userTier={userTier ?? null}
          isFavorite={favorites.has(p.id)}
          onToggleFavorite={() => handleToggleFavorite(p.id)}
        />
      ))}
    </ScrollView>
  );

  // Same field inline and pinned — shared value, same submit.
  const search = (
    <SearchBar
      variant="account"
      value={homeQuery}
      onChangeText={setHomeQuery}
      onSubmit={() => {
        if (homeQuery.trim()) {
          router.push({ pathname: '/explore', params: { q: homeQuery.trim() } } as never);
        }
      }}
      placeholder={HOME_COPY.searchPlaceholder(firstName)}
    />
  );

  const categoryItem = (cat: (typeof HOME_CATEGORIES)[number]) => (
    <TouchableOpacity key={cat.id} style={[styles.catItem, { width: catItemW }]} onPress={() => router.push(`/category/${cat.id}`)} activeOpacity={0.75}>
      <CategoryBadge cat={cat.id} size={catCircle} />
      <Text style={styles.catLabel} numberOfLines={1}>{cat.name}</Text>
    </TouchableOpacity>
  );

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
          <BagButton count={bagCount} onPress={() => router.push('/bag')} />
        </View>
      </View>

      {/* Scroll area + the sticky search overlay (one fixed sibling above: the top bar). */}
      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: SCREEN_BOTTOM_GAP }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SHADES.amber]} tintColor={SHADES.amber} progressBackgroundColor={SHADES.white} />
          }
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
            listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
              const next = e.nativeEvent.contentOffset.y >= pinAt;
              setPinned(prev => (prev === next ? prev : next));
            },
          })}
        >
          {heroSlides.length > 0
            ? <SlideCarousel slides={heroSlides} height={190} intervalMs={10000} showDraft={preview} />
            : <HeroCarousel />}

          <View style={styles.searchWrap} onLayout={e => setSearchY(e.nativeEvent.layout.y)}>
            {search}
          </View>

          <View style={styles.content}>
            {isAdmin && (
              <View style={[UI.card, styles.previewCard]}>
                <ToggleRow title={HOME_COPY.adminPreviewToggle} sub={HOME_COPY.adminPreviewSub} value={previewAll} onValueChange={togglePreview} />
              </View>
            )}

            {(pickup || preview) && (
              <View style={{ marginTop: 14 }}>
                <NextPickupCard rental={pickup} />
                {preview && !pickup && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminPickupExample}</Text>}
              </View>
            )}

            {/* Categories — same circles as the My Account stickers, all on one row */}
            <SectionTitle>{HOME_COPY.categoriesTitle}</SectionTitle>
            {catFit ? (
              <View style={styles.catRow}>
                {HOME_CATEGORIES.map(cat => categoryItem(cat))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.catRail}>
                {HOME_CATEGORIES.map(cat => categoryItem(cat))}
              </ScrollView>
            )}

            {loadError ? (
              <View style={styles.loadError}>
                <Feather name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={UI.errorText}>{HOME_COPY.loadError}</Text>
              </View>
            ) : null}

            {/* New arrivals — the product-card rail (the showcase) */}
            <HomeSection loading={!ready.products} skeleton={<RailSkeleton />}>
              {picked.newArrivals.length > 0 && (
                <>
                  <RailHeader title={HOME_COPY.newArrivalsTitle} onSeeAll={() => router.push('/explore')} />
                  {rail(picked.newArrivals)}
                </>
              )}
            </HomeSection>

            {/* New renters: how it works, early on the page (waits for their rentals) */}
            <HomeSection loading={!ready.mine} skeleton={<CardSkeleton height={220} />}>
              {(preview || !returning) && <RentReturnRepeat />}
            </HomeSection>

            {/* Got plans? — 2-column tiles */}
            <HomeSection loading={!ready.products || !ready.collections} skeleton={<TilesSkeleton />}>
              {preview ? (
                <>
                  <CollectionTiles collections={allCollections} />
                  {allCollections.length > 0 && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminDraftsIncluded}</Text>}
                  {allCollections.length === 0 && <AdminHint />}
                </>
              ) : visibleCollections.length > 0 ? (
                <CollectionTiles collections={visibleCollections} />
              ) : isAdmin ? (
                <AdminHint />
              ) : null}
            </HomeSection>

            {/* Free this weekend — products free for the whole weekend window */}
            <HomeSection loading={!ready.products || !ready.occupancy} skeleton={<ThumbsSkeleton />}>
              {weekend && weekendShown.length >= 3 && (
                <>
                  <FreeWeekend products={weekendShown} win={weekend} exchangeRate={exchangeRate} />
                  {preview && picked.weekend.length < 3 && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminExampleData}</Text>}
                </>
              )}
            </HomeSection>
          </View>

          {/* Banner — breaks the rhythm between the rails and the lists */}
          <View style={{ marginTop: 28 }}>
            {bannerSlides.length > 0
              ? <SlideCarousel slides={bannerSlides} height={200} intervalMs={6000} showDraft={preview} />
              : <WhyRentSection />}
          </View>

          <View style={styles.content}>
            {/* Rent again — compact list (returning renters) */}
            <HomeSection loading={!ready.products || !ready.mine} skeleton={<ListSkeleton />}>
              {(preview || rentAgain.length > 0) && (
                <>
                  <RentAgainList rows={rentAgain} />
                  {preview && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminRentAgainStats(returnedCount, rentAgain.length)}</Text>}
                </>
              )}
            </HomeSection>

            {/* Most rented — podium (this month, else all-time), else the rail */}
            <HomeSection loading={!ready.products} skeleton={<PodiumSkeleton />}>
            {podium ? (
              <>
                <RailHeader
                  title={podium.scope === 'month' ? HOME_COPY.mostRentedTitle : HOME_COPY.mostRentedAllTimeTitle}
                  onSeeAll={() => router.push('/explore')}
                />
                <MostRentedPodium top={podium.top} />
                {preview && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminPodiumScope(podium.scope)}</Text>}
              </>
            ) : mostRented.length > 0 ? (
              <>
                <RailHeader title={HOME_COPY.mostRentedAllTimeTitle} onSeeAll={() => router.push('/explore')} />
                {rail(mostRented)}
              </>
            ) : null}
            </HomeSection>

            {/* Under {X} LAK a day — budget picks */}
            <HomeSection loading={!ready.products} skeleton={<TilesSkeleton />}>
              {budgetShown.length >= 2 && (
                <>
                  <BudgetPicks products={budgetShown} thresholdLak={budgetLak} exchangeRate={exchangeRate} />
                  {preview && picked.budget.length < 2 && <Text style={[UI.small, styles.adminNote]}>{HOME_COPY.adminExampleData}</Text>}
                </>
              )}
            </HomeSection>

            {/* Why buy it? — a real comparison */}
            <HomeSection loading={!ready.products || !ready.mine} skeleton={<CardSkeleton />}>
            {preview ? (
              <>
                {whyMine && <Text style={[UI.small, styles.adminLabel]}>{HOME_COPY.adminWhyBuyMine}</Text>}
                {whyMine && <WhyBuyCard pick={whyMine} />}
                {whyCatalogue && <Text style={[UI.small, styles.adminLabel]}>{HOME_COPY.adminWhyBuyCatalogue}</Text>}
                {whyCatalogue && <WhyBuyCard pick={whyCatalogue} />}
              </>
            ) : whyBuy ? (
              <View style={{ marginTop: 24 }}><WhyBuyCard pick={whyBuy} /></View>
            ) : null}
            </HomeSection>

            {/* Bottom: returning renters → referral card */}
            <HomeSection loading={!ready.mine} skeleton={null}>
              {(preview || (returning && !loyalty.excluded)) && (
                <View style={{ marginTop: 16 }}><ReferralPromoCard points={referralPts} /></View>
              )}
            </HomeSection>
          </View>
        </Animated.ScrollView>

        {/* Sticky search overlay — fades in once the inline field reaches the top */}
        <Animated.View
          pointerEvents={pinned ? 'auto' : 'none'}
          style={[styles.sticky, {
            opacity: scrollY.interpolate({ inputRange: [pinAt - (reduceMotion ? 0.5 : 10), pinAt], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: scrollY.interpolate({ inputRange: [pinAt - (reduceMotion ? 0.5 : 10), pinAt], outputRange: [reduceMotion ? 0 : -6, 0], extrapolate: 'clamp' }) }],
          }]}
        >
          {search}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

/** Admin-only placeholder where "Got plans?" will appear. Renters never see it. */
function AdminHint() {
  const router = useRouter();
  return (
    <TouchableOpacity style={[UI.card, styles.adminHint]} onPress={() => router.push('/admin/collections' as never)} activeOpacity={0.8}>
      <Feather name="layers" size={16} color={SHADES.carbonMuted} />
      <Text style={[UI.small, { flex: 1 }]}>{HOME_COPY.adminNoCollections}</Text>
      <Feather name="chevron-right" size={16} color={SHADES.carbonMuted} />
    </TouchableOpacity>
  );
}

function HeroCarousel() {
  const router = useRouter();
  return (
    <InsetCarousel
      height={190}
      intervalMs={10000}
      slides={HERO_BUILT_IN.map((slide, i) => (
        <View key={i} style={[styles.slide, { backgroundColor: slide.tint }]}>
          {slide.image != null && (
            <Image source={slide.image} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
          <View style={styles.slideOverlay} />
          <View style={styles.slideContent}>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideSub}>{slide.subtitle}</Text>
            <PressScale style={styles.slideCta} onPress={() => router.push(slide.route as never)} activeOpacity={0.85}>
              <Text style={styles.slideCtaText}>{slide.cta}</Text>
            </PressScale>
          </View>
        </View>
      ))}
    />
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
  content: { paddingHorizontal: 16 },

  // Hero slides (inside InsetCarousel)
  slide: { flex: 1, overflow: 'hidden' },
  slideOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.35)' },
  slideContent: { flex: 1, justifyContent: 'flex-end', padding: 18 },
  slideTitle: { fontSize: 21, fontWeight: '800', color: SHADES.white, letterSpacing: -0.4, lineHeight: 25, marginBottom: 4 },
  slideSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 12 },
  slideCta: { alignSelf: 'flex-start', backgroundColor: SHADES.amber, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  slideCtaText: { fontSize: 13, fontWeight: '800', color: SHADES.carbon },

  // Rails bleed to the screen edges, content stays on the 16px gutter.
  railScroll: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 12 },
  searchWrap: { paddingHorizontal: 16, paddingTop: SEARCH_PAD_TOP },
  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: STICKY_PAD,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },

  catRow: { flexDirection: 'row' },
  catRail: { paddingHorizontal: 12, gap: 4 },
  catItem: { alignItems: 'center' },
  catLabel: { fontSize: 12, fontWeight: '600', color: SHADES.carbon, marginTop: 7 },
  adminLabel: { marginTop: 24, marginBottom: 8, fontStyle: 'italic' },

  previewCard: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 4 },
  adminNote: { marginTop: 6, fontStyle: 'italic' },
  adminHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, padding: 12,
    borderStyle: 'dashed', borderWidth: 1, borderColor: SHADES.carbonFaint, backgroundColor: 'transparent',
  },
  loadError: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20 },
});
