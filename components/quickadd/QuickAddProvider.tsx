import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION } from '@/constants/motion';
import { EXPLORE_COPY } from '@/constants/exploreCopy';
import { BOOKING_COPY } from '@/constants/bookingCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { TimesRow, QuantityRow } from '@/components/booking/BookingBlocks';
import { SlotSheet } from '@/components/booking/BookingSheets';
import { useLinkedReturnTime } from '@/hooks/useLinkedReturnTime';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { useLoyaltyConfig, depositPercentFor } from '@/lib/loyalty';
import { ProductThumb } from '@/components/home/ProductThumb';
import { useAuth } from '@/contexts/AuthContext';
import { addToBag } from '@/lib/bag';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { useExchangeRate } from '@/lib/exchangeRate';
import { weekendWindow } from '@/lib/homeData';
import type { Product } from '@/lib/mockData';
import { fetchOccupancy, computeAvailableUnits, effectiveStock, nextAvailableDay, type OccupancyRecord } from '@/utils/availability';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { getEffectiveRate, billableDaysFromDates, depositForLine } from '@/utils/pricing';
import { toLak } from '@/utils/currency';

// Quick add (validated mockup): one provider (root layout) owns the bottom sheet and the
// "Added to your bag" toast for every product card ("+" on Explore, category pages,
// Liked and the Home rails). Dates: this weekend (weekendWindow) / tomorrow (first slot,
// 1 day) / pick dates (DateRangeCalendar; first slot, return at the same time), then
// Pick-up | Return time cells (booking slot rules, linked return time) and a quantity
// row (max = units free on those exact dates/times). Price = the booking rule (24h blocks
// × getEffectiveRate × quantity), deposit = depositForLine (per unit). Availability = the
// booking rule on this product's occupancy. Adds a dated bag item with that quantity;
// holds, ID and all server checks still run at checkout.

type Choice = 'weekend' | 'tomorrow' | 'pick';
type QWindow = { pickupAt: Date; returnAt: Date };
/** range: dates already picked (product page calendar) → the sheet opens on them.
 *  window: exact pick-up / return times (Explore period from the bag) → same, with those
 *  times instead of the day's first slot. */
