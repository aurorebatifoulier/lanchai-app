import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { MOTION } from '@/constants/motion';
import { BAG_COPY } from '@/constants/bagCopy';
import { categoryStyle } from '@/constants/categoryStyle';
import { UI, Chip, SectionTitle, ToggleRow, useScreenInsets } from '@/components/account/ui';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import { BookingBottomBar } from '@/components/booking/BookingBlocks';
import { ConfirmBox } from '@/components/ConfirmBox';
import DateRangePicker from '@/components/DateRangePicker';
import PressScale from '@/components/PressScale';
import { useBookingHold } from '@/lib/bookingHold';
import { useAuth } from '@/contexts/AuthContext';
import {
  listenBagItems,
  removeFromBag,
  updateBagItemDates,
  updateAllBagItemDates,
  updateBagItemQuantity,
  type BagItem,
} from '@/lib/bag';
import { getRenterProduct, getUserProfile, type UserProfile } from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import { getAvailableStock, effectiveStock } from '@/utils/availability';
import { getEffectiveRate, billableDaysFromDates, depositForLine } from '@/utils/pricing';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { useLoyaltyConfig, depositPercentFor } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';

// Bag (validated mockup) — My Account / booking visual language. Header + "{n} items"
// chip; "Same dates for everything" toggle; one white card per item (thumbnail → product,
// name, dates on two lines + Edit, − / + quantity up to what's free on its dates, rental
// amount) with ONE honest signal line when relevant (tier lock, date conflict, no price,
// only 1 left); "+ Add more items" (→ Explore, filtered on the bag's period when every
// item shares it); "Your total" (rental to pay at pick-up, refundable deposit on its own
// line — never added together); bottom bar → bag checkout. Same price / deposit rules as
// the checkout and the server (getEffectiveRate, depositForLine).

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (v: number) => String(v).padStart(2, '0');
const fmtWhen = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const n = (v: number) => Math.round(v).toLocaleString('en-US');
const ms = (t: BagItem['pickupAt']) => (t ? t.toMillis() : null);

