import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import SearchBar from '@/components/SearchBar';
import FilterSheet, { ActiveChip } from '@/components/FilterSheet';
import { useAuth } from '@/contexts/AuthContext';
import { getProducts, getFavorites, removeFavorite, type LoyaltyTier } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { useLoyaltyTier } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import {
  Filters,
  PRICE_CONFIG,
  SORT_LABELS,
  DEFAULT_FILTERS,
} from '@/lib/filterConfig';
import { getMinPrice } from '@/utils/pricing';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD    = 16;
const COL_GAP  = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2;

function formatKip(value: number): string {
  return `₭${value.toLocaleString('en-US')}`;
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onPress,
  onUnlike,
  exchangeRate,
  userTier,
}: {
  product: Product;
  onPress: () => void;
  onUnlike: () => void;
  exchangeRate: number | null;
  userTier: LoyaltyTier | null;
}) {
  const imageUri = product.images?.[0] ?? null;
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
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardImageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.cardImage} contentFit="cover" transition={300} />
        ) : (
          <View style={[s.cardImage, s.cardImagePlaceholder]}>
            <Feather name="image" size={28} color={COLORS.softGray} />
          </View>
        )}

        {sectionBadge && (
          <View style={[s.sectionBadge, { backgroundColor: sectionBadge.bg }]}>
            {sectionBadge.icon && (
              <Feather name={sectionBadge.icon as never} size={9} color={sectionBadge.text} />
            )}
            <Text style={[s.sectionBadgeText, { color: sectionBadge.text }]}>
              {sectionBadge.label}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={s.heartBtn}
          onPress={e => { e.stopPropagation(); onUnlike(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.8}
        >
          <Ionicons name="heart" size={15} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={2}>{product.name}</Text>
        {minPrice != null && exchangeRate != null
          ? <Text style={s.cardPrice}>{formatKip(toLak(minPrice, exchangeRate))} / day</Text>
          : <Text style={s.cardPriceUnavailable}>Price not set</Text>}
        <View style={[s.availBadge, !product.available && s.availBadgeRented]}>
          <Text style={[s.availBadgeText, !product.available && s.availBadgeTextRented]}>
            {product.available ? 'Available' : 'Rented'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── LikedEmptyState ───────────────────────────────────────────────────────────

function LikedEmptyState({
  noLikedItems,
  onClearFilters,
  onExplore,
}: {
  noLikedItems: boolean;
  onClearFilters: () => void;
  onExplore: () => void;
}) {
  if (noLikedItems) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="heart-outline" size={36} color={COLORS.fg3} />
        </View>
        <Text style={s.emptyTitle}>No liked items yet</Text>
        <Text style={s.emptySub}>
          Tap the heart on any product to save it here.
        </Text>
        <TouchableOpacity style={s.exploreBtn} onPress={onExplore} activeOpacity={0.85}>
          <Text style={s.exploreBtnText}>Explore products</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <Feather name="package" size={32} color={COLORS.fg3} />
      </View>
      <Text style={s.emptyTitle}>No matches</Text>
      <Text style={s.emptySub}>
        None of your liked items match the current filters.
      </Text>
      <TouchableOpacity style={[s.exploreBtn, s.clearBtn]} onPress={onClearFilters} activeOpacity={0.85}>
        <Text style={s.exploreBtnText}>Clear filters</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LikedScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const userTier = useLoyaltyTier();
  const exchangeRate = useExchangeRate();

  // Data
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(false);
  const [unlikeError,   setUnlikeError]   = useState(false);

  // Filters
  const [filters,        setFilters]        = useState<Filters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters]  = useState<Filters>(DEFAULT_FILTERS);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [sheetVisible,   setSheetVisible]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    Promise.all([
      getFavorites(uid),
      getProducts(),
    ])
      .then(([ids, products]) => {
        const idSet = new Set(ids);
        setLikedProducts(products.filter(p => idSet.has(p.id)));
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [user]);

  // ── Unlike ────────────────────────────────────────────────────────────────

  const handleUnlike = useCallback((productId: string) => {
    if (!user) return;
    setLikedProducts(prev => prev.filter(p => p.id !== productId));
    removeFavorite(user.uid, productId).catch(() => {
      setUnlikeError(true);
      getFavorites(user.uid).then(ids =>
        getProducts().then(products => {
          const idSet = new Set(ids);
          setLikedProducts(products.filter(p => idSet.has(p.id)));
        }),
      ).catch(() => {});
    });
  }, [user]);

  // ── Filters ───────────────────────────────────────────────────────────────

  const hasRatingData = useMemo(
    () => likedProducts.some(p => p.averageRating != null && p.averageRating > 0),
    [likedProducts],
  );

  const filteredLiked = useMemo(() => {
    let list = [...likedProducts];

    if (filters.availableOnly) list = list.filter(p => p.available);
    // PRICE_CONFIG / filters.priceMin/Max are LAK-denominated; pricePerDay is USD.
    if (exchangeRate != null) {
      if (filters.priceMin > PRICE_CONFIG.min) list = list.filter(p => toLak(p.pricePerDay, exchangeRate) >= filters.priceMin);
      if (filters.priceMax < PRICE_CONFIG.max) list = list.filter(p => toLak(p.pricePerDay, exchangeRate) <= filters.priceMax);
    }
    if (filters.minRating > 0) list = list.filter(p => p.averageRating != null && p.averageRating >= filters.minRating);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    switch (filters.sort) {
      case 'popular':
        list.sort((a, b) => (b.bookingsCount ?? b.rentalCount ?? 0) - (a.bookingsCount ?? a.rentalCount ?? 0));
        break;
      case 'price-asc':
        list.sort((a, b) => a.pricePerDay - b.pricePerDay);
        break;
      case 'price-desc':
        list.sort((a, b) => b.pricePerDay - a.pricePerDay);
        break;
      case 'newest':
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        break;
    }
    return list;
  }, [likedProducts, filters, searchQuery, exchangeRate]);

  const hasActiveFilters = useMemo(() => (
    filters.availableOnly
    || filters.sort !== 'popular'
    || filters.minRating !== 0
    || filters.priceMin > PRICE_CONFIG.min
    || filters.priceMax < PRICE_CONFIG.max
  ), [filters]);

  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      chips.push({
        id: 'search',
        label: `Search: ${q.length > 18 ? q.slice(0, 18) + '…' : q}`,
        onRemove: () => setSearchQuery(''),
      });
    }
    if (filters.priceMin > PRICE_CONFIG.min || filters.priceMax < PRICE_CONFIG.max) {
      chips.push({
        id: 'price',
        label: `${formatKip(filters.priceMin)} – ${formatKip(filters.priceMax)} / day`,
        onRemove: () => setFilters(f => ({ ...f, priceMin: PRICE_CONFIG.min, priceMax: PRICE_CONFIG.max })),
      });
    }
    if (filters.availableOnly) {
      chips.push({ id: 'avail', label: 'Available only', onRemove: () => setFilters(f => ({ ...f, availableOnly: false })) });
    }
    if (filters.sort !== 'popular') {
      chips.push({ id: 'sort', label: SORT_LABELS[filters.sort], onRemove: () => setFilters(f => ({ ...f, sort: 'popular' })) });
    }
    if (filters.minRating !== 0) {
      chips.push({ id: 'rating', label: `${filters.minRating}+ stars`, onRemove: () => setFilters(f => ({ ...f, minRating: 0 })) });
    }
    return chips;
  }, [filters, searchQuery]);

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
  }, []);

  const openSheet = useCallback(() => {
    setPendingFilters(filters);
    setSheetVisible(true);
  }, [filters]);

  const applyAndClose = useCallback(() => {
    setFilters(pendingFilters);
    setSheetVisible(false);
  }, [pendingFilters]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: Product }) => (
    <ProductCard
      product={item}
      onPress={() => router.push(`/product/${item.id}`)}
      onUnlike={() => handleUnlike(item.id)}
      exchangeRate={exchangeRate}
      userTier={userTier ?? null}
    />
  ), [handleUnlike, router, exchangeRate, userTier]);

  const keyExtractor = useCallback((item: Product) => item.id, []);

  const ListHeader = useMemo(() => {
    if (likedProducts.length === 0) return null;
    return (
      <View>
        <View style={s.resultsBar}>
          <Text style={s.resultsCount}>
            <Text style={s.resultsNum}>{filteredLiked.length}</Text>
            {filteredLiked.length === 1 ? ' item' : ' items'}
          </Text>
          {activeChips.length > 0 && (
            <TouchableOpacity onPress={clearAllFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
        {activeChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsContent}
            style={{ marginBottom: 8 }}
          >
            {activeChips.map(chip => (
              <ActiveChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </ScrollView>
        )}
      </View>
    );
  }, [likedProducts.length, filteredLiked.length, activeChips, clearAllFilters]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Liked</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar — only when there are liked items to filter */}
      {!loading && !loadError && likedProducts.length > 0 && (
        <View style={s.searchRow}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            showFilter
            onFilterPress={openSheet}
            filterActive={hasActiveFilters}
          />
        </View>
      )}

      {/* Unlike error banner */}
      {unlikeError && (
        <View style={s.errorBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.danger} />
          <Text style={s.errorBannerText}>Couldn&apos;t remove item — please try again.</Text>
          <TouchableOpacity onPress={() => setUnlikeError(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Body */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : loadError ? (
        <View style={s.centered}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} style={{ marginBottom: 10 }} />
          <Text style={s.errorText}>Couldn&apos;t load your liked items.</Text>
          <Text style={s.errorSub}>Check your connection and try again.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLiked}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={[
            s.gridContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          extraData={filteredLiked.length}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <LikedEmptyState
              noLikedItems={likedProducts.length === 0}
              onClearFilters={clearAllFilters}
              onExplore={() => router.push('/explore')}
            />
          }
        />
      )}

      {/* Filter sheet */}
      <FilterSheet
        visible={sheetVisible}
        pendingFilters={pendingFilters}
        onChange={setPendingFilters}
        hasRatingData={hasRatingData}
        onClose={() => setSheetVisible(false)}
        onApply={applyAndClose}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  // Search bar
  searchRow: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // Error banner (unlike failure)
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.danger,
  },

  // States
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
    textAlign: 'center',
  },

  // Results bar
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  resultsNum: {
    fontWeight: '800',
    color: COLORS.carbon,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },
  chipsContent: {
    gap: 8,
    paddingRight: H_PAD,
  },

  // Grid
  gridContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    gap: COL_GAP,
  },
  row: {
    gap: COL_GAP,
  },

  // Card
  card: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  cardImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
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
  cardBody: {
    padding: 10,
    gap: 4,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    lineHeight: 17,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  cardPriceUnavailable: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    fontStyle: 'italic',
  },
  availBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  availBadgeRented: {
    backgroundColor: COLORS.softGray200,
  },
  availBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  availBadgeTextRented: {
    color: COLORS.fg3,
  },

  // Empty states
  empty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  exploreBtn: {
    height: 44,
    paddingHorizontal: 24,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
