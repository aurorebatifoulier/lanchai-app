import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { getProductsByCategory, getFavorites, addFavorite, removeFavorite, type LoyaltyTier } from '@/lib/firestore';
import { Product, CATEGORIES, CATEGORY_DETAILS, ProductCategory } from '@/lib/mockData';
import { getMinPrice } from '@/utils/pricing';
import { effectiveStock } from '@/utils/availability';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { useLoyaltyTier } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import { DEFAULT_FILTERS, type Filters } from '@/lib/filterConfig';
import { filterProducts, sortProducts, sortProductsByRating } from '@/utils/productFilters';
import { FavoriteButton } from '@/components/FavoriteHeart';
import PressScale from '@/components/PressScale';
import QuickAddButton from '@/components/QuickAddButton';
import { useQuickAdd } from '@/components/quickadd/QuickAddProvider';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { fetchAllOccupancy, gridAvailability, type OccupancyRecord, type GridAvailability } from '@/utils/availability';
import SignalLine from '@/components/SignalLine';
import { productSignal } from '@/lib/productSignal';
import { categoryStyle } from '@/constants/categoryStyle';
import { SHADES } from '@/constants/brandShades';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const exchangeRate = useExchangeRate();
  const userTier = useLoyaltyTier();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Quick add "+": amber when free today — same cached occupancy as Home / Explore.
  const [occupancy, setOccupancy] = useState<Map<string, OccupancyRecord[]> | null>(null);
  const { openQuickAdd } = useQuickAdd();
  useEffect(() => {
    cached('occupancy', HOME_TTL.occupancy, fetchAllOccupancy).then(setOccupancy).catch(() => setOccupancy(null));
  }, []);

  const catId = id as ProductCategory;
  const catDetails = CATEGORY_DETAILS[catId];
  const cat = CATEGORIES.find(c => c.id === catId);

  useEffect(() => {
    if (catId) {
      getProductsByCategory(catId)
        .then(data => {
          setProducts(data);
          setLoading(false);
        })
        .catch(() => {
          setLoadError(true);
          setLoading(false);
        });
    }
  }, [catId]);

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

  // Hero colours + icon from the ONE category mapping (constants/categoryStyle.ts).
  const catStyle = categoryStyle(catId);
  const heroBg = catStyle.bg;
  const isDark = catStyle.dark === true;
  const heroTextColor = isDark ? COLORS.porcelain : COLORS.carbon;

  const subFilters = ['All', 'Available now', 'Best rated', 'Lowest price'];

  // Reuses the exact same filtering/sorting rules as app/(tabs)/explore.tsx (see
  // utils/productFilters.ts) — no second, divergent implementation. Category is
  // already server-scoped via getProductsByCategory, so only `availableOnly` and a
  // sort are needed here; "All" is the neutral/reset state and leaves the
  // Firestore-returned order untouched, matching this chip row's original intent.
  const displayedProducts = (() => {
    const filters: Filters = { ...DEFAULT_FILTERS, availableOnly: activeFilter === 'Available now' };
    const matched = filterProducts(products, filters);
    if (activeFilter === 'Best rated') return sortProductsByRating(matched);
    if (activeFilter === 'Lowest price') return sortProducts(matched, 'price-asc');
    return matched;
  })();

  return (
    <SafeAreaView style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        <View style={styles.heroTopBar}>
          <BackButton
            onPress={() => router.back()}
            variant="bare"
            size={20}
            color={isDark ? COLORS.porcelain : COLORS.carbon}
            style={[styles.backBtn, isDark && styles.backBtnDark]}
          />
          <Text style={[styles.topBarTitle, { color: isDark ? COLORS.porcelain : COLORS.carbon }]}>LANCHAI</Text>
          <TouchableOpacity style={[styles.backBtn, isDark && styles.backBtnDark]}>
            <Feather name="search" size={20} color={isDark ? COLORS.porcelain : COLORS.carbon} />
          </TouchableOpacity>
        </View>
        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroEyebrow, { color: isDark ? COLORS.amber : 'rgba(30,30,30,0.55)' }]}>
              Category · {products.length} item{products.length !== 1 ? 's' : ''}
            </Text>
            <Text style={[styles.heroTitle, { color: heroTextColor }]}>
              {catDetails?.label ?? cat?.name ?? id}
            </Text>
            <Text style={[styles.heroSub, { color: isDark ? 'rgba(250,250,247,0.7)' : 'rgba(30,30,30,0.65)' }]}>
              {catDetails?.description ?? ''}
            </Text>
          </View>
          <View style={[styles.heroIcon, isDark && styles.heroIconDark]}>
            <MaterialCommunityIcons name={catStyle.icon} size={40} color={catStyle.fg} />
          </View>
        </View>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterBar}
      >
        {subFilters.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarCount}>{displayedProducts.length} items</Text>
        <View style={styles.toolbarRight}>
          <TouchableOpacity style={styles.toolbarBtn}>
            <Feather name="sliders" size={14} color={COLORS.fg2} />
            <Text style={styles.toolbarBtnText}>Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn}>
            <Feather name="trending-up" size={14} color={COLORS.fg2} />
            <Text style={styles.toolbarBtnText}>Popular</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Products */}
      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      ) : loadError ? (
        <View style={styles.emptyState}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={styles.emptyStateTitle}>Couldn&apos;t load items</Text>
          <Text style={styles.emptyStateSub}>Check your connection and try again.</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="package" size={28} color={COLORS.fg3} />
          <Text style={styles.emptyStateTitle}>No items yet</Text>
          <Text style={styles.emptyStateSub}>Check back soon — we&apos;re adding more.</Text>
        </View>
      ) : displayedProducts.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="filter" size={28} color={COLORS.fg3} />
          <Text style={styles.emptyStateTitle}>No items match this filter</Text>
          <Text style={styles.emptyStateSub}>Try &quot;All&quot; to see everything in this category.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
          <View style={styles.grid}>
            {displayedProducts.map(p => (
              <CategoryProductCard
                key={p.id}
                product={p}
                onPress={() => router.push(`/product/${p.id}`)}
                exchangeRate={exchangeRate}
                userTier={userTier ?? null}
                isFavorite={favorites.has(p.id)}
                onToggleFavorite={() => handleToggleFavorite(p.id)}
                availability={gridAvailability(p, occupancy ? (occupancy.get(p.id) ?? []) : undefined)}
                onQuickAdd={avail => openQuickAdd(p, { availableToday: avail })}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CategoryProductCard({ product, onPress, exchangeRate, userTier, isFavorite, onToggleFavorite, availability, onQuickAdd }: { product: Product; onPress: () => void; exchangeRate: number | null; userTier: LoyaltyTier | null; isFavorite: boolean; onToggleFavorite: () => void; availability: GridAvailability; onQuickAdd: (availableToday: boolean) => void }) {
  const availableToday = !availability;
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

  return (
    <PressScale style={styles.prodCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.prodImg, { backgroundColor: bg }]}>
        {accessState.badgeLabel ? (
          <View style={[
            styles.prodTag,
            { backgroundColor: accessState.badgeTone === 'unlocked' ? COLORS.amber : COLORS.carbon },
          ]}>
            <Text style={[styles.prodTagText, accessState.badgeTone === 'locked' && { color: COLORS.white }]}>
              {accessState.badgeLabel}
            </Text>
          </View>
        ) : product.tag ? (
          <View style={[
            styles.prodTag,
            product.tagStyle === 'dark' && styles.prodTagDark,
            product.tagStyle === 'amber' && styles.prodTagAmber,
          ]}>
            <Text style={[styles.prodTagText, product.tagStyle === 'dark' && { color: COLORS.amber }]}>
              {product.tag}
            </Text>
          </View>
        ) : effectiveStock(product) <= 1 ? (
          <View style={[styles.prodTag, { backgroundColor: '#C8412C' }]}>
            <Text style={[styles.prodTagText, { color: '#FAFAF7' }]}>1 left</Text>
          </View>
        ) : null}
        <FavoriteButton liked={isFavorite} onPress={onToggleFavorite} />
        <Feather name={product.iconName as never} size={52} color={iconColor} />
      </View>
      <View style={styles.prodMeta}>
        <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.prodSub} numberOfLines={1}>{product.shortDesc}</Text>
        <View style={styles.prodBottom}>
          {minPrice != null && exchangeRate != null ? (
            <Text style={styles.prodPrice} numberOfLines={1}>{`${toLak(minPrice, exchangeRate).toLocaleString('en-US')} LAK / day`}</Text>
          ) : (
            <Text style={styles.prodSub}>Price not set</Text>
          )}
        </View>
        {/* Same signal line as every product card; the "+" width is reserved on it. */}
        <View style={styles.signalLine}>
          <SignalLine signal={productSignal(product, { availability })} />
        </View>
        {/* Quick add — none on a tier-locked product (its lock badge says why). */}
        {!accessState.locked && (
          <View style={styles.quickAdd}>
            <QuickAddButton state={availableToday ? 'now' : 'later'} onPress={() => onQuickAdd(availableToday)} />
          </View>
        )}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  hero: {
    paddingBottom: 18,
  },
  heroTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDark: {
    backgroundColor: 'rgba(250,250,247,0.15)',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 3,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(30,30,30,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroIconDark: {
    backgroundColor: 'rgba(250,250,247,0.1)',
  },
  // Filters
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  filterScroll: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  filterChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg1,
  },
  filterTextActive: {
    color: COLORS.porcelain,
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  toolbarCount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  toolbarRight: {
    flexDirection: 'row',
    gap: 12,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  // Empty / error states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 8,
  },
  emptyStateSub: {
    fontSize: 13,
    color: COLORS.fg3,
    textAlign: 'center',
  },

  // Grid
  gridContent: {
    padding: 16,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  prodCard: {
    width: '47%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  prodImg: {
    aspectRatio: 1,
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
    zIndex: 1,
  },
  prodTagAmber: { backgroundColor: COLORS.amber },
  prodTagDark: { backgroundColor: COLORS.carbon },
  prodTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: 0.4,
  },
  prodMeta: {
    padding: 12,
    height: 104, // name, short description, price, signal line (+ the "+" button)
  },
  prodName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  prodSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
    marginBottom: 8,
  },
  quickAdd: { position: 'absolute', right: 8, bottom: 8 },
  signalLine: { paddingRight: 30, minHeight: 24, justifyContent: 'center', marginTop: 2 },
  prodBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prodPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  // Same grey for the digits and "LAK / day" (all product cards).
  prodPrice: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  prodPriceUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
});