export default function BagScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { user } = useAuth();
  const exchangeRate = useExchangeRate();
  const loyaltyConfig = useLoyaltyConfig();
  const bookingHold = useBookingHold();
  const b = BAG_COPY;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  const [rawItems,   setRawItems]   = useState<BagItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [productMap, setProductMap] = useState<Record<string, Product | null>>({});
  const [stockMap,   setStockMap]   = useState<Record<string, number>>({});
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // null = follow the bag (on when every item already shares the same dates).
  const [sameDatesPref, setSameDatesPref] = useState<boolean | null>(null);

  // Avoid redundant reads: products fetched once, availability once per item + dates.
  const fetchedProductIds = useRef<Set<string>>(new Set());
  const checkedAvail      = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    return listenBagItems(
      user.uid,
      received => { setRawItems(received); setLoading(false); },
      () => setLoading(false),
    );
  }, [user]);

  // listenBagItems has no orderBy — show items in the order they were added.
  const items = useMemo(
    () => [...rawItems].sort((a, c) => (a.addedAt?.toMillis?.() ?? 0) - (c.addedAt?.toMillis?.() ?? 0)),
    [rawItems],
  );

  useEffect(() => {
    items.forEach(item => {
      if (fetchedProductIds.current.has(item.productId)) return;
      fetchedProductIds.current.add(item.productId);
      getRenterProduct(item.productId).then(p => setProductMap(prev => ({ ...prev, [item.productId]: p })));
    });
  }, [items]);

  // Units free on each item's dates (the booking rule).
  useEffect(() => {
    items.forEach(item => {
      if (!item.pickupAt || !item.returnAt) return;
      const product = productMap[item.productId];
      if (!product) return;
      const key = `${item.id}:${item.pickupAt.seconds}:${item.returnAt.seconds}`;
      if (checkedAvail.current.has(key)) return;
      checkedAvail.current.add(key);
      getAvailableStock(item.productId, item.pickupAt.toDate(), item.returnAt.toDate(), effectiveStock(product))
        .then(avail => setStockMap(prev => ({ ...prev, [item.id]: avail })))
        .catch(() => {});
    });
  }, [items, productMap]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const depositPct = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);

  /** Rental (LAK) of one item on its dates, or null (no dates / no rate / no price). */
  const rentalOf = useCallback((item: BagItem): number | null => {
    const product = productMap[item.productId];
    if (!product || !item.pickupAt || !item.returnAt || exchangeRate == null) return null;
    const days = billableDaysFromDates(item.pickupAt.toDate(), item.returnAt.toDate());
    const rate = getEffectiveRate(product, days);
    return rate == null ? null : toLak(rate, exchangeRate) * days * item.quantity;
  }, [productMap, exchangeRate]);

  const conflictOf = useCallback((item: BagItem) => {
    if (!item.pickupAt || !item.returnAt) return false;
    const avail = stockMap[item.id];
    return avail !== undefined && avail < item.quantity;
  }, [stockMap]);

  // Ready for checkout: dates, known availability, no conflict, not tier-locked, priced.
  const readyItems = useMemo(() => items.filter(item => {
    const product = productMap[item.productId];
    if (!product || !item.pickupAt || !item.returnAt || stockMap[item.id] === undefined) return false;
    if (conflictOf(item)) return false;
    if (getProductAccessState(product, profile?.loyaltyTier ?? null).locked) return false;
    return rentalOf(item) != null;
  }), [items, productMap, stockMap, conflictOf, profile, rentalOf]);

  const totalRental = readyItems.reduce((sum, item) => sum + (rentalOf(item) ?? 0), 0);
  const totalDeposit = exchangeRate == null ? 0 : readyItems.reduce((sum, item) => {
    const product = productMap[item.productId];
    return product ? sum + depositForLine(product.deposit, exchangeRate, depositPct, item.quantity).deposit : sum;
  }, 0);
  const itemsNeedingDates = items.filter(i => !i.pickupAt || !i.returnAt).length;

  // The bag's period when EVERY item has the same pick-up and return (Explore filter).
  const sharedWindow = useMemo(() => {
    const first = items[0];
    if (!first?.pickupAt || !first.returnAt) return null;
    const p = first.pickupAt.toMillis(), r = first.returnAt.toMillis();
    return items.every(i => ms(i.pickupAt) === p && ms(i.returnAt) === r) ? { pickupAt: p, returnAt: r } : null;
  }, [items]);
  const sameDates = items.length >= 2 && (sameDatesPref ?? sharedWindow != null);

  const activeBagItem = datePickerItemId ? (items.find(i => i.id === datePickerItemId) ?? null) : null;
  const activeProduct = activeBagItem ? productMap[activeBagItem.productId] : undefined;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRemove = useCallback((itemId: string) => {
    setRemovingId(null);
    if (user) removeFromBag(user.uid, itemId).catch(() => {});
  }, [user]);

  const handleQuantity = useCallback((item: BagItem, delta: number) => {
    if (!user) return;
    const product = productMap[item.productId];
    const avail = stockMap[item.id];
    const max = avail !== undefined ? avail : (product ? effectiveStock(product) : 1);
    const next = Math.max(1, Math.min(max, item.quantity + delta));
    if (next !== item.quantity) updateBagItemQuantity(user.uid, item.id, next).catch(() => {});
  }, [user, productMap, stockMap]);

  // "Same dates for everything" on: one item's new dates go to every item (conflicts
  // then show on the items that aren't free — the usual availability check).
  const handleDateConfirm = useCallback((pickup: Date, ret: Date) => {
    if (!user || !datePickerItemId) return;
    const itemId = datePickerItemId;
    setDatePickerItemId(null);
    const write = sameDates
      ? updateAllBagItemDates(user.uid, items.map(i => i.id), pickup, ret)
      : updateBagItemDates(user.uid, itemId, pickup, ret);
    write.catch(() => {});
  }, [user, datePickerItemId, sameDates, items]);

  // Turning it on copies the first dated item's dates / times to every other item.
  const toggleSameDates = useCallback((on: boolean) => {
    setSameDatesPref(on);
    if (!on || !user) return;
    const src = items.find(i => i.pickupAt && i.returnAt);
    if (!src?.pickupAt || !src.returnAt) return;
    const p = src.pickupAt.toMillis(), r = src.returnAt.toMillis();
    const ids = items.filter(i => ms(i.pickupAt) !== p || ms(i.returnAt) !== r).map(i => i.id);
    updateAllBagItemDates(user.uid, ids, src.pickupAt.toDate(), src.returnAt.toDate()).catch(() => {});
  }, [user, items]);

  const addMore = () => {
    if (sharedWindow) router.push(`/explore?from=${sharedWindow.pickupAt}&to=${sharedWindow.returnAt}`);
    else router.push('/explore');
  };

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <View style={s.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={s.headerTitle}>{b.title}</Text>
      {items.length > 0 && <View style={s.headerChip}><Chip label={b.itemsChip(items.length)} small /></View>}
    </View>
  );

  if (loading || items.length === 0) {
    return (
      <View style={[s.root, screen.root]}>
        <StatusBar style="dark" />
        <View style={{ flexShrink: 0 }}>{header}</View>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={SHADES.amber} /></View>
        ) : (
          <View style={s.center}>
            <View style={s.emptyIcon}><Feather name="shopping-bag" size={30} color={SHADES.carbonMuted} /></View>
            <Text style={s.emptyTitle}>{b.empty.title}</Text>
            <Text style={s.emptySub}>{b.empty.sub}</Text>
            <PressScale style={[UI.btnPrimary, s.emptyBtn]} onPress={() => router.push('/explore')}>
              <Text style={UI.btnPrimaryText}>{b.empty.cta}</Text>
            </PressScale>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: screen.top }]}>
      <StatusBar style="dark" />
      <View style={{ flexShrink: 0 }}>{header}</View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {items.length >= 2 && (
          <View style={[UI.card, s.toggleCard]}>
            <ToggleRow title={b.sameDates} value={sameDates} onValueChange={toggleSameDates} />
          </View>
        )}

        {items.map(item => (
          <Animated.View
            key={item.id}
            exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(ReduceMotion.System)}
            layout={LinearTransition.duration(MOTION.duration.base).reduceMotion(ReduceMotion.System)}
          >
            <ItemCard
              item={item}
              product={productMap[item.productId]}
              avail={stockMap[item.id]}
              conflict={conflictOf(item)}
              rental={rentalOf(item)}
              userTier={profile?.loyaltyTier ?? null}
              removing={removingId === item.id}
              onOpen={() => router.push(`/product/${item.productId}`)}
              onEditDates={() => setDatePickerItemId(item.id)}
              onAskRemove={() => setRemovingId(item.id)}
              onCancelRemove={() => setRemovingId(null)}
              onRemove={() => handleRemove(item.id)}
              onQuantity={d => handleQuantity(item, d)}
            />
          </Animated.View>
        ))}

        <TouchableOpacity style={s.addMore} onPress={addMore} hitSlop={8} activeOpacity={0.7}>
          <Feather name="plus" size={16} color={SHADES.amberText} />
          <Text style={UI.link}>{b.addMore}</Text>
        </TouchableOpacity>

        {readyItems.length > 0 && (
          <>
            <SectionTitle>{b.total}</SectionTitle>
            <View style={[UI.card, s.total]}>
              <View style={s.line}>
                <Text style={s.lineLabel}>{b.rental(readyItems.length)}</Text>
                <Text style={s.lineValue}>{`${n(totalRental)} LAK`}</Text>
              </View>
              <View style={s.sep} />
              <View style={s.line}>
                <Text style={s.toPayLabel}>{b.toPay}</Text>
                <Text style={s.toPayValue}>{`${n(totalRental)} LAK`}</Text>
              </View>
              <View style={s.line}>
                <Text style={s.lineLabel}>{b.deposit}</Text>
                <Text style={s.depositValue}>{exchangeRate != null ? `${n(totalDeposit)} LAK` : '—'}</Text>
              </View>
              <Text style={s.note}>{b.note}</Text>
            </View>
          </>
        )}
        {itemsNeedingDates > 0 && <Text style={[UI.small, s.needDates]}>{b.needDates(itemsNeedingDates)}</Text>}
        {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginTop: 16 }} />}
      </ScrollView>

      <BookingBottomBar
        total={readyItems.length > 0 ? totalRental : null}
        sub={b.barSub(readyItems.length)}
        label={readyItems.length > 0 ? b.continue : b.setDatesToContinue}
        disabled={readyItems.length === 0 || !!bookingHold}
        busy={false}
        onPress={() => router.push('/bag/checkout')}
        bottom={Math.max(screen.bottom, 12)}
      />

      {/* Date picker — existing rules (availability, shop slots, lead time). */}
      <DateRangePicker
        visible={datePickerItemId !== null}
        productId={activeBagItem?.productId ?? ''}
        totalStock={activeProduct ? effectiveStock(activeProduct) : 1}
        initialPickupAt={activeBagItem?.pickupAt?.toDate() ?? null}
        initialReturnAt={activeBagItem?.returnAt?.toDate() ?? null}
        onClose={() => setDatePickerItemId(null)}
        onConfirm={handleDateConfirm}
      />
    </View>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────

