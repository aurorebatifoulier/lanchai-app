import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION } from '@/constants/motion';
import { EXPLORE_COPY } from '@/constants/exploreCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { ProductThumb } from '@/components/home/ProductThumb';
import { useAuth } from '@/contexts/AuthContext';
import { addToBag } from '@/lib/bag';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { useExchangeRate } from '@/lib/exchangeRate';
import { weekendWindow } from '@/lib/homeData';
import type { Product } from '@/lib/mockData';
import { fetchOccupancy, computeAvailableUnits, effectiveStock, type OccupancyRecord } from '@/utils/availability';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { getEffectiveRate, billableDaysFromDates } from '@/utils/pricing';
import { toLak } from '@/utils/currency';

// Quick add (validated mockup): one provider (root layout) owns the bottom sheet and the
// "Added to your bag" toast for every product card ("+" on Explore, category pages,
// Liked and the Home rails). Dates: this weekend (weekendWindow) / tomorrow (first slot,
// 1 day) / pick dates (DateRangeCalendar; first slot, return at the same time). Price =
// the booking rule (24h blocks × getEffectiveRate). Availability = the booking rule on
// this product's occupancy. Adds a dated bag item (quantity 1); holds, ID and all server
// checks still run at checkout.

type Choice = 'weekend' | 'tomorrow' | 'pick';
interface QuickAddApi { openQuickAdd: (product: Product, opts?: { availableToday?: boolean }) => void }
const Ctx = createContext<QuickAddApi>({ openQuickAdd: () => {} });
export const useQuickAdd = () => useContext(Ctx);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDayShort = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()}`;
const fmtWhen = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const atSlot = (day: Date, slot: string) => {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const [h, m] = slot.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [startOnPick, setStartOnPick] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openQuickAdd = useCallback((p: Product, opts?: { availableToday?: boolean }) => {
    setStartOnPick(opts?.availableToday === false);
    setProduct(p);
  }, []);

  const onAdded = useCallback(() => {
    setProduct(null);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const api = useMemo(() => ({ openQuickAdd }), [openQuickAdd]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {product && <QuickAddSheet product={product} startOnPick={startOnPick} onClose={() => setProduct(null)} onAdded={onAdded} />}
      {toast && <Toast onView={() => { setToast(false); router.push('/bag'); }} />}
    </Ctx.Provider>
  );
}

function Toast({ onView }: { onView: () => void }) {
  const screen = useScreenInsets();
  return (
    <Animated.View
      entering={FadeInDown.duration(MOTION.duration.base).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(MOTION.duration.fast).reduceMotion(ReduceMotion.System)}
      style={[s.toast, { bottom: screen.bottom + 72 }]}
      pointerEvents="box-none"
    >
      <Feather name="check-circle" size={16} color={SHADES.amber} />
      <Text style={s.toastText}>{EXPLORE_COPY.quickAdd.added}</Text>
      <TouchableOpacity onPress={onView} hitSlop={8}>
        <Text style={s.toastLink}>{EXPLORE_COPY.quickAdd.viewBag}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function QuickAddSheet({ product, startOnPick, onClose, onAdded }: {
  product: Product; startOnPick: boolean; onClose: () => void; onAdded: () => void;
}) {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const shop = useShopInfo();
  const slots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const rate = useExchangeRate();
  const stock = effectiveStock(product);
  const [occ, setOcc] = useState<OccupancyRecord[] | null>(null);
  const [choice, setChoice] = useState<Choice>(startOnPick ? 'pick' : 'weekend');
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOccupancy(product.id).then(setOcc).catch(() => setOcc([]));
  }, [product.id]);

  const windows = useMemo(() => {
    const available = (d: Date) => getAvailableTimeSlots(d, slots);
    const wk = weekendWindow(new Date(), available);
    const t = new Date(); t.setDate(t.getDate() + 1);
    const tSlot = available(t)[0];
    const tomorrow = tSlot ? { pickupAt: atSlot(t, tSlot), returnAt: atSlot(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1), tSlot) } : null;
    let pick: { pickupAt: Date; returnAt: Date } | null = null;
    if (range.start && range.end) {
      const pSlot = available(range.start)[0];
      if (pSlot) {
        const pickupAt = atSlot(range.start, pSlot);
        const returnAt = atSlot(range.end, pSlot);
        if (returnAt > pickupAt) pick = { pickupAt, returnAt };
      }
    }
    return { weekend: wk ? { pickupAt: wk.pickupAt, returnAt: wk.returnAt } : null, tomorrow, pick };
  }, [slots, range]);

  const free = useCallback((w: { pickupAt: Date; returnAt: Date } | null) =>
    !!w && occ != null && computeAvailableUnits(occ, w.pickupAt, w.returnAt, stock) >= 1, [occ, stock]);

  // Default to the first free shortcut once availability is known.
  const defaulted = useRef(false);
  useEffect(() => {
    if (occ == null || defaulted.current || startOnPick) return;
    defaulted.current = true;
    if (!free(windows.weekend)) setChoice(free(windows.tomorrow) ? 'tomorrow' : 'pick');
  }, [occ, free, windows, startOnPick]);

  const sel = windows[choice];
  const selFree = free(sel);
  const days = sel ? billableDaysFromDates(sel.pickupAt, sel.returnAt) : 0;
  const perDayUsd = sel ? getEffectiveRate(product, days) : null;
  const total = perDayUsd != null && rate != null ? toLak(perDayUsd, rate) * days : null;
  const priceDay = rate != null && product.pricePerDay > 0 ? toLak(product.pricePerDay, rate) : null;

  const add = async () => {
    if (!user || !sel || !selFree || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addToBag(user.uid, product, { pickupAt: sel.pickupAt, returnAt: sel.returnAt });
      onAdded();
    } catch {
      setError(EXPLORE_COPY.quickAdd.error);
      setSaving(false);
    }
  };

  const q = EXPLORE_COPY.quickAdd;
  const shortcut = (key: Choice, label: string, w: { pickupAt: Date; returnAt: Date } | null, busyLabel: string, icon?: 'calendar') => {
    const unavailable = key !== 'pick' && occ != null && !free(w);
    const on = choice === key;
    return (
      <PressScale
        key={key}
        style={[s.short, on && s.shortOn, unavailable && s.shortOff]}
        onPress={() => { setChoice(key); setError(null); }}
        disabled={unavailable}
      >
        {icon && <Feather name={icon} size={14} color={on ? SHADES.amber : SHADES.carbon} />}
        <Text style={[s.shortText, on && s.shortTextOn]}>{unavailable ? busyLabel : label}</Text>
      </PressScale>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: screen.bottom + 16 }]} onPress={() => {}}>
          <View style={s.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.head}>
              <ProductThumb product={product} size={64} radius={16} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={2}>{product.name}</Text>
                {priceDay != null && <Text style={UI.subtitle}>{`${priceDay.toLocaleString('en-US')} LAK / day`}</Text>}
              </View>
            </View>

            <Text style={s.when}>{q.when}</Text>
            <View style={s.shortRow}>
              {windows.weekend && shortcut('weekend', q.weekend(`${fmtDayShort(windows.weekend.pickupAt)} – ${fmtDayShort(windows.weekend.returnAt)}`), windows.weekend, q.notFreeWeekend)}
              {windows.tomorrow && shortcut('tomorrow', q.tomorrow, windows.tomorrow, q.notFreeTomorrow)}
              {shortcut('pick', q.pickDates, null, q.pickDates, 'calendar')}
            </View>

            {choice === 'pick' && (
              <View style={{ marginTop: 12 }}>
                <DateRangeCalendar
                  productId={product.id}
                  totalStock={stock}
                  startDate={range.start}
                  endDate={range.end}
                  onChangeRange={(start, end) => setRange({ start, end })}
                  timeSlots={slots}
                />
                {!windows.pick && <Text style={[UI.small, { marginTop: 6 }]}>{q.chooseDates}</Text>}
              </View>
            )}

            {occ == null ? (
              <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 18 }} />
            ) : sel && (
              <View style={s.summary}>
                <View style={s.line}><Text style={s.lineLabel}>{q.pickup}</Text><Text style={s.lineValue}>{fmtWhen(sel.pickupAt)}</Text></View>
                <View style={s.line}><Text style={s.lineLabel}>{q.return}</Text><Text style={s.lineValue}>{fmtWhen(sel.returnAt)}</Text></View>
                <View style={[s.line, s.totalLine]}>
                  <Text style={s.totalLabel}>{q.days(days)}</Text>
                  <Text style={s.totalValue}>{total != null ? `${total.toLocaleString('en-US')} LAK` : '—'}</Text>
                </View>
                {!selFree && <Text style={[UI.errorText, { marginTop: 8 }]}>{q.notFreeDates}</Text>}
              </View>
            )}

            {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}
            <PressScale style={[UI.btnPrimary, s.addBtn, (!sel || !selFree || saving) && UI.btnDisabled]} onPress={add} disabled={!sel || !selFree || saving}>
              {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : (
                <>
                  <Feather name="shopping-bag" size={18} color={SHADES.carbon} />
                  <Text style={UI.btnPrimaryText}>{q.add}</Text>
                </>
              )}
            </PressScale>
            <Text style={s.payLater}>{q.payLater}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 19, fontWeight: '800', color: SHADES.carbon },
  when: { fontSize: 16, fontWeight: '800', color: SHADES.carbon, marginTop: 20, marginBottom: 10 },
  shortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  short: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
  },
  shortOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  shortOff: { opacity: 0.5 },
  shortText: { fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  shortTextOn: { color: SHADES.cream, fontWeight: '700' },
  summary: { backgroundColor: SHADES.cream, borderRadius: 16, padding: 16, marginTop: 16, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 14, color: SHADES.carbonMuted, fontWeight: '500' },
  lineValue: { fontSize: 14, color: SHADES.carbon, fontWeight: '600' },
  totalLine: { borderTopWidth: 0.5, borderTopColor: SHADES.border, paddingTop: 10, marginTop: 2 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: SHADES.carbon },
  totalValue: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
  addBtn: { marginTop: 18 },
  payLater: { fontSize: 13, color: SHADES.carbonMuted, textAlign: 'center', marginTop: 10 },
  toast: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SHADES.carbon, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  toastText: { flex: 1, fontSize: 14, fontWeight: '600', color: SHADES.white },
  toastLink: { fontSize: 14, fontWeight: '800', color: SHADES.amber },
});
