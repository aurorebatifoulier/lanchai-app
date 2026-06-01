import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { getProduct, createReservation } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { calculateTotalPrice, calculateDays } from '@/utils/pricing';
import { getAvailableStock } from '@/utils/availability';

// ── Dark theme palette ──────────────────────────────────────────────────────
const BG     = '#000000';
const CARD   = '#111111';
const BORDER = '#2A2A2A';
const YELLOW = '#F4B400';
const WHITE  = '#FFFFFF';
const GRAY   = 'rgba(255,255,255,0.5)';
const DIM    = 'rgba(255,255,255,0.2)';
const SUCCESS = '#2E8B57';
const DANGER  = '#C8412C';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['M','T','W','T','F','S','S'];

// ── Calendar helpers ─────────────────────────────────────────────────────────
type CalDay = { d: number; date: Date; muted?: boolean };

function buildCalendarDays(year: number, month: number): CalDay[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const days: CalDay[] = [];
  for (let i = offset - 1; i >= 0; i--)
    days.push({ d: prevDays - i, date: new Date(year, month - 1, prevDays - i), muted: true });
  for (let d = 1; d <= daysInMonth; d++)
    days.push({ d, date: new Date(year, month, d) });
  const trailing = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++)
    days.push({ d, date: new Date(year, month + 1, d), muted: true });
  return days;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtDate(d: Date) {
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${dow[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function BookingNewScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [availableStock, setAvailableStock] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!productId) return;
    getProduct(productId).then(p => {
      setProduct(p);
      if (p) setAvailableStock(p.stockLeft);
      setLoading(false);
    });
  }, [productId]);

  useEffect(() => {
    if (!product || !startDate || !endDate) return;
    getAvailableStock(product.id, startDate, endDate, product.stockLeft).then(s => {
      setAvailableStock(s);
      if (quantity > s) setQuantity(Math.max(1, s));
    });
  }, [startDate, endDate]);

  const calDays = buildCalendarDays(calYear, calMonth);
  const numDays = startDate && endDate ? calculateDays(startDate, endDate) : 0;
  const totalPrice =
    product && startDate && endDate
      ? calculateTotalPrice(product.pricePerDay, startDate, endDate, quantity)
      : 0;

  const handleDayPress = (day: CalDay) => {
    if (day.muted || day.date < today) return;
    if (!startDate || (startDate && endDate)) {
      setStartDate(new Date(day.date));
      setEndDate(null);
    } else if (sameDay(day.date, startDate)) {
      setStartDate(null);
    } else if (day.date < startDate) {
      setStartDate(new Date(day.date));
      setEndDate(null);
    } else {
      setEndDate(new Date(day.date));
    }
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const handleSubmit = async () => {
    if (!product || !startDate || !endDate || submitting) return;
    setSubmitting(true);
    try {
      const id = await createReservation({
        userId: 'user1',
        productId: product.id,
        productName: product.name,
        productIcon: product.iconName,
        productIconSet: product.iconSet,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        store: 'LANCHAI · Setthathirath',
        status: 'upcoming',
        totalPrice,
        depositAmount: product.deposit,
        paidNow: product.deposit,
        payAtPickup: totalPrice - product.deposit,
        bookingId: 'LCH-' + Date.now(),
        cardBg: product.cardBg,
        daysCurrent: 0,
        daysTotal: numDays,
      });
      router.replace({
        pathname: '/booking/confirmation',
        params: {
          bookingId: id,
          productName: product.name,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          quantity: String(quantity),
          totalPrice: String(totalPrice),
        },
      });
    } catch {
      // mock mode — navigate anyway with a generated ID
      router.replace({
        pathname: '/booking/confirmation',
        params: {
          bookingId: 'LCH-' + Date.now(),
          productName: product.name,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          quantity: String(quantity),
          totalPrice: String(totalPrice),
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        <ActivityIndicator color={YELLOW} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }
  if (!product) return null;

  const ready = !!startDate && !!endDate && quantity >= 1 && availableStock > 0;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={WHITE} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Reserve</Text>
          <Text style={s.headerSub} numberOfLines={1}>{product.name}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ DATES ══════════════════════════════════════════════════════════ */}
        <Text style={s.sectionLabel}>DATES</Text>

        <View style={s.cal}>
          {/* Month nav */}
          <View style={s.calNav}>
            <TouchableOpacity style={s.calNavBtn} onPress={prevMonth}>
              <Feather name="chevron-left" size={18} color={WHITE} />
            </TouchableOpacity>
            <Text style={s.calMonthTitle}>{MONTHS[calMonth]} {calYear}</Text>
            <TouchableOpacity style={s.calNavBtn} onPress={nextMonth}>
              <Feather name="chevron-right" size={18} color={WHITE} />
            </TouchableOpacity>
          </View>

          {/* Grid */}
          <View style={s.calGrid}>
            {DOW.map((d, i) => (
              <View key={i} style={s.calDow}>
                <Text style={s.calDowText}>{d}</Text>
              </View>
            ))}
            {calDays.map((day, i) => {
              const isPast = !day.muted && day.date < today;
              const isStart = !!(startDate && !day.muted && sameDay(day.date, startDate));
              const isEnd = !!(endDate && !day.muted && sameDay(day.date, endDate));
              const inRange = !!(
                startDate && endDate && !day.muted &&
                day.date > startDate && day.date < endDate
              );
              const disabled = !!day.muted || isPast;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.calCell,
                    disabled && s.calCellDisabled,
                    inRange && s.calCellRange,
                    (isStart || isEnd) && s.calCellEndpoint,
                  ]}
                  onPress={() => handleDayPress(day)}
                  activeOpacity={disabled ? 1 : 0.7}
                >
                  <Text style={[
                    s.calCellText,
                    disabled && s.calCellTextDisabled,
                    inRange && s.calCellTextInRange,
                    (isStart || isEnd) && s.calCellTextEndpoint,
                  ]}>
                    {day.d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Date chips */}
        <View style={s.dateChips}>
          <View style={[s.dateChip, startDate && s.dateChipFilled]}>
            <Text style={[s.dateChipEye, startDate && s.dateChipEyeDark]}>PICK UP</Text>
            <Text style={[s.dateChipVal, startDate && s.dateChipValDark]}>
              {startDate ? fmtDate(startDate) : 'Select'}
            </Text>
          </View>
          <Feather name="arrow-right" size={14} color={DIM} />
          <View style={[s.dateChip, endDate && s.dateChipFilled]}>
            <Text style={[s.dateChipEye, endDate && s.dateChipEyeDark]}>RETURN</Text>
            <Text style={[s.dateChipVal, endDate && s.dateChipValDark]}>
              {endDate ? fmtDate(endDate) : 'Select'}
            </Text>
          </View>
        </View>

        {startDate && endDate && (
          <View style={s.durationBadge}>
            <Feather name="clock" size={13} color={YELLOW} />
            <Text style={s.durationBadgeText}>
              {numDays} day{numDays !== 1 ? 's' : ''} rental
            </Text>
          </View>
        )}

        {/* ══ QUANTITY ═══════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>QUANTITY</Text>

        <View style={s.stockBadge}>
          <View style={[s.stockDot, { backgroundColor: availableStock > 0 ? SUCCESS : DANGER }]} />
          <Text style={[s.stockText, { color: availableStock > 0 ? SUCCESS : DANGER }]}>
            {availableStock > 0 ? `${availableStock} in stock` : 'Out of stock'}
          </Text>
        </View>

        <View style={s.qtyControl}>
          <TouchableOpacity
            style={[s.qtyBtn, quantity <= 1 && s.qtyBtnOff]}
            onPress={() => quantity > 1 && setQuantity(q => q - 1)}
          >
            <Feather name="minus" size={20} color={quantity <= 1 ? DIM : WHITE} />
          </TouchableOpacity>
          <View style={s.qtyDisplay}>
            <Text style={s.qtyNum}>{quantity}</Text>
            <Text style={s.qtyUnit}>unit{quantity !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity
            style={[s.qtyBtn, quantity >= availableStock && s.qtyBtnOff]}
            onPress={() => quantity < availableStock && setQuantity(q => q + 1)}
          >
            <Feather name="plus" size={20} color={quantity >= availableStock ? DIM : WHITE} />
          </TouchableOpacity>
        </View>

        {/* ══ NOTES ══════════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>NOTES <Text style={s.sectionOptional}>(optional)</Text></Text>
        <TextInput
          style={s.notesInput}
          placeholder="Special instructions or questions…"
          placeholderTextColor={DIM}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        {/* ══ SUMMARY ════════════════════════════════════════════════════════ */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>SUMMARY</Text>

        <View style={s.summaryCard}>
          <SumRow label="Item"     value={product.name} />
          <SumRow label="Pick-up"  value={startDate ? fmtDate(startDate) : '—'} />
          <SumRow label="Return"   value={endDate ? fmtDate(endDate) : '—'} />
          <SumRow label="Duration" value={numDays > 0 ? `${numDays} days` : '—'} />
          <SumRow label="Quantity" value={`${quantity} unit${quantity !== 1 ? 's' : ''}`} />

          {/* Price breakdown */}
          {totalPrice > 0 && (
            <>
              <View style={s.sumSep} />
              <View style={s.priceBreakdown}>
                <Text style={s.priceBreakdownText}>
                  {product.pricePerDay}K × {numDays} day{numDays !== 1 ? 's' : ''} × {quantity}
                </Text>
                <Text style={s.priceBreakdownText}>{totalPrice}K LAK</Text>
              </View>
            </>
          )}

          <View style={s.sumTotalRow}>
            <Text style={s.sumTotalLabel}>TOTAL</Text>
            <Text style={s.sumTotalValue}>
              {totalPrice > 0 ? `${totalPrice}K LAK` : '—'}
            </Text>
          </View>
        </View>

        <View style={s.trust}>
          <Feather name="shield" size={13} color={YELLOW} />
          <Text style={s.trustText}>Free cancellation up to 24h before pick-up.</Text>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Footer CTA ── */}
      <View style={s.footer}>
        {totalPrice > 0 && (
          <View style={s.footerLeft}>
            <Text style={s.footerPrice}>{totalPrice}K LAK</Text>
            <Text style={s.footerPriceSub}>
              {numDays} days · {quantity} unit{quantity !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.cta, !ready && s.ctaOff, totalPrice === 0 && { flex: 1 }]}
          onPress={handleSubmit}
          disabled={!ready || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={BG} size="small" />
          ) : (
            <Text style={[s.ctaText, !ready && s.ctaTextOff]}>
              {ready ? 'Confirm reservation' : 'Select dates first'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={s.sumValue}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: GRAY,
    marginTop: 1,
  },

  // Scroll
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: GRAY,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sectionOptional: {
    fontSize: 10,
    fontWeight: '500',
    color: DIM,
    textTransform: 'lowercase',
    letterSpacing: 0,
  },

  // Calendar
  cal: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.2,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDow: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingBottom: 6,
  },
  calDowText: {
    fontSize: 10,
    fontWeight: '700',
    color: DIM,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calCellDisabled: {
    opacity: 0.2,
  },
  calCellRange: {
    backgroundColor: 'rgba(244,180,0,0.15)',
    borderRadius: 0,
  },
  calCellEndpoint: {
    backgroundColor: YELLOW,
    borderRadius: 10,
  },
  calCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
  },
  calCellTextDisabled: {
    color: DIM,
  },
  calCellTextInRange: {
    color: YELLOW,
    fontWeight: '700',
  },
  calCellTextEndpoint: {
    color: BG,
    fontWeight: '800',
  },

  // Date chips
  dateChips: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  dateChip: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 3,
  },
  dateChipFilled: {
    backgroundColor: YELLOW,
    borderColor: YELLOW,
  },
  dateChipEye: {
    fontSize: 9,
    fontWeight: '800',
    color: DIM,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dateChipEyeDark: {
    color: 'rgba(0,0,0,0.45)',
  },
  dateChipVal: {
    fontSize: 13,
    fontWeight: '700',
    color: GRAY,
    letterSpacing: -0.1,
  },
  dateChipValDark: {
    color: BG,
  },

  // Duration badge
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  durationBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: YELLOW,
  },

  // Stock badge
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
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
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 6,
    gap: 0,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnOff: {
    opacity: 0.4,
  },
  qtyDisplay: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  qtyNum: {
    fontSize: 28,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  qtyUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: GRAY,
  },

  // Notes
  notesInput: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    fontSize: 14,
    fontWeight: '400',
    color: WHITE,
    minHeight: 80,
    lineHeight: 20,
  },

  // Summary card
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 0,
    overflow: 'hidden',
  },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sumLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY,
  },
  sumValue: {
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.1,
  },
  sumSep: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 8,
  },
  priceBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  priceBreakdownText: {
    fontSize: 12,
    fontWeight: '500',
    color: GRAY,
  },
  sumTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
  },
  sumTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: GRAY,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sumTotalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: YELLOW,
    letterSpacing: -0.4,
  },

  // Trust
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
    color: GRAY,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerLeft: {
    flexShrink: 0,
  },
  footerPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  footerPriceSub: {
    fontSize: 11,
    fontWeight: '500',
    color: GRAY,
    marginTop: -2,
  },
  cta: {
    flex: 1,
    height: 52,
    backgroundColor: YELLOW,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaOff: {
    backgroundColor: CARD,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    color: BG,
    letterSpacing: -0.2,
  },
  ctaTextOff: {
    color: GRAY,
  },
});
