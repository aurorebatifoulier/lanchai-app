import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Platform,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import ProductGridCard, { useProductCardLayout } from '@/components/ProductGridCard';
import SearchBar from '@/components/SearchBar';
import FilterSheet, { ActiveChip } from '@/components/FilterSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProducts,
  getFavorites,
  addFavorite,
  removeFavorite,
  submitRequest,
} from '@/lib/firestore';
import { CATEGORIES, type Product } from '@/lib/mockData';
import { SHADES } from '@/constants/brandShades';
import {
  Filters,
  PRICE_CONFIG,
  SORT_LABELS,
  DEFAULT_FILTERS,
} from '@/lib/filterConfig';
import { filterProducts, sortProducts } from '@/utils/productFilters';
import { useExchangeRate } from '@/lib/exchangeRate';
import { useLoyaltyTier } from '@/lib/loyalty';
import { formatKip } from '@/utils/currency';
import { fetchAllOccupancy, gridAvailability, type OccupancyRecord } from '@/utils/availability';
import { useProductSearch, bestMatchId } from '@/hooks/useProductSearch';
import { SEARCH_COPY } from '@/constants/searchCopy';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { COLLECTION_TILE, type CollectionDoc } from '@/lib/collections';
import { CategoryBadge } from '@/components/account/ui';
import PressScale from '@/components/PressScale';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 16;
const COL_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2;

