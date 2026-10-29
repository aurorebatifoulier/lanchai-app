import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { BOOKING_COPY } from '@/constants/bookingCopy';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import PressScale from '@/components/PressScale';
import { UI, useScreenInsets } from '@/components/account/ui';
import { IdRequirementStep } from '@/components/IdRequirementStep';
import {
  BookingProductCard, WhenCard, QuantityRow, TotalCard, DepositExplainer, CancellationLine, NoteField,
  TermsCheck, BusinessDocCard, BookingBottomBar, bookingBarSpace, type CouponOption,
} from '@/components/booking/BookingBlocks';
import { DatesSheet, SlotSheet } from '@/components/booking/BookingSheets';
import { useBookingHold } from '@/lib/bookingHold';
import { useMyIdentity } from '@/lib/identity';
import { auth } from '@/lib/auth';
import { sendNotif } from '@/lib/notifications';
import {
  getRenterProduct, getUserProfile, createBooking, BookingError, type LoyaltyCoupon, type LoyaltyTier, type UserProfile,
} from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { useLoyaltyConfig, depositPercentFor, isLoyaltyExcluded, TIER_LABELS } from '@/lib/loyalty';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { useLinkedReturnTime } from '@/hooks/useLinkedReturnTime';
import { getAvailableStock, effectiveStock } from '@/utils/availability';
import { getEffectiveRate, getMinPrice } from '@/utils/pricing';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { toLak, splitHtVat } from '@/utils/currency';
import { getProductAccessState } from '@/utils/productAccess';
import { needsBtobDocument } from '@/utils/btob';
import { couponPercentFor, orderDiscount, depositForLine } from '@/functions/src/shared/pricing';

