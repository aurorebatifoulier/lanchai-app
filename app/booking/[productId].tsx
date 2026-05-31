import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { getProduct, createReservation } from '@/lib/firestore';
import { Product, STORES } from '@/lib/mockData';

type Step = 1 | 2 | 3 | 4 | 5;
type DurationTier = 'short' | 'medium' | 'long' | 'expat';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Array<{ d: number; muted?: boolean }> = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) days.push({ d: prevDays - i, muted: true });
  for (let d = 1; d <= daysInMonth; d++) days.push({ d });
  return days;
}

export default function BookingScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [duration, setDuration] = useState<DurationTier>('medium');
  const [pickupDay, setPickupDay] = useState(14);
  const [returnDay, setReturnDay] = useState(21);
  const [selectedStore, setSelectedStore] = useState(0);
  const [payMethod, setPayMethod] = useState<'card' | 'qr'>('card');
  const [confirmed, setConfirmed] = useState(false);
  const [bookingId] = useState('LCH-2026-' + Math.floor(10000 + Math.random() * 90000));

  useEffect(() => {
    if (productId) getProduct(productId).then(setProduct);
  }, [productId]);

  if (!product) return null;

  const rentalDays = returnDay - pickupDay;
  const pricePerDay =
    duration === 'medium' ? product.price8to30 :
    duration === 'long' ? product.price30plus :
    product.pricePerDay;
  const totalRental = pricePerDay * rentalDays;
  const serviceFee = 30;
  const total = totalRental + serviceFee;
  const reservationFee = Math.round(total * 0.25);
  const deposit = product.deposit;
  const payNow = reservationFee + deposit;
  const payAtPickup = total - reservationFee;

  const handleNext = () => {
    if (step < 4) setStep(s => (s + 1) as Step);
  };

  const handlePay = async () => {
    try {
      await createReservation({
        userId: 'user1',
        productId: product.id,
        productName: product.name,
        productIcon: product.iconName,
        productIconSet: product.iconSet,
        startDate: `2026-05-${pickupDay.toString().padStart(2, '0')}`,
        endDate: `2026-05-${returnDay.toString().padStart(2, '0')}`,
        store: STORES[selectedStore].name,
        status: 'upcoming',
        totalPrice: total,
        depositAmount: deposit,
        paidNow: payNow,
        payAtPickup,
        bookingId,
        cardBg: product.cardBg,
        daysCurrent: 0,
        daysTotal: rentalDays,
      });
    } catch {}
    setConfirmed(true);
  };

  if (confirmed) {
    return <ConfirmationScreen bookingId={bookingId} product={product} pickupDay={pickupDay} returnDay={returnDay} store={STORES[selectedStore].name} paidNow={payNow} payAtPickup={payAtPickup} onDone={() => router.replace('/reservations')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.head}>
        <TouchableOpacity style={styles.backBtn} onPress={() => step === 1 ? router.back() : setStep(s => (s - 1) as Step)}>
          <Feather name="arrow-left" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>Reserve</Text>
        <View style={{ width: 42 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progress}>
        {([1, 2, 3, 4] as Step[]).map(s => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s < step && styles.progressDone,
              s === step && styles.progressOn,
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {step === 1 && <StepDuration duration={duration} setDuration={setDuration} pricePerDay={product.pricePerDay} price8to30={product.price8to30} price30plus={product.price30plus} />}
        {step === 2 && <StepDates pickupDay={pickupDay} returnDay={returnDay} setPickupDay={setPickupDay} setReturnDay={setReturnDay} />}
        {step === 3 && <StepStore selectedStore={selectedStore} setSelectedStore={setSelectedStore} />}
        {step === 4 && <StepPayment product={product} rentalDays={rentalDays} totalRental={totalRental} serviceFee={serviceFee} total={total} reservationFee={reservationFee} deposit={deposit} payNow={payNow} payAtPickup={payAtPickup} payMethod={payMethod} setPayMethod={setPayMethod} />}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.foot}>
        <View>
          <Text style={styles.footPrice}>{payNow}K LAK</Text>
          <Text style={styles.footPriceSub}>{step < 4 ? `${rentalDays} days · est. total` : 'now · ' + payAtPickup + 'K at pick-up'}</Text>
        </View>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={step === 4 ? handlePay : handleNext}
          activeOpacity={0.85}
        >
          {step === 4 && <Feather name="lock" size={14} color={COLORS.carbon} style={{ marginRight: 6 }} />}
          <Text style={styles.ctaBtnText}>{step === 4 ? 'Pay & reserve' : 'Continue'}</Text>
          {step < 4 && <Feather name="arrow-right" size={16} color={COLORS.carbon} style={{ marginLeft: 6 }} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---- Step 1: Duration ----
function StepDuration({ duration, setDuration, pricePerDay, price8to30, price30plus }: {
  duration: DurationTier;
  setDuration: (d: DurationTier) => void;
  pricePerDay: number; price8to30: number; price30plus: number;
}) {
  const cards: Array<{ id: DurationTier; label: string; title: string; sub: string; discount?: string }> = [
    { id: 'short', label: 'SHORT', title: '1–7 days', sub: `${pricePerDay}K / day` },
    { id: 'medium', label: 'MEDIUM', title: '8–30 days', sub: `${price8to30}K / day · most popular`, discount: '−25%' },
    { id: 'long', label: 'LONG', title: '1–3 months', sub: `${price30plus}K / day` },
    { id: 'expat', label: 'EXPAT', title: '3+ months', sub: 'Custom quote' },
  ];
  return (
    <>
      <Text style={styles.stepEye}>STEP 01 · OF 04</Text>
      <Text style={styles.stepTitle}>How long do you need it?</Text>
      <Text style={styles.stepSub}>Longer rentals get steeper discounts — auto-applied.</Text>
      <View style={styles.durGrid}>
        {cards.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.durCard, duration === c.id && styles.durCardActive]}
            onPress={() => setDuration(c.id)}
          >
            {c.discount && (
              <View style={styles.durDiscount}>
                <Text style={styles.durDiscountText}>{c.discount}</Text>
              </View>
            )}
            <Text style={styles.durLabel}>{c.label}</Text>
            <Text style={styles.durTitle}>{c.title}</Text>
            <Text style={styles.durSub}>{c.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.infoBox}>
        <View style={[styles.infoBoxIcon, { backgroundColor: COLORS.amber }]}>
          <Feather name="zap" size={18} color={COLORS.carbon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoBoxTitle}>You save up to 30% past 8 days</Text>
          <Text style={styles.infoBoxSub}>Pricing auto-adjusts. No need to recalculate.</Text>
        </View>
      </View>
    </>
  );
}

// ---- Step 2: Dates ----
function StepDates({ pickupDay, returnDay, setPickupDay, setReturnDay }: {
  pickupDay: number; returnDay: number;
  setPickupDay: (d: number) => void; setReturnDay: (d: number) => void;
}) {
  const days = buildCalendarDays(2026, 4); // May 2026

  const handleDayPress = (d: number) => {
    if (d < pickupDay || pickupDay === 0) {
      setPickupDay(d);
      setReturnDay(0);
    } else if (d === pickupDay) {
      setPickupDay(0);
      setReturnDay(0);
    } else {
      setReturnDay(d);
    }
  };

  return (
    <>
      <Text style={styles.stepEye}>STEP 02 · OF 04</Text>
      <Text style={styles.stepTitle}>When do you pick it up?</Text>
      <Text style={styles.stepSub}>Vientiane shop · Mon–Sat 9am–7pm</Text>

      <View style={styles.calendar}>
        <View style={styles.calHead}>
          <Text style={styles.calMonth}>May 2026</Text>
          <View style={styles.calArrows}>
            <TouchableOpacity style={styles.calArrow}>
              <Feather name="chevron-left" size={16} color={COLORS.carbon} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.calArrow}>
              <Feather name="chevron-right" size={16} color={COLORS.carbon} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.calGrid}>
          {DOW.map((d, i) => (
            <View key={i} style={styles.calDow}>
              <Text style={styles.calDowText}>{d}</Text>
            </View>
          ))}
          {days.map((day, i) => {
            const inRange = !day.muted && day.d > pickupDay && day.d < returnDay;
            const isPickup = !day.muted && day.d === pickupDay;
            const isReturn = !day.muted && day.d === returnDay;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.calDay,
                  day.muted && styles.calDayMuted,
                  inRange && styles.calDayRange,
                  isPickup && [styles.calDayRange, styles.calDayPickup],
                  isReturn && [styles.calDayRange, styles.calDayReturn],
                ]}
                onPress={() => !day.muted && handleDayPress(day.d)}
                activeOpacity={day.muted ? 1 : 0.7}
              >
                <Text style={[
                  styles.calDayText,
                  day.muted && styles.calDayTextMuted,
                  inRange && styles.calDayTextRange,
                  (isPickup || isReturn) && styles.calDayTextEndpoint,
                ]}>
                  {day.d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.datesSummary}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateBlockEye}>PICK UP</Text>
          <Text style={styles.dateBlockDate}>
            {pickupDay > 0 ? `Thu, May ${pickupDay}` : 'Select'}
          </Text>
          <Text style={styles.dateBlockTime}>From 10:00</Text>
        </View>
        <View style={styles.dateBlock}>
          <Text style={styles.dateBlockEye}>RETURN BY</Text>
          <Text style={styles.dateBlockDate}>
            {returnDay > 0 ? `Thu, May ${returnDay}` : 'Select'}
          </Text>
          <Text style={styles.dateBlockTime}>Before 19:00</Text>
        </View>
      </View>
    </>
  );
}

// ---- Step 3: Store ----
function StepStore({ selectedStore, setSelectedStore }: {
  selectedStore: number; setSelectedStore: (i: number) => void;
}) {
  return (
    <>
      <Text style={styles.stepEye}>STEP 03 · OF 04</Text>
      <Text style={styles.stepTitle}>Where do you pick it up?</Text>
      <Text style={styles.stepSub}>Three shops in Vientiane. Pick the closest one.</Text>

      <View style={styles.storeList}>
        {STORES.map((store, i) => (
          <TouchableOpacity
            key={store.id}
            style={[styles.storeCard, selectedStore === i && styles.storeCardActive]}
            onPress={() => setSelectedStore(i)}
            activeOpacity={0.85}
          >
            <View style={[styles.storeGlyph, selectedStore !== i && styles.storeGlyphInactive]}>
              <Feather name="map-pin" size={20} color={selectedStore === i ? COLORS.amber : COLORS.carbon} />
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeAddress}>{store.address}</Text>
              <View style={styles.storeMeta}>
                <View style={styles.storeMetaItem}>
                  <Feather name="clock" size={11} color={COLORS.fg3} />
                  <Text style={styles.storeMetaText}>{store.distance} · {store.duration}</Text>
                </View>
                <View style={styles.storeMetaItem}>
                  <Feather name="check" size={11} color={COLORS.success} />
                  <Text style={[styles.storeMetaText, { color: COLORS.success }]}>Available May 14</Text>
                </View>
              </View>
            </View>
            <View style={[styles.radio, selectedStore === i && styles.radioActive]}>
              {selectedStore === i && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapPin}>
          <Feather name="map-pin" size={16} color={COLORS.amber} />
        </View>
        <Text style={styles.mapLabel}>Vientiane · 3 shops</Text>
      </View>
    </>
  );
}

// ---- Step 4: Payment ----
function StepPayment({ product, rentalDays, totalRental, serviceFee, total, reservationFee, deposit, payNow, payAtPickup, payMethod, setPayMethod }: {
  product: Product; rentalDays: number; totalRental: number; serviceFee: number; total: number;
  reservationFee: number; deposit: number; payNow: number; payAtPickup: number;
  payMethod: 'card' | 'qr'; setPayMethod: (m: 'card' | 'qr') => void;
}) {
  return (
    <>
      <Text style={styles.stepEye}>STEP 04 · PAY</Text>
      <Text style={styles.stepTitle}>Reserve with deposit.</Text>
      <Text style={styles.stepSub}>Hold your booking — pay the rest when you pick up.</Text>

      <View style={styles.payInfoCard}>
        <View style={styles.payInfoIcon}>
          <Feather name="shield" size={16} color={COLORS.carbon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.payInfoTitle}>Hold deposit + reservation only</Text>
          <Text style={styles.payInfoSub}>{deposit}K refundable deposit + 25% fee. Balance settled in-shop. Cancel free up to 24h before.</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.paySummary}>
        <PayRow label={`${product.name} · ${rentalDays} days`} value={`${totalRental}K LAK`} />
        <PayRow label="Service fee" value={`${serviceFee}K`} />
        <View style={styles.payDivider} />
        <PayRow label="Total rental" value={`${total}K LAK`} bold />
        <PayRow label="· Pay now (reservation 25%)" value={`${reservationFee}K`} muted />
        <PayRow label="· Refundable deposit" value={`${deposit}K`} muted />
        <PayRow label="· Pay at pick-up" value={`${payAtPickup}K`} muted />
      </View>

      {/* Payment methods */}
      <Text style={styles.payMethodsLabel}>PAY WITH</Text>
      <View style={styles.payMethods}>
        <TouchableOpacity
          style={[styles.payMethod, payMethod === 'card' && styles.payMethodActive]}
          onPress={() => setPayMethod('card')}
        >
          <View style={[styles.payMethodIcon, payMethod === 'card' && styles.payMethodIconActive]}>
            <Feather name="credit-card" size={20} color={payMethod === 'card' ? COLORS.amber : COLORS.carbon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.payMethodName}>Card · Visa •• 4242</Text>
            <Text style={styles.payMethodSub}>Expires 09/27</Text>
          </View>
          <View style={[styles.radio, payMethod === 'card' && styles.radioActive]}>
            {payMethod === 'card' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.payMethod, payMethod === 'qr' && styles.payMethodActive]}
          onPress={() => setPayMethod('qr')}
        >
          <View style={[styles.payMethodIcon, payMethod === 'qr' && styles.payMethodIconActive]}>
            <Feather name="maximize" size={20} color={payMethod === 'qr' ? COLORS.amber : COLORS.carbon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.payMethodName}>QR Pay · OnePay, BCEL One</Text>
            <Text style={styles.payMethodSub}>Local QR · most popular in Laos</Text>
          </View>
          <View style={[styles.radio, payMethod === 'qr' && styles.radioActive]}>
            {payMethod === 'qr' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
}

function PayRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={[styles.payRow, bold && styles.payRowTotal]}>
      <Text style={[styles.payRowLabel, muted && styles.payRowMuted, bold && styles.payRowBold]}>{label}</Text>
      <Text style={[styles.payRowValue, muted && styles.payRowMuted, bold && styles.payRowBold]}>{value}</Text>
    </View>
  );
}

// ---- Confirmation ----
function ConfirmationScreen({ bookingId, product, pickupDay, returnDay, store, paidNow, payAtPickup, onDone }: {
  bookingId: string; product: Product; pickupDay: number; returnDay: number;
  store: string; paidNow: number; payAtPickup: number; onDone: () => void;
}) {
  return (
    <SafeAreaView style={[styles.container, { alignItems: 'center' }]}>
      <ScrollView contentContainerStyle={styles.confirmContent} showsVerticalScrollIndicator={false}>
        <View style={styles.confirmTick}>
          <Feather name="check" size={44} color={COLORS.carbon} strokeWidth={3} />
        </View>
        <Text style={styles.confirmTitle}>
          You're <Text style={{ color: COLORS.amber }}>booked.</Text>
        </Text>
        <Text style={styles.confirmSub}>
          Pick up May {pickupDay} from 10:00 at {store}. We'll text you.
        </Text>

        <View style={styles.confirmCard}>
          {[
            { label: 'Booking', value: bookingId, mono: true },
            { label: 'Item', value: product.name },
            { label: 'Window', value: `May ${pickupDay} → May ${returnDay}` },
            { label: 'Pick-up shop', value: store.split(' ·')[0] },
            { label: 'Paid now', value: `${paidNow}K LAK` },
            { label: 'At pick-up', value: `${payAtPickup}K LAK` },
          ].map((row, i) => (
            <View key={i} style={styles.confirmRow}>
              <Text style={styles.confirmRowLabel}>{row.label}</Text>
              <Text style={[styles.confirmRowValue, row.mono && { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.confirmBtnPrimary} onPress={onDone}>
          <Feather name="maximize" size={16} color={COLORS.carbon} />
          <Text style={styles.confirmBtnPrimaryText}>View my reservations</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtnGhost}>
          <Text style={styles.confirmBtnGhostText}>Show pick-up QR</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  // Header
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
    textAlign: 'center',
  },
  // Progress
  progress: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  progressStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.softGray200,
  },
  progressOn: {
    backgroundColor: COLORS.amber,
  },
  progressDone: {
    backgroundColor: COLORS.carbon,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Step text
  stepEye: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: COLORS.amber,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
    color: COLORS.carbon,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg2,
    marginBottom: 20,
    lineHeight: 20,
  },
  // Duration cards
  durGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  durCard: {
    width: '47%',
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderRadius: 18,
    padding: 14,
    position: 'relative',
    backgroundColor: COLORS.white,
    gap: 4,
  },
  durCardActive: {
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.warmBeige,
  },
  durDiscount: {
    position: 'absolute',
    top: -8,
    right: 10,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  durDiscountText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  durLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  durTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: COLORS.carbon,
    marginTop: 4,
  },
  durSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  infoBoxIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  infoBoxSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg2,
    marginTop: 2,
    lineHeight: 17,
  },
  // Calendar
  calendar: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 14,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calMonth: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
  },
  calArrows: {
    flexDirection: 'row',
    gap: 6,
  },
  calArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDow: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 6,
  },
  calDowText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.fg3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calDayMuted: {
    opacity: 0.3,
  },
  calDayRange: {
    backgroundColor: COLORS.amber,
    borderRadius: 0,
  },
  calDayPickup: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  calDayReturn: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  calDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  calDayTextMuted: {
    color: COLORS.softGray,
  },
  calDayTextRange: {
    color: COLORS.carbon,
    fontWeight: '700',
  },
  calDayTextEndpoint: {
    color: COLORS.carbon,
    fontWeight: '800',
  },
  // Dates summary
  datesSummary: {
    flexDirection: 'row',
    gap: 10,
  },
  dateBlock: {
    flex: 1,
    backgroundColor: COLORS.warmBeige,
    borderRadius: 14,
    padding: 12,
  },
  dateBlockEye: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.fg3,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  dateBlockDate: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
    marginTop: 4,
  },
  dateBlockTime: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  // Store
  storeList: {
    gap: 10,
    marginBottom: 18,
  },
  storeCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
  },
  storeCardActive: {
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.warmBeige,
  },
  storeGlyph: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  storeGlyphInactive: {
    backgroundColor: COLORS.warmBeige,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
  },
  storeAddress: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
    marginBottom: 6,
  },
  storeMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  storeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storeMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  radioActive: {
    borderColor: COLORS.carbon,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.carbon,
  },
  mapPlaceholder: {
    height: 120,
    borderRadius: 18,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  // Payment
  payInfoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFF8DD',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  payInfoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  payInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  payInfoSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg2,
    marginTop: 2,
    lineHeight: 17,
  },
  paySummary: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 20,
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  payRowTotal: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.carbon,
    marginTop: 6,
    paddingTop: 12,
  },
  payDivider: {
    height: 0,
  },
  payRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg2,
  },
  payRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  payRowBold: {
    fontSize: 17,
    fontWeight: '800',
  },
  payRowMuted: {
    fontSize: 13,
    color: COLORS.fg3,
    fontWeight: '400',
  },
  payMethodsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
  },
  payMethods: {
    gap: 10,
  },
  payMethod: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
  },
  payMethodActive: {
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.warmBeige,
  },
  payMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  payMethodIconActive: {
    backgroundColor: COLORS.carbon,
  },
  payMethodName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: COLORS.carbon,
  },
  payMethodSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  // Footer CTA
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  footPrice: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
  },
  footPriceSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: -2,
  },
  ctaBtn: {
    flex: 1,
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  // Confirmation
  confirmContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  confirmTick: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    marginBottom: 24,
  },
  confirmTitle: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: COLORS.carbon,
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmSub: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 28,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 24,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  confirmRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  confirmRowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  confirmBtnPrimary: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  confirmBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  confirmBtnGhost: {
    width: '100%',
    height: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});