const EXPLORE_CATEGORIES = [
  { id: 'all',     name: 'All'     },
  { id: 'fun',     name: 'Fun'     },
  { id: 'tools',   name: 'Tools'   },
  { id: 'outdoor', name: 'Outdoor' },
  { id: 'sports',  name: 'Sports'  },
  { id: 'kids',    name: 'Kids'    },
  { id: 'home',    name: 'Home'    },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const cardLayout = useProductCardLayout();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const userTier = useLoyaltyTier();
  const exchangeRate = useExchangeRate();
  const CURRENT_USER = user?.uid ?? '';
  // maxPrice (LAK / day, optional): starts with the price filter set — Home "Under X LAK a day".
  const { q: initialQuery, maxPrice } = useLocalSearchParams<{ q?: string; maxPrice?: string }>();

  // Data
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState(false);
  const [favorites, setFavorites]     = useState<Set<string>>(new Set());

  // Filters
  const [activeCategory, setActiveCategory] = useState('all');
  const [filters, setFilters]               = useState<Filters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters]  = useState<Filters>(DEFAULT_FILTERS);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sheet
  const [sheetVisible, setSheetVisible] = useState(false);

  // Request modal
  const [requestVisible, setRequestVisible] = useState(false);
  const [requestText,    setRequestText]    = useState('');
  const [requestContact, setRequestContact] = useState('');
  const [requestSent,    setRequestSent]    = useState(false);
  const [requestBusy,    setRequestBusy]    = useState(false);
  // All products' occupancy in ONE query (fetchAllOccupancy) — null until loaded or if
  // it failed, in which case cards show no booking badge (never a false "Back on").
  const [occupancy,      setOccupancy]      = useState<Map<string, OccupancyRecord[]> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      if (!CURRENT_USER) { setLoading(false); return; }
      setLoading(true);
      setLoadError(false);
      // Same short cache as the Home (lib/homeCache.ts) — no re-read on every tab switch.
      cached('products', HOME_TTL.products, getProducts)
        .then(data => { setAllProducts(data); setLoading(false); })
        .catch(() => { setLoadError(true); setLoading(false); });
      getFavorites(CURRENT_USER).then(ids => setFavorites(new Set(ids)));
      fetchAllOccupancy().then(setOccupancy).catch(() => setOccupancy(null));
    }, [CURRENT_USER])
  );

  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery as string);
  }, [initialQuery]);

  // "See all" from Home "Under X LAK a day": start with the max-price filter (removable chip).
  useEffect(() => {
    const max = Number(maxPrice);
    if (!maxPrice || !Number.isFinite(max) || max <= 0) return;
    setFilters(f => ({ ...f, priceMax: Math.min(max, PRICE_CONFIG.max) }));
  }, [maxPrice]);

  // ── Favorites ─────────────────────────────────────────────────────────────

  const handleToggleFavorite = useCallback((productId: string) => {
    if (!CURRENT_USER) return;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        removeFavorite(CURRENT_USER, productId);
      } else {
        next.add(productId);
        addFavorite(CURRENT_USER, productId);
      }
      return next;
    });
  }, [CURRENT_USER]);

  // ── Rating data availability ──────────────────────────────────────────────

  const hasRatingData = useMemo(
    () => allProducts.some(p => p.averageRating != null && p.averageRating > 0),
    [allProducts]
  );

  // ── Filter sheet ──────────────────────────────────────────────────────────

  const openSheet = useCallback(() => {
    setPendingFilters(filters);
    setSheetVisible(true);
  }, [filters]);

  const applyAndClose = useCallback(() => {
    setFilters(pendingFilters);
    setSheetVisible(false);
  }, [pendingFilters]);

  // ── Request modal ─────────────────────────────────────────────────────────

  const openRequest = useCallback(() => {
    setRequestText(searchQuery.trim());
    setRequestContact('');
    setRequestSent(false);
    setRequestBusy(false);
    setRequestVisible(true);
  }, [searchQuery]);

  const closeRequest = useCallback(() => setRequestVisible(false), []);

  const handleSubmitRequest = useCallback(async () => {
    if (!requestText.trim() || requestBusy) return;
    setRequestBusy(true);
    await submitRequest(requestText.trim(), requestContact.trim());
    setRequestSent(true);
    setRequestBusy(false);
  }, [requestText, requestContact, requestBusy]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const clearAllFilters = useCallback(() => {
    setActiveCategory('all');
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
  }, []);

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
    if (activeCategory !== 'all') {
      const cat = EXPLORE_CATEGORIES.find(c => c.id === activeCategory);
      chips.push({
        id: 'cat',
        label: cat?.name ?? activeCategory,
        onRemove: () => setActiveCategory('all'),
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
      chips.push({
        id: 'avail',
        label: 'Available only',
        onRemove: () => setFilters(f => ({ ...f, availableOnly: false })),
      });
    }
    if (filters.sort !== 'popular') {
      chips.push({
        id: 'sort',
        label: SORT_LABELS[filters.sort],
        onRemove: () => setFilters(f => ({ ...f, sort: 'popular' })),
      });
    }
    if (filters.minRating !== 0) {
      chips.push({
        id: 'rating',
        label: `${filters.minRating}+ stars`,
        onRemove: () => setFilters(f => ({ ...f, minRating: 0 })),
      });
    }
    return chips;
  }, [activeCategory, filters, searchQuery]);

  // Search (lib/search.ts, debounced): relevance order by default ("Popular" = the
  // default sort); an explicit other sort (price, newest, rating) is respected.
  const search = useProductSearch(allProducts, searchQuery);
  const filteredProducts = useMemo(() => {
    const matched = filterProducts(allProducts, filters, {
      category: activeCategory,
      exchangeRate,
      categories: EXPLORE_CATEGORIES,
    });
    if (!search.active) return sortProducts(matched, filters.sort);
    const allowed = new Set(matched.map(p => p.id));
    const ranked = search.results.filter(r => allowed.has(r.product.id)).map(r => r.product);
    return filters.sort === 'popular' ? ranked : sortProducts(ranked, filters.sort);
  }, [allProducts, activeCategory, filters, exchangeRate, search]);
  const bestId = search.active && filters.sort === 'popular' ? bestMatchId(filteredProducts, search.scoreById) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: Product }) => (
    <ProductGridCard
      product={item}
      width={CARD_WIDTH}
      onPress={() => router.push(`/product/${item.id}`)}
      isFavorite={favorites.has(item.id)}
      onToggleFavorite={() => handleToggleFavorite(item.id)}
      exchangeRate={exchangeRate}
      userTier={userTier ?? null}
      availability={gridAvailability(item, occupancy ? (occupancy.get(item.id) ?? []) : undefined)}
      bestMatch={item.id === bestId}
      matchPercent={isAdmin && search.active ? (search.scoreById.get(item.id) ?? null) : null}
    />
  ), [favorites, handleToggleFavorite, router, exchangeRate, userTier, occupancy, bestId, isAdmin, search]);

  const ListHeader = useMemo(() => {
    if (activeChips.length === 0) return null;
    return (
      <View style={styles.resultsChipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeChipsContent}
        >
          {activeChips.map(chip => (
            <ActiveChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </ScrollView>
      </View>
    );
  }, [activeChips]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Fixed header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={12} color={COLORS.fg3} />
          <Text style={styles.locationText}>Vientiane, Laos</Text>
        </View>

        {/* Search + filter button */}
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ marginBottom: 10 }}
          showFilter
          onFilterPress={openSheet}
          filterActive={hasActiveFilters}
        />

        {/* Category chip bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {EXPLORE_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, activeCategory === cat.id && styles.chipActive]}
              onPress={() => setActiveCategory(cat.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, activeCategory === cat.id && styles.chipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results count + clear-all row */}
        {!loading && (
          <View style={styles.resultsBar}>
            <Text style={styles.resultsCount}>
              <Text style={styles.resultsNum}>{filteredProducts.length}</Text>
              {filteredProducts.length === 1 ? ' item' : ' items'}
            </Text>
            {activeChips.length > 0 && (
              <TouchableOpacity onPress={clearAllFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Product grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map(i => <View key={i} style={[styles.skeletonCard, { height: cardLayout.card }]} />)}
        </View>
      ) : loadError ? (
        <View style={styles.loadError}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={styles.loadErrorTitle}>Couldn&apos;t load items</Text>
          <Text style={styles.loadErrorBody}>Check your connection and try again.</Text>
        </View>
      ) : (
        <FlatList
          style={styles.grid}
          data={filteredProducts}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          extraData={{ favorites, productCount: allProducts.length }}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            search.active && allProducts.length > 0 ? (
              <SearchEmptyState query={search.query} collections={search.collections} onRequestItem={openRequest} />
            ) : (
              <SmartEmptyState
                catalogueEmpty={allProducts.length === 0}
                onClearFilters={clearAllFilters}
                onRequestItem={openRequest}
              />
            )
          }
        />
      )}

      {/* ── Filter bottom sheet ───────────────────────────────────────────── */}
      <FilterSheet
        visible={sheetVisible}
        pendingFilters={pendingFilters}
        onChange={setPendingFilters}
        hasRatingData={hasRatingData}
        onClose={() => setSheetVisible(false)}
        onApply={applyAndClose}
      />

      {/* ── Request item modal ────────────────────────────────────────────── */}
      <Modal
        visible={requestVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRequest}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.requestModalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeRequest} />
          <View style={styles.requestCard}>
            {requestSent ? (
              <View style={styles.requestConfirm}>
                <View style={styles.requestCheckCircle}>
                  <Feather name="check" size={28} color={COLORS.carbon} />
                </View>
                <Text style={styles.requestConfirmTitle}>Request sent!</Text>
                <Text style={styles.requestConfirmSub}>
                  We&apos;ll look into it and let you know as soon as we can.
                </Text>
                <TouchableOpacity style={[styles.applyBtn, { marginTop: 24 }]} onPress={closeRequest}>
                  <Text style={styles.applyText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.requestTitle}>Request an item</Text>
                <Text style={styles.requestSub}>Can&apos;t find what you need? Tell us.</Text>

                <Text style={styles.sectionLabel}>What are you looking for?</Text>
                <TextInput
                  style={styles.requestInput}
                  value={requestText}
                  onChangeText={setRequestText}
                  placeholder="e.g. Stand-up paddle board, projector…"
                  placeholderTextColor={COLORS.fg3}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Contact (optional)</Text>
                <TextInput
                  style={[styles.requestInput, styles.requestInputSingle]}
                  value={requestContact}
                  onChangeText={setRequestContact}
                  placeholder="Your email or phone number"
                  placeholderTextColor={COLORS.fg3}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <View style={[styles.sheetActions, { marginTop: 20 }]}>
                  <TouchableOpacity style={styles.resetBtn} onPress={closeRequest}>
                    <Text style={styles.resetText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.applyBtn, !requestText.trim() && styles.applyBtnDisabled]}
                    onPress={handleSubmitRequest}
                    disabled={!requestText.trim() || requestBusy}
                  >
                    <Text style={styles.applyText}>
                      {requestBusy ? 'Sending…' : 'Send request'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** No search result: suggestions — categories and published "Got plans?" collections. */
function SearchEmptyState({ query, collections, onRequestItem }: { query: string; collections: CollectionDoc[]; onRequestItem: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.searchEmpty}>
      <Text style={styles.emptyTitle}>{SEARCH_COPY.noResults(query)}</Text>
      <Text style={[styles.emptySub, { marginBottom: 16 }]}>{SEARCH_COPY.noResultsSub}</Text>
      <Text style={styles.suggestLabel}>{SEARCH_COPY.categoriesLabel}</Text>
      <View style={styles.suggestRow}>
        {CATEGORIES.filter(c => c.id !== 'all').map(c => (
          <PressScale key={c.id} style={styles.suggestCat} onPress={() => router.push(`/category/${c.id}`)}>
            <CategoryBadge cat={c.id} size={44} />
            <Text style={styles.suggestCatText} numberOfLines={1}>{c.name}</Text>
          </PressScale>
        ))}
      </View>
      {collections.length > 0 && (
        <>
          <Text style={[styles.suggestLabel, { marginTop: 18 }]}>{SEARCH_COPY.collectionsLabel}</Text>
          <View style={styles.suggestRow}>
            {collections.slice(0, 4).map(c => {
              const t = COLLECTION_TILE[c.shade] ?? COLLECTION_TILE.carbonLight;
              return (
                <PressScale key={c.id} style={[styles.suggestCol, { backgroundColor: t.bg }]} onPress={() => router.push(`/collection/${c.id}`)}>
                  <MaterialCommunityIcons name={c.icon} size={18} color={t.icon} />
                  <Text style={[styles.suggestColText, { color: t.title }]} numberOfLines={1}>{c.title}</Text>
                </PressScale>
              );
            })}
          </View>
        </>
      )}
      <TouchableOpacity style={[styles.requestItemBtn, { marginTop: 22 }]} onPress={onRequestItem}>
        <Text style={styles.requestItemBtnText}>Request this item</Text>
      </TouchableOpacity>
    </View>
  );
}

function SmartEmptyState({
  catalogueEmpty,
  onClearFilters,
  onRequestItem,
}: {
  catalogueEmpty: boolean;
  onClearFilters: () => void;
  onRequestItem: () => void;
}) {
  if (catalogueEmpty) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconWrap}>
          <Feather name="package" size={32} color={COLORS.fg3} />
        </View>
        <Text style={styles.emptyTitle}>No items yet</Text>
        <Text style={styles.emptySub}>
          We&apos;re adding new items soon — check back later.
        </Text>
        <TouchableOpacity style={styles.requestItemBtn} onPress={onRequestItem}>
          <Text style={styles.requestItemBtnText}>Request this item</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Feather name="package" size={32} color={COLORS.fg3} />
      </View>
      <Text style={styles.emptyTitle}>No items match your search</Text>
      <Text style={styles.emptySub}>
        Try adjusting your filters or browsing another category.
      </Text>
      <TouchableOpacity style={styles.clearFiltersBtn} onPress={onClearFilters}>
        <Text style={styles.clearFiltersBtnText}>Clear filters</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.requestItemBtn} onPress={onRequestItem}>
        <Text style={styles.requestItemBtnText}>Request this item</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  searchEmpty: { paddingTop: 32, paddingHorizontal: 4 },
  suggestLabel: { fontSize: 13, fontWeight: '700', color: SHADES.carbonMuted, marginBottom: 10 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestCat: { width: 64, alignItems: 'center', gap: 6 },
  suggestCatText: { fontSize: 12, fontWeight: '600', color: SHADES.carbon },
  suggestCol: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '100%' },
  suggestColText: { fontSize: 13, fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: H_PAD,
    paddingTop: 6,
    backgroundColor: COLORS.porcelain,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    color: COLORS.carbon,
    lineHeight: 34,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },

  // ── Category chips ────────────────────────────────────────────────────────
  chipsScroll: {
    marginBottom: 10,
  },
  chipsContent: {
    gap: 8,
    alignItems: 'center',
    paddingRight: H_PAD,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  chipTextActive: {
    color: COLORS.porcelain,
  },

  // ── Results bar ───────────────────────────────────────────────────────────
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

  // ── Active filter chips ───────────────────────────────────────────────────
  resultsChipsRow: {
    marginBottom: 10,
  },
  activeChipsContent: {
    gap: 8,
    paddingRight: H_PAD,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.warmBeige,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.carbon,
  },

  // ── Load error ────────────────────────────────────────────────────────────
  loadError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 6,
  },
  loadErrorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
    marginTop: 8,
  },
  loadErrorBody: {
    fontSize: 13,
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Skeleton loading ──────────────────────────────────────────────────────
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COL_GAP,
    paddingHorizontal: H_PAD,
    paddingTop: 8,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    backgroundColor: COLORS.softGray200,
  },

  // ── FlatList grid ─────────────────────────────────────────────────────────
  grid: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 8,
    paddingBottom: 36,
  },
  row: {
    gap: COL_GAP,
    marginBottom: COL_GAP,
  },

  // ── Smart empty state ─────────────────────────────────────────────────────
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  clearFiltersBtn: {
    height: 46,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clearFiltersBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  requestItemBtn: {
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  requestItemBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // ── Filter bottom sheet ───────────────────────────────────────────────────
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,30,30,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.porcelain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.softGray,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
    marginBottom: 20,
  },
  sheetBody: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 10,
  },
  sliderRangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  optChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  optChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  optChipTextActive: {
    color: COLORS.porcelain,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.softGray,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: COLORS.amber,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    transform: [{ translateX: 0 }],
  },
  toggleThumbOn: {
    transform: [{ translateX: 22 }],
  },

  // Sheet footer actions
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
  },
  resetBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  applyBtn: {
    flex: 2,
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnDisabled: {
    backgroundColor: COLORS.softGray,
    shadowOpacity: 0,
    elevation: 0,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // ── Request modal ─────────────────────────────────────────────────────────
  requestModalWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(30,30,30,0.55)',
  },
  requestCard: {
    width: '100%',
    backgroundColor: COLORS.porcelain,
    borderRadius: 16,
    padding: 20,
  },
  requestTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: COLORS.carbon,
    marginBottom: 4,
  },
  requestSub: {
    fontSize: 13,
    color: COLORS.fg3,
    marginBottom: 20,
  },
  requestInput: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: COLORS.carbon,
    minHeight: 80,
  },
  requestInputSingle: {
    minHeight: 48,
  },
  requestConfirm: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  requestCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  requestConfirmTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.carbon,
    marginBottom: 8,
  },
  requestConfirmSub: {
    fontSize: 13,
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 20,
  },
});
