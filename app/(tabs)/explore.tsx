import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Animated,
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
import {
  fetchAllOccupancy, gridAvailability, computeAvailableUnits, effectiveStock, type OccupancyRecord,
} from '@/utils/availability';
import { EXPLORE_COPY } from '@/constants/exploreCopy';
import RotatingLine from '@/components/explore/RotatingLine';
import CategoryFilterRow from '@/components/explore/CategoryFilterRow';
import CountUpText from '@/components/CountUpText';
import { MOTION, useReducedMotion } from '@/constants/motion';
import { weekendWindow, whyBuyCatalogueRanked } from '@/lib/homeData';
import { getHomeConfig, DEFAULT_BUDGET_THRESHOLD_LAK } from '@/lib/homeConfig';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { vteMonthKey } from '@/functions/src/shared/dates';
import { toLak, formatLakRange } from '@/utils/currency';
import { useProductSearch, bestMatchId } from '@/hooks/useProductSearch';
import { SEARCH_COPY } from '@/constants/searchCopy';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { COLLECTION_TILE, type CollectionDoc } from '@/lib/collections';
import { CategoryBadge, UI } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { useQuickAdd } from '@/components/quickadd/QuickAddProvider';
import { getProductAccessState } from '@/utils/productAccess';
import { SurpriseCard, AskCard, type Surprise } from '@/components/explore/SurpriseCards';
import { getReviewQuotes, type ReviewQuote } from '@/lib/reviewQuotes';
import { useResidentPromo } from '@/lib/residency';
import { useMyLoyalty, useAveragePointsPerRental, loyaltyCardSubline } from '@/lib/loyaltyUi';

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

type QuickKey = 'weekend' | 'under' | 'newItems' | 'popular';
const NO_QUICK: Record<QuickKey, boolean> = { weekend: false, under: false, newItems: false, popular: false };
// Sticky search + categories: overlay vertical padding (like the Home sticky search).
const STICKY_PAD = 8;

