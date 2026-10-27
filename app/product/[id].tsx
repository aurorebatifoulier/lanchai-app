import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Share, Linking,
  Animated, Platform, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import { useReducedMotion } from '@/constants/motion';
import { UI, SectionTitle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import ProductRailCard from '@/components/ProductRailCard';
import { PriceLak } from '@/components/PriceLak';
import { ProductGallery, ProductStickyBar } from '@/components/product/ProductGallery';
import AvailabilityCard from '@/components/product/AvailabilityCard';
import {
  ProductIntro, PerfectFor, KeyFeatures, ExpandableText, PriceTiers, WhyBuyProduct, DetailsCard,
  HowItWorks, ReviewsBlock, QuestionRow, type Badge, type Tier,
} from '@/components/product/ProductSections';
import { useQuickAdd } from '@/components/quickadd/QuickAddProvider';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRenterProduct, getFavorites, addFavorite, removeFavorite, getProducts, getProductReviewsPage,
  type ReviewDoc, type LoyaltyTier, type UserProfile,
} from '@/lib/firestore';
import { CATEGORIES, type Product } from '@/lib/mockData';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { useLoyaltyConfig, depositPercentFor, loyaltyPointsFor } from '@/lib/loyalty';
import { useMyLoyalty, useAveragePointsPerRental, loyaltyCardSubline } from '@/lib/loyaltyUi';
import { useResidentPromo } from '@/lib/residency';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { listenBagItems } from '@/lib/bag';
import { usePublishedCollections } from '@/hooks/useProductSearch';
import { getProductAccessState } from '@/utils/productAccess';
import { needsBtobDocument } from '@/utils/btob';
import { getEffectiveRate, getMinPrice } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { PICKUP_DELAY_MS, fetchAllOccupancy, gridAvailability, type OccupancyRecord } from '@/utils/availability';
import { vteMonthKey } from '@/functions/src/shared/dates';
import type { ProductSignal, SignalPart } from '@/lib/productSignal';

// Product detail (validated mockup) — Home / Explore / My Account language. Gallery
// scrolls away, then a compact sticky bar appears; real availability (occupancy), tier
// cells, Why buy it?, details accordion, How it works with the renter's ACTUAL deposit
// (depositPercentFor, as at booking), reviews, Pairs well with, question → chat. Bottom
// bar: bag → the shared quick-add sheet, "Rent it" → booking/new. Copy in
// constants/productCopy.ts.

const GALLERY_RATIO = 0.82; // height / width
const PAIRS_MAX = 6;
const TIER_DEFS: { key: keyof Product; label: string; days: number }[] = [
  { key: 'pricePerDay', label: '1–2 d', days: 1 },
  { key: 'price3to6', label: '3–6 d', days: 3 },
  { key: 'price7to13', label: '7–13 d', days: 7 },
  { key: 'price14to29', label: '14–29 d', days: 14 },
  { key: 'price30plus', label: '30+ d', days: 30 },
];

