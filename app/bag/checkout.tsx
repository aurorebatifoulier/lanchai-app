import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { BOOKING_COPY } from '@/constants/bookingCopy';
import { UI } from '@/components/account/ui';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import {
  BookingProductCard, TotalCard, DepositExplainer, CancellationLine, NoteField, TermsCheck, BusinessDocCard,
  BookingBottomBar, type CouponOption,
} from '@/components/booking/BookingBlocks';
import { useBookingHold } from '@/lib/bookingHold';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import {
  createBooking,
  BookingError,
  getRenterProduct,
  getUserProfile,
  type UserProfile,
  type LoyaltyCoupon,
} from '@/lib/firestore';
import { couponPercentFor, orderDiscount, depositForLine } from '@/functions/src/shared/pricing';
import { clearBag, listenBagItems, BagItem } from '@/lib/bag';
import { sendNotif } from '@/lib/notifications';
import { Product } from '@/lib/mockData';
import { getEffectiveRate, billableDaysFromDates, fmtReservationLabel } from '@/utils/pricing';
import { useExchangeRate, useVatPercent, DEFAULT_VAT_PERCENT } from '@/lib/exchangeRate';
import { toLak, splitHtVat } from '@/utils/currency';
import { useLoyaltyConfig, depositPercentFor, isLoyaltyExcluded, TIER_LABELS } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import { needsBtobDocument } from '@/utils/btob';
import { useMyIdentity } from '@/lib/identity';
import { IdRequirementStep } from '@/components/IdRequirementStep';

// ── CheckoutItem ──────────────────────────────────────────────────────────────
// Derived locally from Firestore bag items + product data.
// Image URLs come directly from Firestore, bypassing expo-router param encoding.

interface CheckoutItem {
  bagItemId:    string;
  productId:    string;
  productName:  string;
  productImage: string | null;
  pickupAt:     number; // ms timestamp
  returnAt:     number; // ms timestamp
  durationDays: number;
  quantity:     number;
  pricePerDay:  number;
  subtotal:     number;
  deposit:      number;
  pickupLabel:  string;
  returnLabel:  string;
}


// ── Screen ────────────────────────────────────────────────────────────────────