/** One-column list rows: pairs of cards, or a full-width surprise card. */
type Row = { key: string; kind: 'pair'; items: Product[] } | { key: string; kind: 'surprise'; item: Surprise };
// Surprise cards: after every SURPRISE_EVERY pairs (8 products — never in the first 4),
// rotating types, a type with no data skipped, never two in a row, none during a search.
const SURPRISE_EVERY = 4;
const SURPRISE_ORDER: Surprise['kind'][] = ['collection', 'review', 'whyBuy', 'resident', 'loyalty'];


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
  // Quick filter chips (combinable with category, search and the filter sheet).
  const [quick, setQuick] = useState<Record<QuickKey, boolean>>(NO_QUICK);
  const [budgetLak, setBudgetLak] = useState(DEFAULT_BUDGET_THRESHOLD_LAK);
  const shop = useShopInfo();
  const timeSlots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const reduce = useReducedMotion();

  // Sticky search + categories (overlay copy once the inline block reaches the top).
  const scrollY = useRef(new Animated.Value(0)).current;
  const [pinY, setPinY] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinAt = pinY != null ? pinY - STICKY_PAD : Number.MAX_SAFE_INTEGER;

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
      cached('occupancy', HOME_TTL.occupancy, fetchAllOccupancy).then(setOccupancy).catch(() => setOccupancy(null));
      cached('homeConfig', HOME_TTL.config, getHomeConfig).then(c => setBudgetLak(c.budgetThresholdLak));
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
    setQuick(NO_QUICK);
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
        label: `${formatLakRange(filters.priceMin, filters.priceMax)} / day`,
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

  // "Free this weekend": units free per product for the weekend window (booking rule).
  const weekend = useMemo(
    () => weekendWindow(new Date(), d => getAvailableTimeSlots(d, timeSlots)),
    [timeSlots],
  );
  const weekendUnitsById = useMemo(() => {
    const m = new Map<string, number>();
    if (!weekend || !occupancy) return m;
    for (const p of allProducts) {
      if (p.available === false) continue;
      m.set(p.id, computeAvailableUnits(occupancy.get(p.id) ?? [], weekend.pickupAt, weekend.returnAt, effectiveStock(p)));
    }
    return m;
  }, [allProducts, occupancy, weekend]);
  // "Popular" chip: ≥ 3 returns this month (rentalsByMonth) OR the admin "Popular" flag
  // (the flag alone while the month has no data yet).
  const isPopular = useCallback((p: Product) => {
    const n = p.rentalsByMonth?.[vteMonthKey(Date.now())] ?? 0;
    return n >= 3 || p.showInPopular === true;
  }, []);
  // "{n} ready today": renter-visible products with a unit free today (grid rule).
  const readyToday = useMemo(
    () => (occupancy ? allProducts.filter(p => gridAvailability(p, occupancy.get(p.id) ?? []) === null).length : null),
    [allProducts, occupancy],
  );

  // Search (lib/search.ts, debounced): relevance order by default ("Popular" = the
  // default sort); an explicit other sort (price, newest, rating) is respected.
  const search = useProductSearch(allProducts, searchQuery);
  const filteredProducts = useMemo(() => {
    const matched = filterProducts(allProducts, filters, {
      category: activeCategory,
      exchangeRate,
      categories: EXPLORE_CATEGORIES,
    });
    const quickOk = (p: Product) =>
      (!quick.weekend || (weekendUnitsById.get(p.id) ?? 0) >= 1)
      && (!quick.under || (exchangeRate != null && p.pricePerDay > 0 && toLak(p.pricePerDay, exchangeRate) <= budgetLak))
      && (!quick.newItems || p.showInNew === true)
      && (!quick.popular || isPopular(p));
    const base = matched.filter(quickOk);
    if (!search.active) return sortProducts(base, filters.sort);
    const allowed = new Set(base.map(p => p.id));
    const ranked = search.results.filter(r => allowed.has(r.product.id)).map(r => r.product);
    return filters.sort === 'popular' ? ranked : sortProducts(ranked, filters.sort);
  }, [allProducts, activeCategory, filters, exchangeRate, search, quick, weekendUnitsById, budgetLak, isPopular]);
  const bestId = search.active && filters.sort === 'popular' ? bestMatchId(filteredProducts, search.scoreById) : null;

  const n = filteredProducts.length;
  const onlyQuick = (Object.keys(quick) as QuickKey[]).filter(k => quick[k]);
  const budgetLabel = budgetLak.toLocaleString('en-US');
  const resultsLine = search.active ? EXPLORE_COPY.results.search(n)
    : onlyQuick.length === 1 && onlyQuick[0] === 'weekend' ? EXPLORE_COPY.results.weekend(n)
    : onlyQuick.length === 1 && onlyQuick[0] === 'under' ? EXPLORE_COPY.results.under(n, budgetLabel)
    : onlyQuick.length === 1 && onlyQuick[0] === 'newItems' ? EXPLORE_COPY.results.newItems(n)
    : onlyQuick.length === 1 && onlyQuick[0] === 'popular' ? EXPLORE_COPY.results.popular(n)
    : EXPLORE_COPY.results.base(n);
  const sortLabel = search.active && filters.sort === 'popular' ? EXPLORE_COPY.bestMatchSort : SORT_LABELS[filters.sort];

  // Surprise card data (real only).
  const [quotes, setQuotes] = useState<ReviewQuote[]>([]);
  useEffect(() => {
    if (allProducts.length === 0) return;
    getReviewQuotes(allProducts).then(setQuotes).catch(() => setQuotes([]));
  }, [allProducts]);
  const residentPct = useResidentPromo();
  const loyalty = useMyLoyalty();
  const avgPoints = useAveragePointsPerRental();
  const surprisePools = useMemo(() => {
    const why = whyBuyCatalogueRanked(allProducts, exchangeRate)[0];
    const loyaltyLine = !loyalty.loading && !loyalty.excluded && loyalty.progress?.next
      ? loyaltyCardSubline(loyalty.progress, avgPoints, loyalty.config) : null;
    return {
      collection: search.collections.map(c => ({ kind: 'collection', collection: c }) as Surprise),
      review: quotes.map(q => ({ kind: 'review', quote: q }) as Surprise),
      whyBuy: why ? [{ kind: 'whyBuy', pick: why } as Surprise] : [],
      resident: residentPct ? [{ kind: 'resident', percent: residentPct } as Surprise] : [],
      loyalty: loyaltyLine ? [{ kind: 'loyalty', line: loyaltyLine } as Surprise] : [],
    } satisfies Record<Surprise['kind'], Surprise[]>;
  }, [allProducts, exchangeRate, search.collections, quotes, residentPct, loyalty, avgPoints]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const used: Record<Surprise['kind'], number> = { collection: 0, review: 0, whyBuy: 0, resident: 0, loyalty: 0 };
    let turn = 0;
    const nextSurprise = (): Surprise | null => {
      for (let k = 0; k < SURPRISE_ORDER.length; k++) {
        const kind = SURPRISE_ORDER[(turn + k) % SURPRISE_ORDER.length];
        const pool = surprisePools[kind];
        if (pool.length === 0) continue;
        turn = (turn + k + 1) % SURPRISE_ORDER.length;
        return pool[used[kind]++ % pool.length];
      }
      return null;
    };
    for (let i = 0, pair = 0; i < filteredProducts.length; i += 2, pair++) {
      out.push({ key: `p${filteredProducts[i].id}`, kind: 'pair', items: filteredProducts.slice(i, i + 2) });
      const more = i + 2 < filteredProducts.length;
      if (!search.active && more && (pair + 1) % SURPRISE_EVERY === 0) {
        const item = nextSurprise();
        if (item) out.push({ key: `s${pair}`, kind: 'surprise', item });
      }
    }
    return out;
  }, [filteredProducts, search.active, surprisePools]);

  // ── Render ────────────────────────────────────────────────────────────────

  const { openQuickAdd } = useQuickAdd();
  const renderCard = useCallback((item: Product) => {
    const availability = gridAvailability(item, occupancy ? (occupancy.get(item.id) ?? []) : undefined);
    const locked = getProductAccessState(item, userTier ?? null).locked;
    return (
    <ProductGridCard
      key={item.id}
      product={item}
      width={CARD_WIDTH}
      onPress={() => router.push(`/product/${item.id}`)}
      isFavorite={favorites.has(item.id)}
      onToggleFavorite={() => handleToggleFavorite(item.id)}
      exchangeRate={exchangeRate}
      userTier={userTier ?? null}
      availability={availability}
      bestMatch={item.id === bestId}
      matchPercent={isAdmin && search.active ? (search.scoreById.get(item.id) ?? null) : null}
      weekendUnits={quick.weekend ? (weekendUnitsById.get(item.id) ?? null) : null}
      quickAdd={locked ? null : availability ? 'later' : 'now'}
      onQuickAdd={() => openQuickAdd(item, { availableToday: !availability })}
    />
    );
  }, [favorites, handleToggleFavorite, router, exchangeRate, userTier, occupancy, bestId, isAdmin, search, quick.weekend, weekendUnitsById, openQuickAdd]);

  const renderRow = useCallback(({ item }: { item: Row }) => (
    item.kind === 'pair'
      ? <View style={styles.row}>{item.items.map(renderCard)}</View>
      : <View style={styles.surprise}><SurpriseCard item={item.item} /></View>
  ), [renderCard]);

  const toggleQuick = (k: QuickKey) => setQuick(q => ({ ...q, [k]: !q[k] }));
  const quickChips: { key: QuickKey; label: string; icon?: 'calendar'; disabled?: boolean }[] = [
    { key: 'weekend', label: EXPLORE_COPY.chips.weekend, icon: 'calendar', disabled: !weekend || !occupancy },
    { key: 'under', label: EXPLORE_COPY.chips.under(budgetLabel) },
    { key: 'newItems', label: EXPLORE_COPY.chips.newItems },
    { key: 'popular', label: EXPLORE_COPY.chips.popular },
  ];

  // Search field + categories: inline in the header, and as the pinned overlay copy.
  const searchAndCategories = (
    <>
      <SearchBar
        variant="account"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={EXPLORE_COPY.searchPlaceholder}
        showFilter
        onFilterPress={openSheet}
        filterActive={hasActiveFilters}
      />
      <View style={{ marginTop: 12 }}>
        <CategoryFilterRow categories={EXPLORE_CATEGORIES} active={activeCategory} onSelect={setActiveCategory} />
      </View>
    </>
  );

  const header = (
    <View>
      <View style={styles.headerBand}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{EXPLORE_COPY.title}</Text>
            <RotatingLine lines={EXPLORE_COPY.oneLiners} style={styles.oneLiner} />
          </View>
          {readyToday != null && (
            <View style={styles.counter}>
              <CountUpText id="explore.readyToday" value={readyToday} style={styles.counterNum} />
              <Text style={styles.counterLabel}>{EXPLORE_COPY.readyToday}</Text>
            </View>
          )}
        </View>
        <View onLayout={e => setPinY(e.nativeEvent.layout.y)}>{searchAndCategories}</View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {quickChips.map(c => (
          <PressScale
            key={c.key}
            style={[styles.quickChip, quick[c.key] && styles.quickChipOn, c.disabled && UI.btnDisabled]}
            onPress={() => toggleQuick(c.key)}
            disabled={c.disabled}
          >
            {c.icon && <Feather name={c.icon} size={13} color={quick[c.key] ? SHADES.amber : SHADES.carbon} />}
            <Text style={[styles.quickChipText, quick[c.key] && styles.quickChipTextOn]}>{c.label}</Text>
          </PressScale>
        ))}
      </ScrollView>

      {activeChips.length > 0 && (
        <View style={styles.resultsChipsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChipsContent}>
            {activeChips.map(chip => <ActiveChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />)}
            <TouchableOpacity onPress={clearAllFilters} hitSlop={8} style={{ justifyContent: 'center' }}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {!loading && (
        <View style={styles.resultsBar}>
          <Text style={styles.resultsLine} numberOfLines={1}>
            <Text style={styles.resultsNum}>{resultsLine.split(' ')[0]}</Text>
            {` ${resultsLine.split(' ').slice(1).join(' ')}`}
          </Text>
          <TouchableOpacity onPress={openSheet} hitSlop={8} style={styles.sortBtn}>
            <Text style={UI.link}>{sortLabel}</Text>
            <Feather name="chevron-down" size={14} color={SHADES.amberText} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* One flex child (list) + the absolute sticky overlay — Fabric-safe layout. */}
      <View style={{ flex: 1 }}>
        {loadError ? (
          <View style={styles.loadError}>
            <Feather name="alert-circle" size={28} color={SHADES.carbonMuted} />
            <Text style={styles.loadErrorTitle}>Couldn&apos;t load items</Text>
            <Text style={styles.loadErrorBody}>Check your connection and try again.</Text>
          </View>
        ) : (
          <Animated.FlatList
            style={styles.grid}
            data={loading ? [] : rows}
            renderItem={renderRow}
            keyExtractor={item => item.key}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            extraData={{ favorites, productCount: allProducts.length }}
            ListHeaderComponent={header}
            ListFooterComponent={!loading && rows.length > 0 ? <View style={{ marginTop: 4 }}><AskCard onPress={openRequest} /></View> : null}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
              listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
                const next = e.nativeEvent.contentOffset.y >= pinAt;
                setPinned(prev => (prev === next ? prev : next));
              },
            })}
            ListEmptyComponent={
              loading ? (
                <View style={styles.skeletonGrid}>
                  {[0, 1, 2, 3].map(i => <View key={i} style={[styles.skeletonCard, { height: cardLayout.card }]} />)}
                </View>
              ) : search.active && allProducts.length > 0 ? (
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

        {/* Pinned search + categories — fades in once the inline block reaches the top */}
        <Animated.View
          pointerEvents={pinned ? 'auto' : 'none'}
          style={[styles.sticky, {
            opacity: scrollY.interpolate({ inputRange: [pinAt - (reduce ? 0.5 : 10), pinAt], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: scrollY.interpolate({ inputRange: [pinAt - (reduce ? 0.5 : 10), pinAt], outputRange: [reduce ? 0 : -MOTION.riseY, 0], extrapolate: 'clamp' }) }],
          }]}
        >
          {searchAndCategories}
        </Animated.View>
      </View>

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
      <View style={{ marginTop: 22, alignSelf: 'stretch' }}><AskCard onPress={onRequestItem} /></View>
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
        <View style={{ marginTop: 22, alignSelf: 'stretch' }}><AskCard onPress={onRequestItem} /></View>
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
      <View style={{ marginTop: 22, alignSelf: 'stretch' }}><AskCard onPress={onRequestItem} /></View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBand: {
    backgroundColor: SHADES.white, marginHorizontal: -H_PAD, paddingHorizontal: H_PAD, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  oneLiner: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  counter: { alignItems: 'flex-end', paddingTop: 4 },
  counterNum: { fontSize: 24, fontWeight: '800', color: SHADES.amberText, lineHeight: 28 },
  counterLabel: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted },
  quickRow: { gap: 8, paddingVertical: 14 },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: SHADES.white, borderWidth: 0.5, borderColor: SHADES.border,
  },
  quickChipOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  quickChipText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  quickChipTextOn: { color: SHADES.cream },
  resultsLine: { flex: 1, fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: H_PAD, paddingVertical: STICKY_PAD,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  searchEmpty: { paddingTop: 32, paddingHorizontal: 4 },
  suggestLabel: { fontSize: 13, fontWeight: '700', color: SHADES.carbonMuted, marginBottom: 10 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestCat: { width: 64, alignItems: 'center', gap: 6 },
  suggestCatText: { fontSize: 12, fontWeight: '600', color: SHADES.carbon },
  suggestCol: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '100%' },
  suggestColText: { fontSize: 13, fontWeight: '700' },
  // White behind the status bar (matches the white header band); list on porcelain.
  container: { flex: 1, backgroundColor: SHADES.white },

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
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: SHADES.carbon, lineHeight: 33 },
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
  resultsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 12 },
  resultsCount: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  resultsNum: { fontWeight: '800', color: SHADES.carbon },
  clearAllText: { fontSize: 12.5, fontWeight: '700', color: SHADES.amberText, marginLeft: 4 },

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
  grid: { flex: 1, backgroundColor: COLORS.porcelain },
  gridContent: { paddingHorizontal: H_PAD, paddingBottom: 36 },
  row: { flexDirection: 'row', gap: COL_GAP, marginBottom: COL_GAP },
  surprise: { marginBottom: COL_GAP },

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
