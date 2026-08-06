import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

// Admin-only single date+time picker — e.g. for setting a product's earlyAccessUntil
// deadline. Not shop-hours-constrained (unlike the renter-facing DateRangePicker /
// utils/timeSlots.ts, which model pickup/return hours): full day, 30-min increments.

const pad = (n: number) => n.toString().padStart(2, '0');
const TIME_SLOTS: string[] = [];
for (let h = 0; h <= 23; h++) {
  TIME_SLOTS.push(`${pad(h)}:00`);
  TIME_SLOTS.push(`${pad(h)}:30`);
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['M','T','W','T','F','S','S'];

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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtFieldDate(d: Date): string {
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${dow[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export interface AdminDateTimePickerProps {
  visible: boolean;
  initialValue?: Date | null;
  onClose: () => void;
  onConfirm: (value: Date) => void;
}

export default function AdminDateTimePicker({
  visible,
  initialValue = null,
  onClose,
  onConfirm,
}: AdminDateTimePickerProps) {
  const insets = useSafeAreaInsets();

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selDate,  setSelDate]  = useState<Date | null>(null);
  const [selTime,  setSelTime]  = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const ref = initialValue ?? new Date();
    if (initialValue) {
      setSelDate(new Date(initialValue.getFullYear(), initialValue.getMonth(), initialValue.getDate()));
      setSelTime(`${pad(initialValue.getHours())}:${pad(initialValue.getMinutes())}`);
    } else {
      setSelDate(null);
      setSelTime(null);
    }
    setCalYear(ref.getFullYear());
    setCalMonth(ref.getMonth());
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableTimes = useMemo(() => {
    if (!selDate || !sameDay(selDate, new Date())) return TIME_SLOTS;
    const now = new Date();
    const threshold = `${pad(now.getHours())}:${pad(Math.ceil(now.getMinutes() / 30) * 30 % 60)}`;
    return TIME_SLOTS.filter(slot => slot > threshold);
  }, [selDate]);

  const canConfirm = !!selDate && !!selTime;

  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); };

  const handleDayPress = (day: CalDay) => {
    if (day.muted || day.date < today) return;
    setSelDate(new Date(day.date));
    if (selTime && sameDay(day.date, new Date()) && !availableTimes.includes(selTime)) setSelTime(null);
  };

  const handleConfirm = () => {
    if (!selDate || !selTime) return;
    const [h, m] = selTime.split(':').map(Number);
    const dt = new Date(selDate);
    dt.setHours(h, m, 0, 0);
    onConfirm(dt);
  };

  const days = buildCalendarDays(calYear, calMonth);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.root}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Fixed-size block — header, month nav, calendar grid — so the time list
              below always gets a guaranteed, visible share of the sheet's height. */}
          <View>
            <View style={s.header}>
              <Text style={s.title}>Set deadline</Text>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Feather name="x" size={18} color={COLORS.carbon} />
              </TouchableOpacity>
            </View>

            <View style={s.calNav}>
              <TouchableOpacity style={s.calNavBtn} onPress={prevMonth}>
                <Feather name="chevron-left" size={18} color={COLORS.carbon} />
              </TouchableOpacity>
              <Text style={s.calMonthTitle}>{MONTHS[calMonth]} {calYear}</Text>
              <TouchableOpacity style={s.calNavBtn} onPress={nextMonth}>
                <Feather name="chevron-right" size={18} color={COLORS.carbon} />
              </TouchableOpacity>
            </View>

            <View style={s.calGrid}>
              {DOW.map((d, i) => (
                <View key={i} style={s.calDow}><Text style={s.calDowText}>{d}</Text></View>
              ))}
              {days.map((day, i) => {
                const isPast     = !day.muted && day.date < today;
                const isSelected = !!(selDate && !day.muted && sameDay(day.date, selDate));
                const disabled   = !!day.muted || isPast;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.calCell, disabled && s.calCellDisabled, isSelected && s.calCellSelected]}
                    onPress={() => handleDayPress(day)}
                    activeOpacity={disabled ? 1 : 0.7}
                  >
                    <Text style={[s.calCellText, disabled && s.calCellTextDisabled, isSelected && s.calCellTextSelected]}>
                      {day.d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Time</Text>
          </View>

          {/* Flex-fills whatever space remains under the fixed block above, with a
              minHeight floor so it's never squeezed to invisible. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={s.timeScroll}
            contentContainerStyle={s.timeScrollContent}
          >
            {availableTimes.map(slot => {
              const active = selTime === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  style={[s.timeRow, active && s.timeRowActive]}
                  onPress={() => setSelTime(slot)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.timeRowText, active && s.timeRowTextActive]}>{slot}</Text>
                  {active && <Feather name="check" size={16} color={COLORS.carbon} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[s.confirmBtn, !canConfirm && s.confirmBtnOff]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.85}
          >
            <Text style={[s.confirmBtnText, !canConfirm && s.confirmBtnTextOff]}>
              {selDate && selTime ? `Confirm — ${fmtFieldDate(selDate)}, ${selTime}` : 'Select a date and time'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(30,30,30,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20,
    // A definite height (not just a cap) so the flexed timeScroll below always has
    // real remaining space to fill, instead of shrink-wrapping to zero.
    height: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200, alignItems: 'center', justifyContent: 'center',
  },

  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200, alignItems: 'center', justifyContent: 'center',
  },
  calMonthTitle: { fontSize: 16, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.2 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  calDow: { width: `${100 / 7}%` as `${number}%`, alignItems: 'center', paddingBottom: 4 },
  calDowText: { fontSize: 10, fontWeight: '700', color: COLORS.softGray, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Fixed height instead of aspectRatio:1 — a square cell scales with row width and
  // eats far more vertical space than the grid actually needs.
  calCell: { width: `${100 / 7}%` as `${number}%`, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  calCellDisabled: { opacity: 0.2 },
  calCellSelected: { backgroundColor: COLORS.amber },
  calCellText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  calCellTextDisabled: { color: COLORS.softGray },
  calCellTextSelected: { fontWeight: '800', color: COLORS.carbon },

  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: COLORS.fg3, textTransform: 'uppercase', marginBottom: 8 },
  // flex:1 fills whatever the fixed block above leaves within the sheet's definite
  // height; minHeight is a floor so the time list is never squeezed to invisible.
  timeScroll: { flex: 1, minHeight: 140, marginBottom: 8 },
  timeScrollContent: { gap: 4 },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: COLORS.porcelain,
  },
  timeRowActive: { backgroundColor: COLORS.amber },
  timeRowText: { fontSize: 15, fontWeight: '600', color: COLORS.fg2 },
  timeRowTextActive: { fontWeight: '800', color: COLORS.carbon },

  confirmBtn: { height: 52, backgroundColor: COLORS.amber, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  confirmBtnOff: { backgroundColor: COLORS.warmBeige, borderWidth: 1, borderColor: COLORS.softGray200 },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.2 },
  confirmBtnTextOff: { color: COLORS.fg3 },
});