export default function BagSummaryScreen() {
  const insets       = useSafeAreaInsets();
  const router       = useRouter();
  const { user }     = useAuth();
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const loyaltyConfig = useLoyaltyConfig();

  const [notes, setNotes] = useState('');
  const [agreed,      setAgreed]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const bookingHold = useBookingHold();
  const [error,       setError]       = useState<string | null>(null);
  const [docRequired, setDocRequired] = useState(false);

  // ── Loyalty ──────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  // Excluded accounts (business/BtoB) never see or apply coupons. The % shown is the
  // CONFIG % for the coupon's tier — exactly what createReservations applies server-side.
  const couponPct = (c: LoyaltyCoupon) => couponPercentFor(c.tier, loyaltyConfig);
  const unusedCoupons: LoyaltyCoupon[] = isLoyaltyExcluded(profile ?? {})
    ? []
    : (profile?.coupons ?? []).filter(c => !c.used && couponPct(c) > 0);
  const selectedCoupon = unusedCoupons.find(c => c.id === selectedCouponId) ?? null;

  // ── Bag data ────────────────────────────────────────────────────────────────
  const [rawItems,   setRawItems]   = useState<BagItem[]>([]);
  const [productMap, setProductMap] = useState<Record<string, Product | null>>({});
  const [loadingBag, setLoadingBag] = useState(true);
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setLoadingBag(false); return; }
    const unsub = listenBagItems(
      user.uid,
      items => { setRawItems(items); setLoadingBag(false); },
      () => setLoadingBag(false),
    );
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    rawItems.forEach(item => {
      if (fetchedIds.current.has(item.productId)) return;
      fetchedIds.current.add(item.productId);
      getRenterProduct(item.productId)
        .then(p  => setProductMap(prev => ({ ...prev, [item.productId]: p })))
        .catch(() => setProductMap(prev => ({ ...prev, [item.productId]: null })));
    });
  }, [rawItems]);

  // ── Derive checkout items (same logic as bag.tsx handleCheckout) ─────────────
  const items = useMemo<CheckoutItem[]>(() => {
    if (exchangeRate == null) return [];
    return rawItems.flatMap(raw => {
      if (!raw.pickupAt || !raw.returnAt) return [];
      const product = productMap[raw.productId];
      if (!product) return [];
      const pickupDate = raw.pickupAt.toDate();
      const returnDate = raw.returnAt.toDate();
      if (returnDate.getTime() <= pickupDate.getTime()) return [];
      if (getProductAccessState(product, profile?.loyaltyTier ?? null).locked) return []; // now restricted — never create a reservation for this item
      const days = billableDaysFromDates(pickupDate, returnDate);
      const rateUsd = getEffectiveRate(product, days);
      if (rateUsd === null) return []; // unpriced — never create a reservation for this item
      const rateLak = toLak(rateUsd, exchangeRate);
      const depositPercent = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
      // Per unit × quantity — the server's formula (shared depositForLine).
      const depositLak = depositForLine(product.deposit, exchangeRate, depositPercent, raw.quantity).deposit;
      return [{
        bagItemId:    raw.id,
        productId:    raw.productId,
        productName:  raw.productName,
        productImage: raw.productImage, // URL direct from Firestore — no param encoding
        pickupAt:     pickupDate.getTime(),
        returnAt:     returnDate.getTime(),
        durationDays: days,
        quantity:     raw.quantity,
        pricePerDay:  rateLak,
        subtotal:     rateLak * days * raw.quantity,
        deposit:      depositLak,
        pickupLabel:  fmtReservationLabel(pickupDate),
        returnLabel:  fmtReservationLabel(returnDate),
      }];
    });
  }, [rawItems, productMap, exchangeRate, profile, loyaltyConfig]);

  const totalRental  = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalDeposit = items.reduce((sum, i) => sum + i.deposit, 0);
  // Same order-level discount + per-line split as the server (shared orderDiscount).
  const couponSplit = orderDiscount(items.map(i => i.subtotal), selectedCoupon ? couponPct(selectedCoupon) : 0);
  const discountAmount = couponSplit.total;
  const finalTotal = totalRental - discountAmount;
  const vatPct = vatPercent ?? DEFAULT_VAT_PERCENT;
  const { ht: vatHt, vat: vatAmount } = splitHtVat(finalTotal, vatPct);

  // ── Confirm ──────────────────────────────────────────────────────────────────
  // ID document required to rent: without one on file, "Confirm" opens the ID step
  // (add it now, or show it at the shop) and resumes here with the bag kept.
  const { identity } = useMyIdentity();
  const [idStepOpen, setIdStepOpen] = useState(false);

  const handleConfirm = async (opts: { idCheckAtCounter?: boolean; idJustAdded?: boolean } = {}) => {
    if (!agreed || submitting || items.length === 0) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Please sign in to confirm your reservation.');
      return;
    }
    if (needsBtobDocument(profile)) {
      setDocRequired(true);
      return;
    }
    if (identity?.status !== 'on_file' && !opts.idJustAdded && !opts.idCheckAtCounter) {
      setIdStepOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setDocRequired(false);
    try {
      // Phone guard — same as single-item flow. Also doubles as the freshest read of
      // the renter's coupons for the mark-used write below.
      const profileAtSubmit = await getUserProfile(currentUser.uid);
      if (!profileAtSubmit?.phoneNumber && !profileAtSubmit?.phone) {
        setError('A phone number is required to book. Go to Account → Personal info to add one.');
        setSubmitting(false);
        return;
      }

      // Server-side creation: the createReservations callable recomputes every figure,
      // checks stock in a transaction and consumes the coupon (single order, one email).
      const { orderId } = await createBooking({
        items: items.map(item => ({
          productId: item.productId,
          pickupAt:  new Date(item.pickupAt),
          returnAt:  new Date(item.returnAt),
          quantity:  item.quantity,
        })),
        couponId: selectedCoupon?.id ?? null,
        idCheckAtCounter: opts.idCheckAtCounter === true && !opts.idJustAdded,
        notes,
      });

      // Clear the bag — fire and forget
      clearBag(currentUser.uid).catch(() => {});

      // Consolidated notification for the whole order
      sendNotif(currentUser.uid, {
        type:      'rental',
        icon:      'clock',
        iconColor: '#F4B400',
        title:     'Reservation request sent',
        body:      items.length === 1
          ? `Your booking for ${items[0].productName} is pending confirmation.`
          : `${items.length} items reserved. We'll confirm your order shortly.`,
        deepLink: '/(tabs)/reservations',
      });

      router.replace({
        pathname: '/booking/confirmation',
        params: { orderId },
      });
    } catch (err) {
      setError(err instanceof BookingError ? err.message : 'Could not submit your reservation. Please try again.');
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  const loadingProducts = rawItems.some(item => productMap[item.productId] === undefined);
  const isLoading       = loadingBag || loadingProducts;

  const header = (
    <View style={s.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={s.headerTitle}>{BOOKING_COPY.title}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        {header}
        <View style={s.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {header}
        <View style={s.centered}>
          <Text style={s.emptyText}>No items to check out.</Text>
        </View>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  const c = BOOKING_COPY;
  const couponOptions: CouponOption[] = unusedCoupons.map(cp => ({
    id: cp.id,
    label: c.coupon(TIER_LABELS[cp.tier], couponPct(cp)),
    savings: orderDiscount(items.map(i => i.subtotal), couponPct(cp)).total,
  }));
  const vat = vatPercent != null ? { ht: vatHt, amount: vatAmount, pct: vatPct } : null;

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <IdRequirementStep
        visible={idStepOpen}
        rejected={identity?.status === 'rejected'}
        onClose={() => setIdStepOpen(false)}
        onUploaded={() => { setIdStepOpen(false); handleConfirm({ idJustAdded: true }); }}
        onAtCounter={() => { setIdStepOpen(false); handleConfirm({ idCheckAtCounter: true }); }}
      />
      {header}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: 110 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginBottom: 16 }} />}

        {/* One product card per item: dates · times, quantity, line amount */}
        <View style={{ gap: 10 }}>
          {items.map(item => (
            <BookingProductCard
              key={item.bagItemId}
              name={item.productName}
              image={item.productImage}
              lines={[
                `${item.pickupLabel} → ${item.returnLabel}`,
                `${c.dayLine(item.durationDays, item.pricePerDay.toLocaleString('en-US'), item.quantity)}`,
              ]}
              right={`${item.subtotal.toLocaleString('en-US')} LAK`}
            />
          ))}
        </View>

        <TotalCard
          lines={[{ label: c.rentalItems(items.length), value: totalRental }]}
          coupons={couponOptions}
          selectedCouponId={selectedCouponId}
          onToggleCoupon={id => setSelectedCouponId(cur => (cur === id ? null : id))}
          discount={discountAmount}
          vat={vat}
          toPay={finalTotal}
          deposit={totalDeposit}
          pointsSubtotals={items.map(i => i.subtotal)}
        />
        <DepositExplainer />
        <CancellationLine />
        <NoteField value={notes} onChange={setNotes} />
        {docRequired && <BusinessDocCard onGo={() => { setDocRequired(false); router.push('/profile/business-document'); }} />}
        <TermsCheck agreed={agreed} onToggle={() => setAgreed(v => !v)} />
        {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
      </ScrollView>

      <BookingBottomBar
        total={finalTotal}
        sub={c.barSubItems(items.length)}
        label={agreed ? c.cta.confirm : c.cta.acceptTerms}
        disabled={!agreed || !!bookingHold}
        busy={submitting}
        onPress={() => handleConfirm()}
        bottom={Math.max(insets.bottom, 12)}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted },
});
