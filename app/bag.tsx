import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import { useBookingHold } from '@/lib/bookingHold';
import { useAuth } from '@/contexts/AuthContext';
import {
  listenBagItems,
  removeFromBag,
  updateBagItemDates,
  updateAllBagItemDates,
  updateBagItemQuantity,
  BagItem,
} from '@/lib/bag';
import { getRenterProduct } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { getAvailableStock, effectiveStock } from '@/utils/availability';
import { getEffectiveRate, billableDaysFromDates, depositForLine } from '@/utils/pricing';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { getUserProfile, type UserProfile } from '@/lib/firestore';
import { useLoyaltyConfig, depositPercentFor } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import DateRangePicker from '@/components/DateRangePicker';
import { PriceLak } from '@/components/PriceLak';
import PressScale from '@/components/PressScale';

// ── Date format helper ────────────────────────────────────────────────────────
const DOW_S  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDateTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${DOW_S[d.getDay()]} ${d.getDate()} ${MON_S[d.getMonth()]} · ${h}:${m}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function BagScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const loyaltyConfig = useLoyaltyConfig();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  // Converts a product's USD deposit to LAK, applying the customer-type/loyalty-tier
  // deposit percentage.
  // Per unit × quantity — the server's formula (shared depositForLine).
  const depositLakFor = useCallback((usdDeposit: number, quantity: number): number => {
    if (exchangeRate == null) return 0;
    const percent = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
    return depositForLine(usdDeposit, exchangeRate, percent, quantity).deposit;
  }, [exchangeRate, profile, loyaltyConfig]);

  const [items,      setItems]      = useState<BagItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [productMap, setProductMap] = useState<Record<string, Product | null>>({});
  const [stockMap,   setStockMap]   = useState<Record<string, number>>({});
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);

  // Track fetched products and checked availability combos to avoid redundant reads
  const fetchedProductIds = useRef<Set<string>>(new Set());
  const checkedAvail      = useRef<Set<string>>(new Set());

  // ── Bag listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = listenBagItems(
      user.uid,
      received => { setItems(received); setLoading(false); },
      ()       => { setLoading(false); },
    );
    return unsub;
  }, [user]);

  // ── Fetch products for new items ──────────────────────────────────────────
  useEffect(() => {
    items.forEach(item => {
      if (fetchedProductIds.current.has(item.productId)) return;
      fetchedProductIds.current.add(item.productId);
      getRenterProduct(item.productId).then(p => {
        setProductMap(prev => ({ ...prev, [item.productId]: p }));
      });
    });
  }, [items]);

  // ── Availability check for items with dates set ───────────────────────────
  useEffect(() => {
    items.forEach(item => {
      if (!item.pickupAt || !item.returnAt) return;
      const product = productMap[item.productId];
      if (!product) return;

      const key = `${item.id}:${item.pickupAt.seconds}:${item.returnAt.seconds}`;
      if (checkedAvail.current.has(key)) return;
      checkedAvail.current.add(key);

      const pickup = item.pickupAt.toDate();
      const ret    = item.returnAt.toDate();
      getAvailableStock(item.productId, pickup, ret, effectiveStock(product)).then(avail => {
        setStockMap(prev => ({ ...prev, [item.id]: avail }));
      });
    });
  }, [items, productMap]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // Per-item conflict: known stock < requested quantity
  const conflictMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    items.forEach(item => {
      if (!item.pickupAt || !item.returnAt) return;
      const avail = stockMap[item.id];
      if (avail === undefined) return;
      if (avail < item.quantity) map[item.id] = true;
    });
    return map;
  }, [items, stockMap]);

  // Items that are fully ready for checkout
  const readyItems = useMemo(() =>
    items.filter(item => {
      if (!item.pickupAt || !item.returnAt) return false;
      const avail = stockMap[item.id];
      if (avail === undefined) return false;
      if (avail < item.quantity) return false;
      const product = productMap[item.productId];
      if (!product) return false;
      if (getProductAccessState(product, profile?.loyaltyTier ?? null).locked) return false;
      const days = billableDaysFromDates(item.pickupAt.toDate(), item.returnAt.toDate());
      return getEffectiveRate(product, days) !== null;
    }),
    [items, stockMap, productMap, profile],
  );

  const totalRental = useMemo(() =>
    readyItems.reduce((sum, item) => {
      const product = productMap[item.productId];
      if (!product || !item.pickupAt || !item.returnAt || exchangeRate == null) return sum;
      const days = billableDaysFromDates(item.pickupAt.toDate(), item.returnAt.toDate());
      const rate = getEffectiveRate(product, days);
      if (rate === null) return sum;
      const rateLak = toLak(rate, exchangeRate);
      return sum + rateLak * days * item.quantity;
    }, 0),
    [readyItems, productMap, exchangeRate],
  );

  const totalDeposit = useMemo(() =>
    readyItems.reduce((sum, item) => {
      const product = productMap[item.productId];
      if (!product || exchangeRate == null) return sum;
      return sum + depositLakFor(product.deposit, item.quantity);
    }, 0),
    [readyItems, productMap, exchangeRate, depositLakFor],
  );

  const itemsNeedingDates = items.filter(i => !i.pickupAt || !i.returnAt).length;

  const activeBagItem = useMemo(
    () => (datePickerItemId ? (items.find(i => i.id === datePickerItemId) ?? null) : null),
    [datePickerItemId, items],
  );

  // Source item for "use same dates for all" — the first item that actually HAS
  // dates set, not strictly items[0]: listenBagItems has no orderBy, so array order
  // isn't guaranteed to reflect "first added."
  const dateSourceItem = useMemo(
    () => items.find(i => i.pickupAt && i.returnAt) ?? null,
    [items],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRemove = useCallback((itemId: string) => {
    if (!user) return;
    removeFromBag(user.uid, itemId).catch(() => {});
  }, [user]);

  const handleQuantityChange = useCallback(async (item: BagItem, delta: number) => {
    if (!user) return;
    const product  = productMap[item.productId];
    const avail    = stockMap[item.id];
    const maxQty   = avail !== undefined ? avail : (product ? effectiveStock(product) : 99);
    const next     = Math.max(1, Math.min(maxQty, item.quantity + delta));
    if (next === item.quantity) return;
    try { await updateBagItemQuantity(user.uid, item.id, next); } catch {}
  }, [user, productMap, stockMap]);

  const handleDateConfirm = useCallback(async (pickup: Date, ret: Date) => {
    if (!user || !datePickerItemId) return;
    const itemId = datePickerItemId;
    setDatePickerItemId(null);
    try { await updateBagItemDates(user.uid, itemId, pickup, ret); } catch {}
  }, [user, datePickerItemId]);

  const bookingHold = useBookingHold();

  const handleCheckout = useCallback(() => {
    router.push('/bag/checkout');
  }, [router]);

  // No pre-flight availability check needed — writing the copied dates triggers
  // listenBagItems' live onSnapshot, which cache-misses the existing stockMap/
  // conflictMap effect and re-fetches per item automatically, surfacing the
  // existing per-item conflictBanner wherever the copied dates don't work.
  const handleUseSameDates = useCallback(() => {
    if (!user || !dateSourceItem?.pickupAt || !dateSourceItem?.returnAt) return;
    const otherIds = items.filter(i => i.id !== dateSourceItem.id).map(i => i.id);
    updateAllBagItemDates(
      user.uid,
      otherIds,
      dateSourceItem.pickupAt.toDate(),
      dateSourceItem.returnAt.toDate(),
    ).catch(() => {});
  }, [user, items, dateSourceItem]);

  // ── Item card ─────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: BagItem }) => {
    const product     = productMap[item.productId];
    const avail       = stockMap[item.id];
    const maxQty      = avail !== undefined ? avail : (product ? effectiveStock(product) : 99);
    const hasConflict = conflictMap[item.id] ?? false;
    const hasDates    = !!(item.pickupAt && item.returnAt);
    const accessState = product ? getProductAccessState(product, profile?.loyaltyTier ?? null) : null;

    let days = 0, effectiveRate: number | null = null, subtotal = 0;
    if (hasDates && product && item.pickupAt && item.returnAt && exchangeRate != null) {
      days = billableDaysFromDates(item.pickupAt.toDate(), item.returnAt.toDate());
      const rateUsd = getEffectiveRate(product, days);
      effectiveRate = rateUsd != null ? toLak(rateUsd, exchangeRate) : null;
      subtotal      = effectiveRate != null ? effectiveRate * days * item.quantity : 0;
    }

    return (
      <View style={s.card}>
        {/* Top row: thumbnail + name + delete */}
        <View style={s.cardTop}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push(`/product/${item.productId}`)}
          >
            {item.productImage ? (
              <Image source={{ uri: item.productImage }} style={s.thumb} contentFit="cover" />
            ) : (
              <View style={[s.thumb, s.thumbPlaceholder]}>
                <Feather name="image" size={18} color={COLORS.softGray} />
              </View>
            )}
          </TouchableOpacity>

          <Text style={s.cardName} numberOfLines={2}>{item.productName}</Text>

          <TouchableOpacity
            style={s.deleteBtn}
            onPress={() => handleRemove(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="trash-2" size={15} color={SHADES.carbonMuted} />
          </TouchableOpacity>
        </View>

        <View style={s.divider} />

        {/* Dates section */}
        {!hasDates ? (
          <TouchableOpacity
            style={s.setDatesBtn}
            onPress={() => setDatePickerItemId(item.id)}
            activeOpacity={0.75}
          >
            <Feather name="calendar" size={14} color={SHADES.carbonMuted} />
            <Text style={s.setDatesBtnText}>Set rental dates</Text>
            <Feather name="chevron-right" size={14} color={SHADES.carbonMuted} />
          </TouchableOpacity>
        ) : (
          <View style={s.datesRow}>
            <View style={s.datesInfo}>
              <View style={s.dateLine}>
                <Text style={s.dateLabel}>Pick-up</Text>
                <Text style={s.dateValue}>{fmtDateTime(item.pickupAt!.toDate())}</Text>
              </View>
              <View style={s.dateLine}>
                <Text style={s.dateLabel}>Return </Text>
                <Text style={s.dateValue}>{fmtDateTime(item.returnAt!.toDate())}</Text>
              </View>
              {days > 0 && (
                <Text style={s.durationText}>{days} day{days !== 1 ? 's' : ''}</Text>
              )}
            </View>
            <TouchableOpacity
              style={s.editDatesBtn}
              onPress={() => setDatePickerItemId(item.id)}
            >
              <Text style={s.editDatesBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Conflict warning */}
        {hasConflict && (
          <View style={s.conflictBanner}>
            <Feather name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={s.conflictText}>
              These dates are not available. Try different dates.
            </Text>
          </View>
        )}

        {/* Access-restricted warning — won't be included at checkout */}
        {accessState?.locked && (
          <View style={s.conflictBanner}>
            <Feather name="lock" size={13} color={COLORS.danger} />
            <Text style={s.conflictText}>{accessState.message}</Text>
          </View>
        )}

        <View style={s.divider} />

        {/* Quantity */}
        <View style={s.qtyRow}>
          <Text style={s.qtyLabel}>Quantity</Text>
          <View style={s.qtyControl}>
            <TouchableOpacity
              style={[s.qtyBtn, item.quantity <= 1 && s.qtyBtnOff]}
              onPress={() => handleQuantityChange(item, -1)}
              activeOpacity={0.75}
            >
              <Feather name="minus" size={14} color={item.quantity <= 1 ? COLORS.softGray : COLORS.carbon} />
            </TouchableOpacity>
            <Text style={s.qtyNum}>{item.quantity}</Text>
            <TouchableOpacity
              style={[s.qtyBtn, item.quantity >= maxQty && s.qtyBtnOff]}
              onPress={() => handleQuantityChange(item, 1)}
              activeOpacity={0.75}
            >
              <Feather name="plus" size={14} color={item.quantity >= maxQty ? COLORS.softGray : COLORS.carbon} />
            </TouchableOpacity>
          </View>
          {avail !== undefined && (
            <Text style={[s.stockText, avail === 0 && s.stockTextOut]}>
              {avail === 0
                ? 'Out of stock'
                : product && effectiveStock(product) > 1
                ? `${avail} of ${effectiveStock(product)} available`
                : 'In stock'}
            </Text>
          )}
        </View>

        {/* Pricing — only when dates set and product loaded and no conflict */}
        {hasDates && product && !hasConflict && (
          effectiveRate !== null ? (
            <>
              <View style={s.divider} />
              <View style={s.pricingRows}>
                <View style={s.pricingRow}>
                  <Text style={s.pricingLabel}>Rental</Text>
                  <PriceLak lak={subtotal} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.pricingValue} />
                </View>
                <View style={s.pricingRow}>
                  <Text style={s.pricingLabel}>Deposit</Text>
                  {exchangeRate != null ? (
                    <PriceLak
                      lak={depositLakFor(product.deposit, item.quantity)}
                      customerType={profile?.customerType}
                      vatPercent={vatPercent}
                      textStyle={s.pricingValue}
                    />
                  ) : (
                    <Text style={s.pricingValue}>— LAK</Text>
                  )}
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={s.divider} />
              <View style={s.unpricedNotice}>
                <Feather name="alert-circle" size={13} color={SHADES.carbonMuted} />
                <Text style={s.unpricedNoticeText}>Pricing not set — this item can&apos;t be checked out.</Text>
              </View>
            </>
          )
        )}
      </View>
    );
  }, [productMap, stockMap, conflictMap, handleRemove, handleQuantityChange, router, exchangeRate, depositLakFor, profile]);

  // ── Empty state ───────────────────────────────────────────────────────────
  const renderEmptyState = () => (
    <View style={s.centered}>
      <View style={s.emptyIconWrap}>
        <Feather name="shopping-bag" size={36} color={SHADES.carbonMuted} />
      </View>
      <Text style={s.emptyTitle}>Your bag is empty</Text>
      <Text style={s.emptySub}>Add items from the catalogue to build your rental order.</Text>
      <TouchableOpacity
        style={s.exploreBtn}
        onPress={() => router.push('/explore')}
        activeOpacity={0.85}
      >
        <Text style={s.exploreBtnText}>Explore items</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const grandTotal = totalRental + totalDeposit;
  const hasBagItems = items.length > 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>
          Bag{items.length > 0 ? ` (${items.length})` : ''}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Body */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : !hasBagItems ? (
        renderEmptyState()
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListHeaderComponent={
              items.length > 1 && dateSourceItem ? (
                <TouchableOpacity
                  style={s.sameDatesBtn}
                  onPress={handleUseSameDates}
                  activeOpacity={0.75}
                >
                  <Feather name="copy" size={12} color={COLORS.carbon} />
                  <Text style={s.sameDatesBtnText}>Use same dates for all items</Text>
                </TouchableOpacity>
              ) : null
            }
          />

          {/* Sticky summary + CTA */}
          <View style={[s.summary, { paddingBottom: insets.bottom + 12 }]}>
            {itemsNeedingDates > 0 && (
              <View style={s.needsDatesRow}>
                <Feather name="info" size={13} color={SHADES.carbonMuted} />
                <Text style={s.needsDatesText}>
                  {itemsNeedingDates} item{itemsNeedingDates !== 1 ? 's' : ''} need{itemsNeedingDates === 1 ? 's' : ''} dates before checkout
                </Text>
              </View>
            )}

            {readyItems.length > 0 && (
              <>
                <View style={s.summaryRows}>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>
                      {readyItems.length} item{readyItems.length !== 1 ? 's' : ''} ready
                    </Text>
                    <PriceLak lak={totalRental} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.summaryValue} />
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>
                      Deposits{' '}
                      <Text style={s.summaryLabelNote}>(refundable on return)</Text>
                    </Text>
                    <PriceLak lak={totalDeposit} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.summaryValue} />
                  </View>
                  <View style={[s.summaryRow, s.summaryRowTotal]}>
                    <Text style={s.summaryLabelTotal}>Total</Text>
                    <PriceLak lak={grandTotal} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.summaryValueTotal} />
                  </View>
                </View>
              </>
            )}

            {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginBottom: 12 }} />}
            <PressScale
              style={[s.cta, (readyItems.length === 0 || !!bookingHold) && s.ctaOff]}
              onPress={handleCheckout}
              disabled={readyItems.length === 0 || !!bookingHold}
              activeOpacity={0.85}
            >
              <Text style={[s.ctaText, (readyItems.length === 0 || !!bookingHold) && s.ctaTextOff]}>
                {readyItems.length > 0
                  ? `Reserve ${readyItems.length} item${readyItems.length !== 1 ? 's' : ''}`
                  : 'Set dates to continue'}
              </Text>
            </PressScale>
          </View>
        </>
      )}

      {/* Date picker — rendered at root level to float above everything */}
      <DateRangePicker
        visible={datePickerItemId !== null}
        productId={activeBagItem?.productId ?? ''}
        totalStock={(() => {
          const p = activeBagItem ? productMap[activeBagItem.productId] : undefined;
          return p ? effectiveStock(p) : 1;
        })()}
        initialPickupAt={activeBagItem?.pickupAt?.toDate() ?? null}
        initialReturnAt={activeBagItem?.returnAt?.toDate() ?? null}
        onClose={() => setDatePickerItemId(null)}
        onConfirm={handleDateConfirm}
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
    borderBottomColor: SHADES.border,
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

  // Centered (loading / empty)
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  // Empty state
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: SHADES.carbonLight,
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
    color: SHADES.carbonMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  exploreBtn: {
    height: 44,
    paddingHorizontal: 24,
    backgroundColor: COLORS.amber,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sameDatesBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SHADES.border,
    backgroundColor: SHADES.carbonLight,
    marginBottom: 12,
  },
  sameDatesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Item card
  card: {
    backgroundColor: SHADES.white,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: SHADES.border,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    backgroundColor: SHADES.carbonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    lineHeight: 19,
  },
  deleteBtn: {
    padding: 4,
    flexShrink: 0,
  },

  divider: {
    height: 1,
    backgroundColor: SHADES.border,
    marginHorizontal: 14,
  },

  // Set dates CTA
  setDatesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  setDatesBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: SHADES.carbonMuted,
  },

  // Dates display
  datesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datesInfo: {
    flex: 1,
    gap: 3,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SHADES.carbonMuted,
    width: 42,
    letterSpacing: 0.1,
  },
  dateValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
    color: SHADES.carbonMuted,
    marginTop: 4,
  },
  editDatesBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SHADES.border,
    backgroundColor: SHADES.carbonLight,
  },
  editDatesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Conflict
  conflictBanner: {
    // One-line warning (no red background).
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 14,
    marginTop: 8,
  },
  conflictText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.danger, lineHeight: 18 },
  unpricedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  unpricedNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    lineHeight: 17,
  },

  // Quantity
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  qtyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: SHADES.carbonMuted,
    flex: 1,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.porcelain,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHADES.border,
    padding: 4,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: SHADES.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnOff: { opacity: 0.35 },
  qtyNum: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    minWidth: 24,
    textAlign: 'center',
  },
  stockText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.success,
  },
  stockTextOut: { color: COLORS.danger },

  // Pricing rows
  pricingRows: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },
  pricingValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Summary footer
  summary: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: SHADES.border,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  needsDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  needsDatesText: {
    fontSize: 12,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },
  summaryRows: {
    gap: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: SHADES.border,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },
  summaryLabelNote: {
    fontSize: 11,
    fontWeight: '400',
    color: SHADES.carbonMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  summaryLabelTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  summaryValueTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  // CTA
  cta: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: {
    backgroundColor: SHADES.carbonLight,
    borderWidth: 1,
    borderColor: SHADES.border,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  ctaTextOff: { color: SHADES.carbonMuted },
});