type QuickAddOpts = { availableToday?: boolean; range?: { start: Date; end: Date }; window?: QWindow };
interface QuickAddApi { openQuickAdd: (product: Product, opts?: QuickAddOpts) => void }
const Ctx = createContext<QuickAddApi>({ openQuickAdd: () => {} });
export const useQuickAdd = () => useContext(Ctx);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDayShort = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()}`;
const fmtWhen = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const [presetRange, setPresetRange] = useState<{ start: Date; end: Date } | null>(null);
  const [presetWindow, setPresetWindow] = useState<QWindow | null>(null);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openQuickAdd = useCallback((p: Product, opts?: QuickAddOpts) => {
    const w = opts?.window ?? null;
    setStartOnPick(opts?.availableToday === false || !!opts?.range || !!w);
    setPresetRange(w ? { start: dayOf(w.pickupAt), end: dayOf(w.returnAt) } : opts?.range ?? null);
    setPresetWindow(w);
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
      {product && <QuickAddSheet product={product} startOnPick={startOnPick} presetRange={presetRange} presetWindow={presetWindow} onClose={() => setProduct(null)} onAdded={onAdded} />}
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

function QuickAddSheet({ product, startOnPick, presetRange, presetWindow, onClose, onAdded }: {
  product: Product; startOnPick: boolean; presetRange: { start: Date; end: Date } | null; presetWindow: QWindow | null;
  onClose: () => void; onAdded: () => void;
}) {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const shop = useShopInfo();
  const slots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const rate = useExchangeRate();
  const loyaltyConfig = useLoyaltyConfig();
  const loyalty = useMyLoyalty();
  const profile = loyalty.profile as { customerType?: string; loyaltyTier?: string } | null;
  const stock = effectiveStock(product);
  const [occ, setOcc] = useState<OccupancyRecord[] | null>(null);
  const [choice, setChoice] = useState<Choice>(startOnPick ? 'pick' : 'weekend');
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>(presetRange ?? { start: null, end: null });
  const [slotSheet, setSlotSheet] = useState<'pickup' | 'return' | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pick-up / return times — same linked rule as the booking screens (return follows
  // pick-up until the renter picks it by hand).
  const { pickupTime, returnTime, selectPickupTime, selectReturnTime, resetTimes } = useLinkedReturnTime();

  useEffect(() => {
    fetchOccupancy(product.id).then(setOcc).catch(() => setOcc([]));
  }, [product.id]);

  // Each shortcut's DAYS and default times (weekend / tomorrow: first open slot; pick
  // dates: first open slot of the pick-up day, or the bag's exact times).
  const windows = useMemo(() => {
    const available = (d: Date) => getAvailableTimeSlots(d, slots);
    const wk = weekendWindow(new Date(), available);
    const t = new Date(); t.setDate(t.getDate() + 1);
    const tSlot = available(t)[0];
    const tomorrow = tSlot ? { pickupAt: atSlot(t, tSlot), returnAt: atSlot(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1), tSlot) } : null;
    let pick: QWindow | null = null;
    if (range.start && range.end && presetWindow
      && sameDay(range.start, presetWindow.pickupAt) && sameDay(range.end, presetWindow.returnAt)) {
      pick = presetWindow; // the bag's exact times, while the renter keeps those days
    } else if (range.start && range.end) {
      const pSlot = available(range.start)[0];
      if (pSlot) {
        const pickupAt = atSlot(range.start, pSlot);
        const returnAt = atSlot(range.end, pSlot);
        if (returnAt > pickupAt) pick = { pickupAt, returnAt };
      }
    }
    return { weekend: wk ? { pickupAt: wk.pickupAt, returnAt: wk.returnAt } : null, tomorrow, pick };
  }, [slots, range, presetWindow]);

  const free = useCallback((w: QWindow | null) =>
    !!w && occ != null && computeAvailableUnits(occ, w.pickupAt, w.returnAt, stock) >= 1, [occ, stock]);

  // Default once availability is known: the first free shortcut; not free today ("+"
  // in outline) → Pick dates, pre-filled with the next free day (1 day).
  const defaulted = useRef(false);
  useEffect(() => {
    if (occ == null || defaulted.current) return;
    defaulted.current = true;
    if (presetRange) return; // dates already chosen (product page calendar / bag period)
    if (startOnPick) {
      const next = nextAvailableDay(occ, stock);
      if (next instanceof Date) setRange({ start: next, end: new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1) });
      return;
    }
    if (!free(windows.weekend)) setChoice(free(windows.tomorrow) ? 'tomorrow' : 'pick');
  }, [occ, free, windows, startOnPick, stock, presetRange]);

  // New days (shortcut or calendar) → their default times; the renter can then change them.
  const base = windows[choice];
  useEffect(() => {
    if (base) resetTimes(hhmm(base.pickupAt), hhmm(base.returnAt));
    else resetTimes(null, null);
  }, [base, resetTimes]);

  const sel = useMemo<QWindow | null>(() => {
    if (!base || !pickupTime || !returnTime) return null;
    const pickupAt = atSlot(base.pickupAt, pickupTime);
    const returnAt = atSlot(base.returnAt, returnTime);
    return returnAt > pickupAt ? { pickupAt, returnAt } : null;
  }, [base, pickupTime, returnTime]);
  const badOrder = !!base && !!pickupTime && !!returnTime && sel == null;

  // Units free on the exact dates / times → quantity max; everything follows.
  const units = sel && occ != null ? computeAvailableUnits(occ, sel.pickupAt, sel.returnAt, stock) : 0;
  useEffect(() => { if (units > 0) setQty(q => Math.min(q, units)); }, [units]);
  const quantity = units > 0 ? Math.min(qty, units) : qty;
  const selFree = units >= 1;
  const days = sel ? billableDaysFromDates(sel.pickupAt, sel.returnAt) : 0;
  const perDayUsd = sel ? getEffectiveRate(product, days) : null;
  const total = perDayUsd != null && rate != null ? toLak(perDayUsd, rate) * days * quantity : null;
  const priceDay = rate != null && product.pricePerDay > 0 ? toLak(product.pricePerDay, rate) : null;
  const deposit = rate != null
    ? depositForLine(product.deposit, rate, depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig), quantity)
    : null;

  const add = async () => {
    if (!user || !sel || !selFree || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addToBag(user.uid, product, { pickupAt: sel.pickupAt, returnAt: sel.returnAt }, quantity);
      onAdded();
    } catch {
      setError(EXPLORE_COPY.quickAdd.error);
      setSaving(false);
    }
  };

  // Drag the handle down to close.
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4,
    onPanResponderRelease: (_e, g) => { if (g.dy > 60 || (Math.abs(g.dy) < 4 && Math.abs(g.dx) < 4)) onClose(); },
  }), [onClose]);

  const q = EXPLORE_COPY.quickAdd;
  const c = BOOKING_COPY;
  const shortcut = (key: Choice, label: string, w: QWindow | null, busyLabel: string, icon?: 'calendar') => {
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
      {/* The backdrop is a SIBLING of the sheet (not its parent), so touches inside the
          sheet go to its ScrollView — the whole content scrolls from anywhere. */}
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={q.close} />
        <View style={s.sheet}>
          <View style={s.handleArea} {...drag.panHandlers} accessibilityLabel={q.close}>
            <View style={s.handle} />
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
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

            {base && (
              <View style={[UI.card, { marginTop: 14 }]}>
                <TimesRow
                  top={false}
                  pickup={pickupTime}
                  ret={returnTime}
                  onPickup={() => setSlotSheet('pickup')}
                  onReturn={() => setSlotSheet('return')}
                />
              </View>
            )}
            {badOrder && <Text style={[UI.errorText, { marginTop: 8 }]}>{q.returnBeforePickup}</Text>}

            {occ == null ? (
              <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 18 }} />
            ) : sel && (
              <>
                {selFree && <QuantityRow quantity={quantity} available={units} onChange={v => setQty(Math.max(1, Math.min(v, units)))} />}
                <View style={s.summary}>
                  <View style={s.line}><Text style={s.lineLabel}>{q.pickup}</Text><Text style={s.lineValue}>{fmtWhen(sel.pickupAt)}</Text></View>
                  <View style={s.line}><Text style={s.lineLabel}>{q.return}</Text><Text style={s.lineValue}>{fmtWhen(sel.returnAt)}</Text></View>
                  <View style={[s.line, s.totalLine]}>
                    <Text style={s.totalLabel}>{q.days(days)}</Text>
                    <Text style={s.totalValue}>{total != null ? `${total.toLocaleString('en-US')} LAK` : '—'}</Text>
                  </View>
                  {deposit != null && (
                    <View style={s.line}>
                      <Text style={s.lineLabel}>{q.deposit}</Text>
                      <Text style={s.lineLabel}>{`${deposit.deposit.toLocaleString('en-US')} LAK`}</Text>
                    </View>
                  )}
                  {deposit != null && quantity > 1 && (
                    <Text style={s.depositDetail}>{q.depositPerUnit(quantity, deposit.depositPerUnit.toLocaleString('en-US'))}</Text>
                  )}
                  {!selFree && <Text style={[UI.errorText, { marginTop: 8 }]}>{q.notFreeDates}</Text>}
                </View>
              </>
            )}
            {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}
          </ScrollView>

          {/* Fixed footer above the system bar — "Add to bag" is never hidden. */}
          <View style={[s.footer, { paddingBottom: screen.bottom + 12 }]}>
            <PressScale style={[UI.btnPrimary, (!sel || !selFree || saving) && UI.btnDisabled]} onPress={add} disabled={!sel || !selFree || saving}>
              {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : (
                <>
                  <Feather name="shopping-bag" size={18} color={SHADES.carbon} />
                  <Text style={UI.btnPrimaryText}>{q.add}</Text>
                </>
              )}
            </PressScale>
            <Text style={s.payLater}>{q.payLater}</Text>
          </View>
        </View>
      </View>

      <SlotSheet
        visible={slotSheet === 'pickup'}
        title={c.pickup}
        sub={`${shop.name} · ${shop.hours}`}
        slots={base ? getAvailableTimeSlots(base.pickupAt, slots) : []}
        selected={pickupTime}
        onSelect={selectPickupTime}
        onClose={() => setSlotSheet(null)}
      />
      <SlotSheet
        visible={slotSheet === 'return'}
        title={c.return}
        sub={shop.hours}
        slots={base ? getAvailableTimeSlots(base.returnAt, slots) : []}
        selected={returnTime}
        onSelect={selectReturnTime}
        onClose={() => setSlotSheet(null)}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
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
  depositDetail: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'right', marginTop: -4 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: SHADES.border, backgroundColor: SHADES.white },
  payLater: { fontSize: 13, color: SHADES.carbonMuted, textAlign: 'center', marginTop: 10 },
  toast: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SHADES.carbon, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  toastText: { flex: 1, fontSize: 14, fontWeight: '600', color: SHADES.white },
  toastLink: { fontSize: 14, fontWeight: '800', color: SHADES.amber },
});
