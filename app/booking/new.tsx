import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import { useBookingHold } from '@/lib/bookingHold';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { getRenterProduct } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { getAvailableStock, effectiveStock } from '@/utils/availability';
import { getEffectiveRate } from '@/utils/pricing';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { useLinkedReturnTime } from '@/hooks/useLinkedReturnTime';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { toLak, formatLak } from '@/utils/currency';
import { PriceLak } from '@/components/PriceLak';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, type UserProfile } from '@/lib/firestore';
import { useLoyaltyConfig, depositPercentFor, useLoyaltyTier } from '@/lib/loyalty';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { getProductAccessState } from '@/utils/productAccess';
import PressScale from '@/components/PressScale';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
function fmtDate(d: Date) {
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${dow[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

function buildDateTime(date: Date, timeStr: string): Date {
  const dt = new Date(date);
  const [h, m] = timeStr.split(':').map(Number);
  dt.setHours(h, m, 0, 0);
  return dt;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function BookingNewScreen() {
  // pickupAt / returnAt (ms, optional): pre-filled dates, e.g. Home "Free this weekend".
  const { productId, pickupAt: prefillPickup, returnAt: prefillReturn } =
    useLocalSearchParams<{ productId: string; pickupAt?: string; returnAt?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const shop = useShopInfo();
  const bookingHold = useBookingHold();
  const timeSlots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const { user } = useAuth();
  const userTier = useLoyaltyTier();
  const loyaltyConfig = useLoyaltyConfig();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  const [product, setProduct]               = useState<Product | null>(null);
  const [loading, setLoading]               = useState(true);
  const [startDate, setStartDate]           = useState<Date | null>(null);
  const [endDate, setEndDate]               = useState<Date | null>(null);
  const { pickupTime, returnTime, selectPickupTime, selectReturnTime, resetTimes } = useLinkedReturnTime();
  const [quantity, setQuantity]             = useState(1);
  const [notes, setNotes]                   = useState('');
  const [availableStock, setAvailableStock] = useState(1);

  const [showDateModal,        setShowDateModal]        = useState(false);
  const [showPickupTimeModal,  setShowPickupTimeModal]  = useState(false);
  const [showReturnTimeModal,  setShowReturnTimeModal]  = useState(false);

  // Pre-fill once from the params when still valid (slot open, return after pick-up);
  // otherwise ignored and the normal flow applies. The renter can change everything.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !prefillPickup || !prefillReturn) return;
    prefilled.current = true;
    const p = new Date(Number(prefillPickup));
    const r = new Date(Number(prefillReturn));
    if (!Number.isFinite(p.getTime()) || !Number.isFinite(r.getTime()) || r <= p) return;
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const pDay = new Date(p.getFullYear(), p.getMonth(), p.getDate());
    const rDay = new Date(r.getFullYear(), r.getMonth(), r.getDate());
    if (!getAvailableTimeSlots(pDay, timeSlots).includes(hhmm(p)) || !timeSlots.includes(hhmm(r))) return;
    setStartDate(pDay);
    setEndDate(rDay);
    resetTimes(hhmm(p), hhmm(r));
  }, [prefillPickup, prefillReturn, timeSlots, resetTimes]);

  useEffect(() => {
    if (!productId) return;
    getRenterProduct(productId).then(p => {
      setProduct(p);
      if (p) setAvailableStock(effectiveStock(p));
      setLoading(false);
    });
  }, [productId]);

  useEffect(() => {
    if (!product || !startDate || !endDate) return;
    getAvailableStock(product.id, startDate, endDate, effectiveStock(product)).then(s => {
      setAvailableStock(s);
      if (quantity > s) setQuantity(Math.max(1, s));
    });
  }, [startDate, endDate]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pickupDateTime = startDate && pickupTime ? buildDateTime(startDate, pickupTime) : null;
  const returnDateTime = endDate && returnTime ? buildDateTime(endDate, returnTime) : null;

  const isReturnValid = !!(
    pickupDateTime && returnDateTime &&
    returnDateTime.getTime() > pickupDateTime.getTime()
  );

  // 24h-block billing: Fri 10:00 → Sat 10:00 = exactly 24h = 1 day
  const billableDays =
    pickupDateTime && returnDateTime && isReturnValid
      ? Math.max(1, Math.ceil((returnDateTime.getTime() - pickupDateTime.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  const dayRateUsd = product && billableDays > 0 ? getEffectiveRate(product, billableDays) : null;
  const dayRateLak = dayRateUsd != null && exchangeRate != null ? toLak(dayRateUsd, exchangeRate) : null;
  const subtotal   = dayRateLak != null && billableDays > 0 ? dayRateLak * billableDays * quantity : 0;
  const discPct  =
    dayRateUsd != null && product && product.pricePerDay > 0 && dayRateUsd < product.pricePerDay
      ? Math.round((1 - dayRateUsd / product.pricePerDay) * 100)
      : 0;

  const ready =
    !!startDate && !!endDate && !!pickupTime && !!returnTime &&
    isReturnValid && quantity >= 1 && availableStock > 0 && dayRateLak !== null &&
    !bookingHold;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openDateModal = () => setShowDateModal(true);

  const handleChangeRange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Selecting pick-up time defaults the return time to the same slot
  const handlePickupTimeSelect = selectPickupTime;

  const handleSubmit = () => {
    if (!product || !ready || dayRateLak === null || exchangeRate == null || !startDate || !endDate || !pickupTime || !returnTime || !pickupDateTime || !returnDateTime) return;
    const depositPercent = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
    const depositLak = Math.round(toLak(product.deposit, exchangeRate) * depositPercent / 100);
    router.push({
      pathname: '/booking/summary',
      params: {
        productId: product.id,
        productName: product.name,
        productImage: product.images?.[0] ?? '',
        pickupDateISO: pickupDateTime.toISOString(),
        returnDateISO: returnDateTime.toISOString(),
        pickupDateLabel: fmtDate(startDate),
        pickupTimeLabel: pickupTime,
        returnDateLabel: fmtDate(endDate),
        returnTimeLabel: returnTime,
        billableDays: String(billableDays),
        quantity: String(quantity),
        pricePerDay: String(dayRateLak),
        subtotal: String(subtotal),
        deposit: String(depositLak),
        notes,
      },
    });
  };

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={COLORS.amber} style={{ flex: 1 }} />
      </View>
    );
  }
  if (!product) return null;

  // Defense in depth — the product detail screen already disables the CTA for a
  // tier-locked product, but this covers a direct/deep-linked entry to this screen.
  const accessState = getProductAccessState(product, userTier ?? null);
  if (accessState.locked) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <BackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Your booking</Text>
            <Text style={s.headerSub} numberOfLines={1}>{product.name}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Feather name="lock" size={32} color={SHADES.carbonMuted} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.carbon, textAlign: 'center' }}>
            Booking restricted
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center' }}>
            {accessState.message}
          </Text>
        </View>
      </View>
    );
  }

  const ctaLabel = ready
    ? 'Confirm booking'
    : !startDate || !endDate
    ? 'Select dates'
    : !pickupTime
    ? 'Select pick-up time'
    : !returnTime
    ? 'Select return time'
    : 'Confirm booking';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Your booking</Text>
          <Text style={s.headerSub} numberOfLines={1}>{product.name}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginBottom: 16 }} />}

        {/* ══ DATES & TIMES ═══════════════════════════════════════════════════ */}
        <Text style={s.sectionLabel}>Dates & times</Text>

        <View style={s.fieldGrid}>
          {/* Single unified field — opens the range calendar for both pick-up & return */}
          <TouchableOpacity
            style={[s.fieldBtn, s.fieldBtnFull, (startDate || endDate) && s.fieldBtnFilled]}
            onPress={openDateModal}
            activeOpacity={0.75}
          >
            <Text style={[s.fieldBtnEye, (startDate || endDate) && s.fieldBtnEyeFilled]}>Dates</Text>
            <Text style={[s.fieldBtnVal, (startDate || endDate) && s.fieldBtnValFilled]}>
              {startDate && endDate
                ? `${fmtDate(startDate)} → ${fmtDate(endDate)}`
                : startDate
                ? `${fmtDate(startDate)} → Select return`
                : 'Select dates'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.fieldBtn, pickupTime && s.fieldBtnFilled]}
            onPress={() => setShowPickupTimeModal(true)}
            activeOpacity={0.75}
          >
            <Text style={[s.fieldBtnEye, pickupTime && s.fieldBtnEyeFilled]}>Pick-up time</Text>
            <Text style={[s.fieldBtnVal, pickupTime && s.fieldBtnValFilled]}>
              {pickupTime ?? 'Select'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.fieldBtn, returnTime && s.fieldBtnFilled]}
            onPress={() => setShowReturnTimeModal(true)}
            activeOpacity={0.75}
          >
            <Text style={[s.fieldBtnEye, returnTime && s.fieldBtnEyeFilled]}>Return time</Text>
            <Text style={[s.fieldBtnVal, returnTime && s.fieldBtnValFilled]}>
              {returnTime ?? 'Select'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Duration chip — live, shown when both datetimes are available */}
        {pickupDateTime && returnDateTime && (
          !isReturnValid ? (
            <View style={s.returnError}>
              <Feather name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={s.returnErrorText}>Return must be after pick-up</Text>
            </View>
          ) : dayRateLak === null ? (
            <View style={s.returnError}>
              <Feather name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={s.returnErrorText}>Pricing for this item hasn&apos;t been set yet. Booking unavailable.</Text>
            </View>
          ) : (
            <View style={s.durationChip}>
              <View style={s.durationChipRow}>
                <Feather name="clock" size={13} color={SHADES.carbon} />
                <Text style={s.durationChipMain}>
                  {billableDays} day{billableDays !== 1 ? 's' : ''} · 24h
                </Text>
                {discPct > 0 && (
                  <View style={s.discountPill}>
                    <Text style={s.discountPillText}>−{discPct}%</Text>
                  </View>
                )}
              </View>
              <Text style={s.durationChipSub}>Rate applied: {formatLak(dayRateUsd!, exchangeRate)} / day</Text>
            </View>
          )
        )}

        {/* ══ QUANTITY ═══════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>Quantity</Text>

        <View style={s.stockBadge}>
          <View style={[s.stockDot, { backgroundColor: availableStock > 0 ? COLORS.success : COLORS.danger }]} />
          <Text style={[s.stockText, { color: availableStock > 0 ? COLORS.success : COLORS.danger }]}>
            {availableStock === 0
              ? 'Out of stock'
              : effectiveStock(product) > 1
              ? `${availableStock} of ${effectiveStock(product)} available`
              : 'In stock'}
          </Text>
        </View>

        <View style={s.qtyControl}>
          <TouchableOpacity
            style={[s.qtyBtn, quantity <= 1 && s.qtyBtnOff]}
            onPress={() => quantity > 1 && setQuantity(q => q - 1)}
          >
            <Feather name="minus" size={20} color={quantity <= 1 ? COLORS.softGray : COLORS.carbon} />
          </TouchableOpacity>
          <View style={s.qtyDisplay}>
            <Text style={s.qtyNum}>{quantity}</Text>
            <Text style={s.qtyUnit}>unit{quantity !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity
            style={[s.qtyBtn, quantity >= availableStock && s.qtyBtnOff]}
            onPress={() => quantity < availableStock && setQuantity(q => q + 1)}
          >
            <Feather name="plus" size={20} color={quantity >= availableStock ? COLORS.softGray : COLORS.carbon} />
          </TouchableOpacity>
        </View>

        {/* ══ NOTES ══════════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>
          Notes <Text style={s.sectionOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={s.notesInput}
          placeholder="Special instructions or questions…"
          placeholderTextColor={SHADES.carbonMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        {/* Trust */}
        <View style={s.trust}>
          <Feather name="check-circle" size={13} color={SHADES.amber} />
          <Text style={s.trustText}>Free cancellation up to 48h before pick-up.</Text>
        </View>

        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* ── Dates modal (unified range calendar) ── */}
      <Modal
        visible={showDateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDateModal(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDateModal(false)}
        >
          <TouchableOpacity style={s.modalCard} activeOpacity={1} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select dates</Text>
              <TouchableOpacity style={s.modalDoneBtn} onPress={() => setShowDateModal(false)}>
                <Text style={s.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateRangeCalendar
              productId={product.id}
              totalStock={effectiveStock(product)}
              startDate={startDate}
              endDate={endDate}
              onChangeRange={handleChangeRange}
              timeSlots={timeSlots}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Pick-up time modal ── */}
      <Modal
        visible={showPickupTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPickupTimeModal(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPickupTimeModal(false)}
        >
          <TouchableOpacity style={s.modalCard} activeOpacity={1} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Pick-up time</Text>
              <TouchableOpacity style={s.modalDoneBtn} onPress={() => setShowPickupTimeModal(false)}>
                <Text style={s.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>{shop.name} · {shop.hours}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={s.timeModalScroll} contentContainerStyle={s.timeModalList}>
              {getAvailableTimeSlots(startDate, timeSlots).map(slot => {
                const active = pickupTime === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[s.timeModalRow, active && s.timeModalRowActive]}
                    onPress={() => { handlePickupTimeSelect(slot); setShowPickupTimeModal(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.timeModalRowText, active && s.timeModalRowTextActive]}>{slot}</Text>
                    {active && <Feather name="check" size={16} color={COLORS.carbon} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Return time modal ── */}
      <Modal
        visible={showReturnTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReturnTimeModal(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowReturnTimeModal(false)}
        >
          <TouchableOpacity style={s.modalCard} activeOpacity={1} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Return time</Text>
              <TouchableOpacity style={s.modalDoneBtn} onPress={() => setShowReturnTimeModal(false)}>
                <Text style={s.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>Same shop hours apply · {shop.hours}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={s.timeModalScroll} contentContainerStyle={s.timeModalList}>
              {getAvailableTimeSlots(endDate, timeSlots).map(slot => {
                const active = returnTime === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[s.timeModalRow, active && s.timeModalRowActive]}
                    onPress={() => { selectReturnTime(slot); setShowReturnTimeModal(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.timeModalRowText, active && s.timeModalRowTextActive]}>{slot}</Text>
                    {active && <Feather name="check" size={16} color={COLORS.carbon} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Footer CTA ── */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {subtotal > 0 && isReturnValid && (
          <View style={s.footerLeft}>
            <PriceLak lak={subtotal} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.footerPrice} />
            <Text style={s.footerPriceSub}>
              {billableDays} day{billableDays !== 1 ? 's' : ''} · {quantity} unit{quantity !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <PressScale
          style={[s.cta, !ready && s.ctaOff, subtotal === 0 && { flex: 1 }]}
          onPress={handleSubmit}
          disabled={!ready}
          activeOpacity={0.85}
        >
          <Text style={[s.ctaText, !ready && s.ctaTextOff]}>{ctaLabel}</Text>
        </PressScale>
      </View>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
    backgroundColor: COLORS.porcelain,
    borderBottomWidth: 1,
    borderBottomColor: SHADES.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    marginTop: 1,
  },

  // Scroll
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    color: SHADES.carbon,
    marginBottom: 10,
  },
  sectionOptional: {
    fontSize: 10,
    fontWeight: '500',
    color: SHADES.carbonFaint,
    textTransform: 'lowercase',
    letterSpacing: 0,
  },

  // 2×2 field grid
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  fieldBtn: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SHADES.border,
    padding: 14,
    gap: 4,
  },
  fieldBtnFull: {
    width: '100%',
  },
  fieldBtnFilled: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  fieldBtnEye: {
    fontSize: 9,
    fontWeight: '800',
    color: SHADES.carbonMuted,
    letterSpacing: 0.2,
  },
  fieldBtnEyeFilled: {
    color: 'rgba(30,30,30,0.55)',
  },
  fieldBtnVal: {
    fontSize: 13,
    fontWeight: '700',
    color: SHADES.carbonMuted,
    letterSpacing: -0.1,
  },
  fieldBtnValFilled: {
    color: COLORS.carbon,
  },

  // Modals (shared)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30,30,30,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  modalDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
  },
  modalDoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    marginBottom: 14,
    marginTop: -8,
  },

  // Time modal list
  timeModalScroll: {
    maxHeight: 320,
  },
  timeModalList: {
    gap: 4,
  },
  timeModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.porcelain,
  },
  timeModalRowActive: {
    backgroundColor: COLORS.amber,
  },
  timeModalRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: SHADES.carbonMuted,
  },
  timeModalRowTextActive: {
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // Duration chip (green status)
  durationChip: {
    // Neutral info card (no green background).
    backgroundColor: SHADES.white,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: SHADES.border,
  },
  durationChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationChipMain: { fontSize: 14, fontWeight: '700', color: SHADES.carbon },
  durationChipSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 3 },
  discountPill: {
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  discountPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // Return error
  returnError: {
    // One-line error (no red background).
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  returnErrorText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.danger },

  // Stock badge
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stockText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Quantity control
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SHADES.border,
    padding: 6,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: SHADES.carbonLight,
    borderWidth: 1,
    borderColor: SHADES.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnOff: {
    opacity: 0.35,
  },
  qtyDisplay: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  qtyNum: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.5,
  },
  qtyUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },

  // Notes
  notesInput: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SHADES.border,
    padding: 14,
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.carbon,
    minHeight: 80,
    lineHeight: 20,
  },

  // Trust
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: COLORS.porcelain,
    borderTopWidth: 1,
    borderTopColor: SHADES.border,
  },
  footerLeft: {
    flexShrink: 0,
  },
  footerPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  footerPriceSub: {
    fontSize: 11,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    marginTop: -2,
  },
  cta: {
    flex: 1,
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
  ctaTextOff: {
    color: SHADES.carbonMuted,
  },
});