// "Your booking" (validated mockup) — ONE screen: dates & times, quantity, total (coupon,
// VAT only when on, to pay at pick-up, the renter's real deposit, points), deposit
// explainer, cancellation, note, terms, Confirm. Confirm runs, in order: business document
// → ID step → phone → createBooking (the server re-checks everything). booking/summary
// now redirects here. Copy in constants/bookingCopy.ts.

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
const atTime = (date: Date, hhmm: string) => {
  const d = new Date(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};
const pad = (n: number) => String(n).padStart(2, '0');
const hhmmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function BookingNewScreen() {
  // pickupAt / returnAt (ms, optional): pre-filled dates (Home "Free this weekend").
  const { productId, pickupAt: prefillPickup, returnAt: prefillReturn } =
    useLocalSearchParams<{ productId: string; pickupAt?: string; returnAt?: string }>();
  const router = useRouter();
  const screen = useScreenInsets();
  const shop = useShopInfo();
  const timeSlots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const loyaltyConfig = useLoyaltyConfig();
  const bookingHold = useBookingHold();
  const { identity } = useMyIdentity();
  // The live users doc (useMyLoyalty) — customer type, tier, coupons, BtoB fields.
  const loyalty = useMyLoyalty();
  const profile = loyalty.profile as (Partial<UserProfile> & { loyaltyTier?: LoyaltyTier; coupons?: LoyaltyCoupon[] }) | null;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const { pickupTime, returnTime, selectPickupTime, selectReturnTime, resetTimes } = useLinkedReturnTime();
  const [quantity, setQuantity] = useState(1);
  const [barH, setBarH] = useState(0); // fixed bottom bar height → scroll padding
  const [availableStock, setAvailableStock] = useState(1);
  const [notes, setNotes] = useState('');
  const [couponId, setCouponId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sheet, setSheet] = useState<'dates' | 'pickup' | 'return' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docRequired, setDocRequired] = useState(false);
  const [idStepOpen, setIdStepOpen] = useState(false);

  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    getRenterProduct(productId)
      .then(p => { setProduct(p); if (p) setAvailableStock(effectiveStock(p)); })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  // Pre-fill once from the params when still valid; otherwise the normal flow applies.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !prefillPickup || !prefillReturn) return;
    prefilled.current = true;
    const p = new Date(Number(prefillPickup));
    const r = new Date(Number(prefillReturn));
    if (!Number.isFinite(p.getTime()) || !Number.isFinite(r.getTime()) || r <= p) return;
    const pDay = new Date(p.getFullYear(), p.getMonth(), p.getDate());
    const rDay = new Date(r.getFullYear(), r.getMonth(), r.getDate());
    if (!getAvailableTimeSlots(pDay, timeSlots).includes(hhmmOf(p)) || !timeSlots.includes(hhmmOf(r))) return;
    setStartDate(pDay);
    setEndDate(rDay);
    resetTimes(hhmmOf(p), hhmmOf(r));
  }, [prefillPickup, prefillReturn, timeSlots, resetTimes]);

  // Units free on the chosen dates (same check as before; the server re-checks).
  useEffect(() => {
    if (!product || !startDate || !endDate) return;
    getAvailableStock(product.id, startDate, endDate, effectiveStock(product)).then(n => {
      setAvailableStock(n);
      setQuantity(q => Math.max(1, Math.min(q, n)));
    }).catch(() => {});
  }, [product, startDate, endDate]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pickupAt = startDate && pickupTime ? atTime(startDate, pickupTime) : null;
  const returnAt = endDate && returnTime ? atTime(endDate, returnTime) : null;
  const returnValid = !!pickupAt && !!returnAt && returnAt > pickupAt;
  const days = pickupAt && returnAt && returnValid ? Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / 86_400_000)) : 0;
  const rateUsd = product && days > 0 ? getEffectiveRate(product, days) : null;
  const rateLak = rateUsd != null && exchangeRate != null ? toLak(rateUsd, exchangeRate) : null;
  const subtotal = rateLak != null ? rateLak * days * quantity : 0;

  // "Keep it {n} days and save {x}% per day." — next cheaper tier within 2 extra days.
  const tierHint = useMemo(() => {
    if (!product || days <= 0 || rateUsd == null) return null;
    for (let extra = 1; extra <= 2; extra++) {
      const next = getEffectiveRate(product, days + extra);
      if (next != null && next < rateUsd) return BOOKING_COPY.tierHint(days + extra, Math.round((1 - next / rateUsd) * 100));
    }
    return null;
  }, [product, days, rateUsd]);

  const excluded = isLoyaltyExcluded(profile ?? {});
  const couponPct = (c: LoyaltyCoupon) => couponPercentFor(c.tier, loyaltyConfig);
  const coupons = excluded ? [] : (profile?.coupons ?? []).filter(c => !c.used && couponPct(c) > 0);
  const selected = coupons.find(c => c.id === couponId) ?? null;
  const discount = selected ? orderDiscount([subtotal], couponPct(selected)).total : 0;
  const toPay = subtotal - discount;
  const vat = vatPercent != null ? (() => { const v = splitHtVat(toPay, vatPercent); return { ht: v.ht, amount: v.vat, pct: vatPercent }; })() : null;
  const couponOptions: CouponOption[] = coupons.map(c => ({
    id: c.id,
    label: BOOKING_COPY.coupon(TIER_LABELS[c.tier], couponPct(c)),
    savings: orderDiscount([subtotal], couponPct(c)).total,
  }));
  const depositPct = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
  // Per unit × quantity — the server's formula (shared depositForLine).
  const depositLine = product && exchangeRate != null ? depositForLine(product.deposit, exchangeRate, depositPct, quantity) : null;
  const depositLak = depositLine?.deposit ?? 0;

  const c = BOOKING_COPY;
  const ctaLabel = !startDate || !endDate ? c.cta.selectDates
    : !pickupTime ? c.cta.selectPickup
    : !returnTime ? c.cta.selectReturn
    : !agreed ? c.cta.acceptTerms
    : c.cta.confirm;
  const ready = returnValid && rateLak != null && availableStock > 0 && quantity >= 1 && agreed && !bookingHold;

  // ── Confirm: business document → ID step → phone → createBooking ─────────────
  const confirm = async (opts: { idCheckAtCounter?: boolean; idJustAdded?: boolean } = {}) => {
    if (!product || !pickupAt || !returnAt || !ready || confirming) return;
    const currentUser = auth.currentUser;
    if (!currentUser) { setError(c.signIn); return; }
    if (needsBtobDocument(profile as UserProfile | null)) { setDocRequired(true); return; }
    if (identity?.status !== 'on_file' && !opts.idJustAdded && !opts.idCheckAtCounter) { setIdStepOpen(true); return; }
    setConfirming(true);
    setError(null);
    try {
      const fresh = await getUserProfile(currentUser.uid);
      if (!fresh?.phoneNumber && !fresh?.phone) { setError(c.phoneRequired); setConfirming(false); return; }
      const { orderId, reservationIds } = await createBooking({
        items: [{ productId: product.id, pickupAt, returnAt, quantity }],
        couponId: selected?.id ?? null,
        idCheckAtCounter: opts.idCheckAtCounter === true && !opts.idJustAdded,
        notes,
      });
      sendNotif(currentUser.uid, {
        type: 'rental', icon: 'clock', iconColor: '#F4B400',
        title: c.notifTitle, body: c.notifBody(product.name), deepLink: `/rentals/${reservationIds[0]}`,
      });
      router.replace({ pathname: '/booking/confirmation', params: { orderId } });
    } catch (err) {
      setError(err instanceof BookingError ? err.message : c.genericError);
      setConfirming(false);
    }
  };

  // ── States ──────────────────────────────────────────────────────────────────
  const header = (
    <View style={s.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={s.headerTitle}>{c.title}</Text>
    </View>
  );
  if (loading) {
    return <View style={[s.root, screen.root]}>{header}<ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /></View>;
  }
  if (!product) {
    return (
      <View style={[s.root, screen.root]}>
        {header}
        <View style={s.center}>
          <Text style={UI.title}>{c.notFound}</Text>
          <PressScale style={[UI.btnPrimary, { marginTop: 18, paddingHorizontal: 24 }]} onPress={() => router.replace('/(tabs)/explore')}>
            <Text style={UI.btnPrimaryText}>{c.backToExplore}</Text>
          </PressScale>
        </View>
      </View>
    );
  }
  const access = getProductAccessState(product, profile?.loyaltyTier ?? null);
  if (access.locked) {
    return (
      <View style={[s.root, screen.root]}>
        {header}
        <View style={s.center}>
          <Feather name="lock" size={30} color={SHADES.carbonMuted} />
          <Text style={[UI.title, { marginTop: 10 }]}>Booking restricted</Text>
          <Text style={[UI.body, { textAlign: 'center', marginTop: 4 }]}>{access.message}</Text>
        </View>
      </View>
    );
  }

  const minUsd = getMinPrice(product);
  const fromLabel = minUsd != null && exchangeRate != null ? c.fromPerDay(toLak(minUsd, exchangeRate).toLocaleString('en-US')) : undefined;
  const datesLabel = startDate && endDate ? `${fmtDay(startDate)} → ${fmtDay(endDate)}` : startDate ? `${fmtDay(startDate)} → ${c.selectReturn}` : null;
  const whenError = pickupAt && returnAt && !returnValid ? c.returnAfterPickup : returnValid && rateLak == null ? c.unpriced : null;

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: screen.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <IdRequirementStep
        visible={idStepOpen}
        rejected={identity?.status === 'rejected'}
        onClose={() => setIdStepOpen(false)}
        onUploaded={() => { setIdStepOpen(false); confirm({ idJustAdded: true }); }}
        onAtCounter={() => { setIdStepOpen(false); confirm({ idCheckAtCounter: true }); }}
      />
      {header}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: bookingBarSpace(barH, Math.max(screen.bottom, 12)) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BookingProductCard name={product.name} image={product.images?.[0]} sub={fromLabel} />
        {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginTop: 16 }} />}

        <WhenCard
          datesLabel={datesLabel}
          pickup={pickupTime}
          ret={returnTime}
          onDates={() => setSheet('dates')}
          onPickup={() => setSheet('pickup')}
          onReturn={() => setSheet('return')}
          hint={tierHint}
          error={whenError}
        />

        <QuantityRow quantity={quantity} available={availableStock} onChange={q => setQuantity(Math.max(1, Math.min(q, availableStock)))} />

        {days > 0 && rateLak != null && (
          <TotalCard
            lines={[{ label: c.dayLine(days, rateLak.toLocaleString('en-US'), quantity), value: subtotal }]}
            coupons={couponOptions}
            selectedCouponId={couponId}
            onToggleCoupon={id => setCouponId(cur => (cur === id ? null : id))}
            discount={discount}
            vat={vat}
            toPay={toPay}
            deposit={depositLak}
            depositDetail={depositLine && quantity > 1 ? c.depositPerUnit(quantity, depositLine.depositPerUnit.toLocaleString('en-US')) : undefined}
            pointsSubtotals={[subtotal]}
          />
        )}
        <DepositExplainer />
        <CancellationLine />
        <NoteField value={notes} onChange={setNotes} />
        {docRequired && <BusinessDocCard onGo={() => { setDocRequired(false); router.push('/profile/business-document'); }} />}
        <TermsCheck agreed={agreed} onToggle={() => setAgreed(a => !a)} />
        {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
      </ScrollView>

      <BookingBottomBar
        total={days > 0 ? toPay : null}
        sub={c.barSub(days)}
        label={ctaLabel}
        disabled={!ready}
        busy={confirming}
        onPress={() => confirm()}
        bottom={Math.max(screen.bottom, 12)}
        onHeight={setBarH}
      />

      <DatesSheet
        visible={sheet === 'dates'}
        onClose={() => setSheet(null)}
        productId={product.id}
        totalStock={effectiveStock(product)}
        startDate={startDate}
        endDate={endDate}
        onChangeRange={(st, en) => { setStartDate(st); setEndDate(en); if (st && en) setSheet(null); }}
        timeSlots={timeSlots}
      />
      <SlotSheet
        visible={sheet === 'pickup'}
        title={c.pickup}
        sub={`${shop.name} · ${shop.hours}`}
        slots={getAvailableTimeSlots(startDate, timeSlots)}
        selected={pickupTime}
        onSelect={selectPickupTime}
        onClose={() => setSheet(null)}
      />
      <SlotSheet
        visible={sheet === 'return'}
        title={c.return}
        sub={shop.hours}
        slots={getAvailableTimeSlots(endDate, timeSlots)}
        selected={returnTime}
        onSelect={selectReturnTime}
        onClose={() => setSheet(null)}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
