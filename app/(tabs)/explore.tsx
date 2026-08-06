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
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import SearchBar from '@/components/SearchBar';
import FilterSheet, { ActiveChip } from '@/components/FilterSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProducts,
  getFavorites,
  addFavorite,
  removeFavorite,
  submitRequest,
  type LoyaltyTier,
} from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import {
  Filters,
  PRICE_CONFIG,
  SORT_LABELS,
  DEFAULT_FILTERS,
} from '@/lib/filterConfig';
import { getMinPrice } from '@/utils/pricing';
import { useExchangeRate } from '@/lib/exchangeRate';
import { useLoyaltyTier } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import { toLak } from '@/utils/currency';

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

function formatKip(value: number): string {
  return `₭${value.toLocaleString('en-US')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userTier = useLoyaltyTier();
  const exchangeRate = useExchangeRate();
  const CURRENT_USER = user?.uid ?? '';
  const { q: initialQuery } = useLocalSearchParams<{ q?: string }>();

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

  // ── Load ──────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      if (!CURRENT_USER) { setLoading(false); return; }
      setLoading(true);
      setLoadError(false);
      getProducts()
        .then(data => { setAllProducts(data); setLoading(false); })
        .catch(() => { setLoadError(true); setLoading(false); });
      getFavorites(CURRENT_USER).then(ids => setFavorites(new Set(ids)));
    }, [CURRENT_USER])
  );

  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery as string);
  }, [initialQuery]);

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

  const filteredProducts = useMemo(() => {
    let list = [...allProducts];

    if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
    if (filters.availableOnly)    list = list.filter(p => p.available);

    // Price range (always on pricePerDay = 1–2 day base rate). PRICE_CONFIG /
    // filters.priceMin/Max are LAK-denominated (the filter UI), while pricePerDay is
    // USD — convert before comparing. Skipped while the rate hasn't loaded yet.
    if (exchangeRate != null) {
      if (filters.priceMin > PRICE_CONFIG.min) {
        list = list.filter(p => toLak(p.pricePerDay, exchangeRate) >= filters.priceMin);
      }
      if (filters.priceMax < PRICE_CONFIG.max) {
        list = list.filter(p => toLak(p.pricePerDay, exchangeRate) <= filters.priceMax);
      }
    }

    // Rating
    if (filters.minRating > 0) {
      list = list.filter(p => p.averageRating != null && p.averageRating >= filters.minRating);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => {
        const catName = EXPLORE_CATEGORIES.find(c => c.id === p.category)?.name ?? '';
        return p.name.toLowerCase().includes(q) || catName.toLowerCase().includes(q);
      });
    }

    // Sort (price sorts use pricePerDay)
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
  }, [allProducts, activeCategory, filters, searchQuery, exchangeRate]);

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: Product }) => (
    <ProductCard
      product={item}
      onPress={() => router.push(`/product/${item.id}`)}
      isFavorite={favorites.has(item.id)}
      onToggleFavorite={() => handleToggleFavorite(item.id)}
      exchangeRate={exchangeRate}
      userTier={userTier ?? null}
    />
  ), [favorites, handleToggleFavorite, router, exchangeRate, userTier]);

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
          {[0, 1, 2, 3].map(i => <View key={i} style={styles.skeletonCard} />)}
        </View>
      ) : loadError ? (
        <View style={styles.loadError}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={styles.loadErrorTitle}>Couldn't load items</Text>
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
            <SmartEmptyState
              catalogueEmpty={allProducts.length === 0}
              onClearFilters={clearAllFilters}
              onRequestItem={openRequest}
            />
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
                  We'll look into it and let you know as soon as we can.
                </Text>
                <TouchableOpacity style={[styles.applyBtn, { marginTop: 24 }]} onPress={closeRequest}>
                  <Text style={styles.applyText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.requestTitle}>Request an item</Text>
                <Text style={styles.requestSub}>Can't find what you need? Tell us.</Text>

                <Text style={styles.sectionLabel}>WHAT ARE YOU LOOKING FOR?</Text>
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

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>CONTACT (OPTIONAL)</Text>
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

function ProductCard({
  product,
  onPress,
  isFavorite,
  onToggleFavorite,
  exchangeRate,
  userTier,
}: {
  product: Product;
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
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
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardImageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.cardImage} contentFit="cover" transition={300} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Feather name="image" size={28} color={COLORS.softGray} />
          </View>
        )}

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

        <TouchableOpacity
          style={styles.heartBtn}
          onPress={e => { e.stopPropagation(); onToggleFavorite(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={15}
            color={isFavorite ? COLORS.danger : COLORS.carbon}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{product.name}</Text>
        {minPrice != null && exchangeRate != null
          ? <Text style={styles.cardPrice}>{formatKip(toLak(minPrice, exchangeRate))} / day</Text>
          : <Text style={styles.cardPriceUnavailable}>Price not set</Text>}
        <View style={[styles.badge, !product.available && styles.badgeRented]}>
          <Text style={[styles.badgeText, !product.available && styles.badgeTextRented]}>
            {product.available ? 'Available' : 'Rented'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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
          We're adding new items soon — check back later.
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: COLORS.fg3,
    textTransform: 'uppercase',
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
    height: 234,
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

  // ── Product card ──────────────────────────────────────────────────────────
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImageWrap: {
    width: '100%',
    height: 150,
    position: 'relative',
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
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 10,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
    lineHeight: 17,
    marginBottom: 4,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.fg2,
    marginBottom: 8,
  },
  cardPriceUnavailable: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRented: {
    backgroundColor: COLORS.softGray,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: 0.2,
  },
  badgeTextRented: {
    color: COLORS.fg3,
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
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
