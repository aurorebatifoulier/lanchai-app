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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import ProductGridCard from '@/components/ProductGridCard';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle, useScreenInsets } from '@/components/account/ui';
import SearchBar from '@/components/SearchBar';
import FilterSheet, { ActiveChip } from '@/components/FilterSheet';
import { useAuth } from '@/contexts/AuthContext';
import { getProducts, getFavorites, removeFavorite } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { useLoyaltyTier } from '@/lib/loyalty';
import {
  Filters,
  PRICE_CONFIG,
  SORT_LABELS,
  DEFAULT_FILTERS,
} from '@/lib/filterConfig';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak, formatKip } from '@/utils/currency';
import { fetchAllOccupancy, gridAvailability, type OccupancyRecord } from '@/utils/availability';
import PressScale from '@/components/PressScale';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD    = 16;
const COL_GAP  = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2;


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
          <Ionicons name="heart-outline" size={30} color={SHADES.carbon} />
        </View>
        <Text style={s.emptyTitle}>No liked items yet</Text>
        <Text style={s.emptySub}>
          Tap the heart on any product to save it here.
        </Text>
        <PressScale style={[UI.btnPrimary, s.exploreBtn]} onPress={onExplore} activeOpacity={0.85}>
          <Text style={UI.btnPrimaryText}>Explore products</Text>
        </PressScale>
      </View>
    );
  }

  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <Feather name="package" size={28} color={SHADES.carbon} />
      </View>
      <Text style={s.emptyTitle}>No matches</Text>
      <Text style={s.emptySub}>
        None of your liked items match the current filters.
      </Text>
      <PressScale style={[UI.btnSecondary, s.exploreBtn]} onPress={onClearFilters} activeOpacity={0.85}>
        <Text style={UI.btnSecondaryText}>Clear filters</Text>
      </PressScale>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LikedScreen() {
  const router  = useRouter();
  const screen = useScreenInsets();
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
  // Same single-query occupancy as Explore — null until loaded or on failure.
  const [occupancy,      setOccupancy]      = useState<Map<string, OccupancyRecord[]> | null>(null);

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
    fetchAllOccupancy().then(setOccupancy).catch(() => setOccupancy(null));
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
    <ProductGridCard
      product={item}
      width={CARD_WIDTH}
      onPress={() => router.push(`/product/${item.id}`)}
      isFavorite
      onToggleFavorite={() => handleUnlike(item.id)}
      exchangeRate={exchangeRate}
      userTier={userTier ?? null}
      availability={gridAvailability(item, occupancy ? (occupancy.get(item.id) ?? []) : undefined)}
    />
  ), [handleUnlike, router, exchangeRate, userTier, occupancy]);

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
    <View style={[s.root, screen.root]}>
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
          <Text style={[UI.errorText, { flex: 1 }]}>Couldn&apos;t remove item — please try again.</Text>
          <TouchableOpacity onPress={() => setUnlikeError(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Body */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={SHADES.amber} />
        </View>
      ) : loadError ? (
        <View style={s.centered}>
          <View style={{ marginBottom: 12 }}><IconCircle icon={{ name: 'alert-circle' }} size={64} /></View>
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
            { paddingBottom: screen.contentBottom },
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

  // One-line error (unlike failure) — no red background.
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, textAlign: 'center', marginBottom: 4 },
  errorSub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center' },

  // Results bar
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '500',
    color: SHADES.carbonMuted,
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

  // Empty states (My Account design)
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: SHADES.carbonLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginBottom: 8 },
  emptySub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  exploreBtn: { paddingHorizontal: 24 },
});