/** "9 Khouvieng Road, Shop…" → "Khouvieng Road". */
function streetOf(addressLine: string): string {
  const first = addressLine.split(',').find(p => /[a-z]/i.test(p)) ?? addressLine;
  return first.trim().replace(/^\d+\s+/, '');
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const reduce = useReducedMotion();
  const { user, isAdmin } = useAuth();
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const shop = useShopInfo();
  const loyaltyConfig = useLoyaltyConfig();
  const loyalty = useMyLoyalty();
  const avgPoints = useAveragePointsPerRental();
  const residentPct = useResidentPromo();
  const collections = usePublishedCollections();
  const { openQuickAdd } = useQuickAdd();

  // The live users doc (useMyLoyalty) gives type / tier / BtoB fields — no extra read.
  const profile = loyalty.profile as (Partial<UserProfile> & { loyaltyTier?: LoyaltyTier }) | null;
  const userTier: LoyaltyTier | null = profile?.loyaltyTier ?? null;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [occupancy, setOccupancy] = useState<Map<string, OccupancyRecord[]> | null>(null);
  const [latest, setLatest] = useState<ReviewDoc | null>(null);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const lightboxRef = useRef<ScrollView>(null);
  const [docRequiredNotice, setDocRequiredNotice] = useState(false);
  // Bag count badge (same live listener as the Home header; null until it answers).
  const [bagCount, setBagCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user) { setBagCount(null); return; }
    return listenBagItems(user.uid, items => setBagCount(items.length), () => setBagCount(null));
  }, [user]);

  // Sticky bar once the gallery has scrolled away.
  const galleryH = Math.round(W * GALLERY_RATIO);
  const showAt = galleryH - insets.top - 52;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [barVisible, setBarVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    getRenterProduct(id)
      .then(p => { setProduct(p); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
    // Latest review only (the "See all" screen pages the rest) — 1 read.
    getProductReviewsPage(id, 1).then(r => setLatest(r.reviews[0] ?? null)).catch(() => {});
    cached('products', HOME_TTL.products, getProducts).then(setCatalogue).catch(() => {});
    cached('occupancy', HOME_TTL.occupancy, fetchAllOccupancy).then(setOccupancy).catch(() => setOccupancy(null));
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;
    getFavorites(user.uid).then(ids => setFavIds(new Set(ids))).catch(() => {});
  }, [user, id]);

  // One favourites set for this product and the "Pairs well with" cards.
  const toggleFavFor = useCallback((pid: string) => {
    if (!user) return;
    setFavIds(prev => {
      const next = new Set(prev);
      const liked = !next.has(pid);
      if (liked) next.add(pid); else next.delete(pid);
      (liked ? addFavorite(user.uid, pid) : removeFavorite(user.uid, pid)).catch(() => {});
      return next;
    });
  }, [user]);
  const isFav = !!id && favIds.has(id);
  const toggleFav = useCallback(() => { if (id) toggleFavFor(id); }, [id, toggleFavFor]);

  // Pairs well with: same published collections first, then the same category.
  const pairs = useMemo(() => {
    if (!product) return [];
    const ok = (p: Product) => p.id !== product.id && !getProductAccessState(p, userTier).locked;
    const byId = new Map(catalogue.map(p => [p.id, p]));
    const out: Product[] = [];
    const add = (p: Product | undefined) => { if (p && ok(p) && !out.some(x => x.id === p.id)) out.push(p); };
    collections.filter(c => c.productIds.includes(product.id)).forEach(c => c.productIds.forEach(pid => add(byId.get(pid))));
    catalogue.filter(p => p.category === product.category).forEach(add);
    return out.slice(0, PAIRS_MAX);
  }, [product, catalogue, collections, userTier]);

  if (loading) {
    return <View style={[s.center, { paddingTop: insets.top }]}><ActivityIndicator color={SHADES.amber} /></View>;
  }
  if (loadError || !product) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.notFound}>{loadError ? PRODUCT_COPY.loadError : PRODUCT_COPY.notFound}</Text>
        {loadError && <Text style={UI.body}>{PRODUCT_COPY.loadErrorSub}</Text>}
        <PressScale style={[UI.btnSecondary, { marginTop: 18 }]} onPress={() => router.back()}>
          <Text style={UI.btnSecondaryText}>{PRODUCT_COPY.goBack}</Text>
        </PressScale>
      </View>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const images = product.images ?? [];
  const access = getProductAccessState(product, userTier);
  const lak = (usd: number) => (exchangeRate != null ? toLak(usd, exchangeRate) : null);
  const tiers: Tier[] = exchangeRate == null ? [] : TIER_DEFS
    .map(t => ({ t, usd: product[t.key] as number }))
    .filter(x => x.usd > 0)
    .map(({ t, usd }) => ({
      label: t.label,
      lak: toLak(usd, exchangeRate),
      discount: t.days > 1 && product.pricePerDay > 0 ? Math.round((1 - usd / product.pricePerDay) * 100) : null,
    }));
  const weekRate = getEffectiveRate(product, 7);
  const weekLak = weekRate != null ? lak(weekRate * 7) : null;
  const weekendRate = getEffectiveRate(product, 2);
  const weekendLak = weekendRate != null ? lak(weekendRate * 2) : null;
  const retailLak = product.retailPrice ? lak(product.retailPrice) : null;
  const minUsd = getMinPrice(product);
  const bookable = tiers.length > 0 && !access.locked;

  // Actual deposit for this renter (same rule as the booking flow).
  const depositPct = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
  const depositLak = exchangeRate != null ? Math.round(toLak(product.deposit, exchangeRate) * depositPct / 100) : null;
  const points = !loyalty.excluded && weekendLak != null ? loyaltyPointsFor(weekendLak) : null;
  const pointsLine = !loyalty.excluded && loyalty.progress ? loyaltyCardSubline(loyalty.progress, avgPoints, loyalty.config) : null;

  const categoryName = CATEGORIES.find(c => c.id === product.category)?.name ?? product.category;
  const badges: Badge[] = [
    ...(access.badgeLabel ? [{ key: 'tier', label: access.badgeLabel, icon: access.locked ? 'lock' as const : undefined, tone: access.badgeTone === 'unlocked' ? 'amber' as const : 'carbon' as const }] : []),
    ...(product.showInNew ? [{ key: 'new', label: 'New', tone: 'amberLight' as const }] : []),
    ...(product.isPremium ? [{ key: 'premium', label: 'Premium', icon: 'award' as const, tone: 'amber' as const }] : []),
    ...(product.showInPopular ? [{ key: 'popular', label: 'Popular', tone: 'carbon' as const }] : []),
  ];

  // "★ 4.5 · 2 reviews · ↻ 4 rentals · 2 this month" — only the parts that exist
  // (here the rating shows from the first review).
  const rentals = product.rentalCount ?? product.bookingsCount ?? 0;
  const month = product.rentalsByMonth?.[vteMonthKey(Date.now())] ?? 0;
  const groups: SignalPart[][] = [];
  const sig = PRODUCT_COPY.signal;
  if (product.averageRating && (product.reviewCount ?? 0) > 0) {
    groups.push([{ icon: 'star', text: product.averageRating.toFixed(1), strong: true }]);
    groups.push([{ text: sig.reviews(product.reviewCount) }]);
  }
  if (rentals > 0) groups.push([{ icon: 'repeat', text: `${rentals}`, strong: true, suffix: sig.rentals(rentals) }]);
  if (month > 0) groups.push([{ text: sig.thisMonth(month) }]);
  const signal: ProductSignal | null = groups.length === 0 ? null : {
    tone: 'plain',
    parts: groups.flatMap((g, i) => (i === 0 ? g : [{ text: '', sep: true }, ...g])),
  };

  const share = () => { Share.share({ message: PRODUCT_COPY.share(product.name) }).catch(() => {}); };
  const editProduct = isAdmin ? () => router.push({ pathname: '/admin/product-form', params: { id: product.id } } as never) : undefined;
  const quickAdd = () => {
    if (needsBtobDocument(profile as UserProfile | null)) { setDocRequiredNotice(true); return; }
    openQuickAdd(product);
  };
  const rent = () => {
    if (needsBtobDocument(profile as UserProfile | null)) { setDocRequiredNotice(true); return; }
    router.push({ pathname: '/booking/new', params: { productId: product.id } });
  };
  const barBottom = Math.max(insets.bottom, 12);

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 + barBottom }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
            const next = e.nativeEvent.contentOffset.y >= showAt;
            setBarVisible(v => (v === next ? v : next));
          },
        })}
      >
        <ProductGallery
          images={images}
          width={W}
          height={galleryH}
          topInset={insets.top}
          iconName={product.iconName}
          liked={isFav}
          onBack={() => router.back()}
          onShare={share}
          onToggleFav={toggleFav}
          onOpen={i => setLightbox(i)}
          onEdit={editProduct}
          bagCount={bagCount}
          onBag={() => router.push('/bag')}
        />

        <View style={s.content}>
          <ProductIntro product={product} categoryName={categoryName} badges={badges} signal={signal} />

          <View style={{ marginTop: 16 }}>
            <AvailabilityCard product={product} onPickRange={(start, end) => openQuickAdd(product, { range: { start, end } })} />
          </View>

          <PerfectFor items={product.perfectFor ?? []} />
          <KeyFeatures items={product.keyFeatures ?? []} />
          <ExpandableText text={product.description ?? ''} />

          <PriceTiers tiers={tiers} weekLak={weekLak} vatPct={vatPercent} />
          {retailLak != null && weekendLak != null && <WhyBuyProduct retailLak={retailLak} weekendLak={weekendLak} />}

          <DetailsCard product={product} />

          <HowItWorks
            depositLak={depositLak}
            residentPct={residentPct}
            points={points}
            pointsLine={pointsLine}
            street={streetOf(shop.addressLine)}
            hours={shop.hours}
            readyHours={PICKUP_DELAY_MS / 3_600_000}
            onVerify={() => router.push('/profile/id-residency')}
            onDirections={() => Linking.openURL(buildMapsUrl(shop))}
          />

          {product.averageRating != null && (product.reviewCount ?? 0) > 0 && (
            <ReviewsBlock
              rating={product.averageRating}
              count={product.reviewCount}
              latest={latest}
              onSeeAll={() => router.push({ pathname: '/reviews/[productId]', params: { productId: product.id, name: product.name } } as never)}
            />
          )}

          {pairs.length > 0 && (
            <View>
              <SectionTitle>{PRODUCT_COPY.pairs}</SectionTitle>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.railScroll} contentContainerStyle={s.rail}>
                {pairs.map(p => {
                  const availability = gridAvailability(p, occupancy ? (occupancy.get(p.id) ?? []) : undefined);
                  return (
                    <ProductRailCard
                      key={p.id}
                      product={p}
                      onPress={() => router.push(`/product/${p.id}`)}
                      exchangeRate={exchangeRate}
                      userTier={userTier}
                      isFavorite={favIds.has(p.id)}
                      onToggleFavorite={() => toggleFavFor(p.id)}
                      availability={availability}
                      quickAdd={availability ? 'later' : 'now'}
                      onQuickAdd={() => openQuickAdd(p, { availableToday: !availability })}
                    />
                  );
                })}
              </ScrollView>
            </View>
          )}

          <QuestionRow onPress={() => router.push({ pathname: '/chat', params: { about: PRODUCT_COPY.chatPrefill(product.name) } } as never)} />
        </View>
      </Animated.ScrollView>

      <ProductStickyBar
        scrollY={scrollY}
        showAt={showAt}
        reduce={reduce}
        topInset={insets.top}
        name={product.name}
        liked={isFav}
        visible={barVisible}
        onBack={() => router.back()}
        onToggleFav={toggleFav}
        onEdit={editProduct}
        bagCount={bagCount}
        onBag={() => router.push('/bag')}
      />

      {/* ── Fixed bottom bar ── */}
      <View style={[s.bottom, { paddingBottom: barBottom }]}>
        {docRequiredNotice && (
          <View style={s.docNotice}>
            <Text style={[UI.errorText, { flex: 1 }]}>{PRODUCT_COPY.bar.docRequired}</Text>
            <TouchableOpacity onPress={() => { setDocRequiredNotice(false); router.push('/profile/business-document'); }} hitSlop={8}>
              <Text style={UI.link}>{PRODUCT_COPY.bar.docLink}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={s.bottomRow}>
          <View style={{ flex: 1 }}>
            {bookable && minUsd != null && exchangeRate != null ? (
              <>
                <Text style={UI.small}>{PRODUCT_COPY.bar.from}</Text>
                {/* "198,000 LAK / day" once, one colour and weight. */}
                <PriceLak lak={toLak(minUsd, exchangeRate)} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.price} suffix={PRODUCT_COPY.bar.perDay} />
              </>
            ) : (
              <Text style={UI.small} numberOfLines={2}>
                {tiers.length > 0 && access.locked ? access.message : PRODUCT_COPY.bar.notForRent}
              </Text>
            )}
          </View>
          {bookable && (
            <PressScale style={s.bagBtn} onPress={quickAdd} accessibilityLabel="Add to bag">
              <Feather name="shopping-bag" size={20} color={SHADES.carbon} />
            </PressScale>
          )}
          <PressScale style={[UI.btnPrimary, s.rentBtn, !bookable && UI.btnDisabled]} onPress={rent} disabled={!bookable}>
            <Text style={UI.btnPrimaryText}>
              {bookable ? PRODUCT_COPY.bar.rent : tiers.length > 0 && access.locked ? PRODUCT_COPY.bar.restricted : PRODUCT_COPY.bar.comingSoon}
            </Text>
          </PressScale>
        </View>
      </View>

      {/* ── Fullscreen viewer ── */}
      <Modal visible={lightbox != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLightbox(null)}>
        <View style={s.lightbox}>
          <ScrollView
            ref={lightboxRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            onMomentumScrollEnd={e => setLightbox(Math.round(e.nativeEvent.contentOffset.x / W))}
            onLayout={() => { if (lightbox) lightboxRef.current?.scrollTo({ x: lightbox * W, animated: false }); }}
          >
            {images.map(uri => (
              <View key={uri} style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri }} style={{ width: W, height: W }} contentFit="contain" transition={150} />
              </View>
            ))}
          </ScrollView>
          {images.length > 1 && lightbox != null && (
            <View style={s.lbCounter}><Text style={s.lbCounterText}>{PRODUCT_COPY.counter(lightbox + 1, images.length)}</Text></View>
          )}
          <TouchableOpacity style={s.lbClose} onPress={() => setLightbox(null)} activeOpacity={0.85}>
            <Feather name="x" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: COLORS.porcelain },
  notFound: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginBottom: 6 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  railScroll: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 12 },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SHADES.white,
    borderTopWidth: 0.5, borderTopColor: SHADES.border, paddingHorizontal: 16, paddingTop: 12,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  price: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  bagBtn: {
    width: 54, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: SHADES.carbon,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  rentBtn: { height: 54, paddingHorizontal: 26, borderRadius: 16 },
  docNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center' },
  lbClose: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 44, right: 20, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  lbCounter: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  lbCounterText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
});