function ItemCard({
  item, product, avail, conflict, rental, userTier, removing,
  onOpen, onEditDates, onAskRemove, onCancelRemove, onRemove, onQuantity,
}: {
  item: BagItem;
  product: Product | null | undefined;
  avail: number | undefined;
  conflict: boolean;
  rental: number | null;
  userTier: UserProfile['loyaltyTier'] | null;
  removing: boolean;
  onOpen: () => void;
  onEditDates: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
  onQuantity: (delta: number) => void;
}) {
  const b = BAG_COPY;
  const hasDates = !!(item.pickupAt && item.returnAt);
  const max = avail !== undefined ? avail : (product ? effectiveStock(product) : 1);
  const canDec = item.quantity > 1;
  const canInc = item.quantity < max;
  const access = product ? getProductAccessState(product, userTier ?? null) : null;
  const cat = product ? categoryStyle(product.category) : null;

  // ONE honest line, most important first.
  let signal: React.ReactNode = null;
  if (access?.locked) signal = access.message;
  else if (conflict) signal = <>{b.signal.conflict}<Text style={s.signalLink} onPress={onEditDates}>{b.signal.conflictLink}</Text></>;
  else if (hasDates && product && rental == null) signal = b.signal.unpriced;
  else if (hasDates && avail === 1) signal = b.signal.lastOne;

  return (
    <View style={[UI.card, s.card]}>
      <View style={s.top}>
        <PressScale onPress={onOpen} style={s.thumb} accessibilityLabel={item.productName}>
          {item.productImage
            ? <Image source={{ uri: item.productImage }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            : <MaterialCommunityIcons name={cat?.icon ?? 'package-variant-closed'} size={26} color={SHADES.carbonMuted} />}
        </PressScale>
        <View style={{ flex: 1 }}>
          <Text style={UI.title} numberOfLines={1}>{item.productName}</Text>
          {hasDates ? (
            <>
              <Text style={s.date}>{fmtWhen(item.pickupAt!.toDate())}</Text>
              <Text style={s.date}>
                {`${b.returnPrefix}${fmtWhen(item.returnAt!.toDate())}  `}
                <Text style={s.edit} onPress={onEditDates}>{b.edit}</Text>
              </Text>
            </>
          ) : (
            <Text style={[s.edit, { marginTop: 4 }]} onPress={onEditDates}>{b.setDates}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onAskRemove} hitSlop={10} accessibilityLabel={b.remove.confirm} style={s.remove}>
          <Feather name="x" size={18} color={SHADES.carbonMuted} />
        </TouchableOpacity>
      </View>

      {removing && (
        <View style={{ marginTop: 12 }}>
          <ConfirmBox
            text={b.remove.ask(item.productName)}
            confirmLabel={b.remove.confirm}
            cancelLabel={b.remove.keep}
            onCancel={onCancelRemove}
            onConfirm={onRemove}
            destructive
          />
        </View>
      )}

      <View style={s.divider} />
      <View style={s.qtyRow}>
        <PressScale style={[s.qtyBtn, !canDec && s.qtyBtnOff]} onPress={() => onQuantity(-1)} disabled={!canDec} accessibilityLabel="Fewer" hitSlop={6}>
          <Feather name="minus" size={14} color={canDec ? SHADES.carbon : SHADES.carbonFaint} />
        </PressScale>
        <Text style={s.qtyNum}>{item.quantity}</Text>
        <PressScale style={[s.qtyBtn, !canInc && s.qtyBtnOff]} onPress={() => onQuantity(1)} disabled={!canInc} accessibilityLabel="More" hitSlop={6}>
          <Feather name="plus" size={14} color={canInc ? SHADES.carbon : SHADES.carbonFaint} />
        </PressScale>
        {rental != null && !conflict && <Text style={s.amount}>{`${n(rental)} LAK`}</Text>}
      </View>
      {signal != null && <Text style={s.signal}>{signal}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  headerChip: { marginLeft: 'auto' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },

  toggleCard: { overflow: 'hidden' },

  card: { padding: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  thumb: {
    width: 56, height: 56, borderRadius: 14, overflow: 'hidden',
    backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center',
  },
  date: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  edit: { fontSize: 13, fontWeight: '600', color: SHADES.amberText },
  remove: { paddingLeft: 4 },
  divider: { height: 0.5, backgroundColor: SHADES.border, marginVertical: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: SHADES.carbon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SHADES.white,
  },
  qtyBtnOff: { borderColor: SHADES.border },
  qtyNum: { fontSize: 15, fontWeight: '600', color: SHADES.carbon, minWidth: 30, textAlign: 'center' },
  amount: { marginLeft: 'auto', fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  signal: { fontSize: 13.5, fontWeight: '500', color: SHADES.amberDeep, marginTop: 10 },
  signalLink: { fontWeight: '700', textDecorationLine: 'underline' },

  addMore: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },

  total: { padding: 16, gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineLabel: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted },
  lineValue: { fontSize: 14.5, fontWeight: '600', color: SHADES.carbon },
  sep: { height: 0.5, backgroundColor: SHADES.border },
  toPayLabel: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  toPayValue: { fontSize: 19, fontWeight: '800', color: SHADES.carbon },
  depositValue: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted },
  note: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted },
  needDates: { textAlign: 'center' },

  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: SHADES.carbonLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon },
  emptySub: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 4, marginBottom: 22 },
  emptyBtn: { paddingHorizontal: 32 },
});
