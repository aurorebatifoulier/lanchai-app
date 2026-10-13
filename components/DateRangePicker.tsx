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
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import { pad, getAvailableTimeSlots } from '@/utils/timeSlots';
import DateRangeCalendar from '@/components/DateRangeCalendar';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

type Page = 'main' | 'dates' | 'pickup-time' | 'return-time';

function buildDateTime(date: Date, timeStr: string): Date {
  const dt = new Date(date);
  const [h, m] = timeStr.split(':').map(Number);
  dt.setHours(h, m, 0, 0);
  return dt;
}

function fmtFieldDate(d: Date): string {
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${dow[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export interface DateRangePickerProps {
  visible: boolean;
  productId: string;
  totalStock: number;
  initialPickupAt?: Date | null;
  initialReturnAt?: Date | null;
  onClose: () => void;
  onConfirm: (pickupAt: Date, returnAt: Date) => void;
}

export default function DateRangePicker({
  visible,
  productId,
  totalStock,
  initialPickupAt = null,
  initialReturnAt = null,
  onClose,
  onConfirm,
}: DateRangePickerProps) {
  const insets = useSafeAreaInsets();
  const shop   = useShopInfo();
  const timeSlots = useMemo(() => getShopTimeSlots(shop), [shop]);

  const [page,       setPage]       = useState<Page>('main');
  const [startDate,  setStartDate]  = useState<Date | null>(null);
  const [endDate,    setEndDate]    = useState<Date | null>(null);
  const [pickupTime, setPickupTime] = useState<string | null>(null);
  const [returnTime, setReturnTime] = useState<string | null>(null);

  // Re-initialise from props each time the picker opens
  useEffect(() => {
    if (!visible) { setPage('main'); return; }
    if (initialPickupAt) {
      setStartDate(new Date(initialPickupAt.getFullYear(), initialPickupAt.getMonth(), initialPickupAt.getDate()));
      setPickupTime(`${pad(initialPickupAt.getHours())}:${pad(initialPickupAt.getMinutes())}`);
    } else {
      setStartDate(null); setPickupTime(null);
    }
    if (initialReturnAt) {
      setEndDate(new Date(initialReturnAt.getFullYear(), initialReturnAt.getMonth(), initialReturnAt.getDate()));
      setReturnTime(`${pad(initialReturnAt.getHours())}:${pad(initialReturnAt.getMinutes())}`);
    } else {
      setEndDate(null); setReturnTime(null);
    }
    setPage('main');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────
  const pickupDateTime = startDate && pickupTime ? buildDateTime(startDate, pickupTime) : null;
  const returnDateTime = endDate && returnTime   ? buildDateTime(endDate,   returnTime)  : null;
  const isReturnValid  = !!(pickupDateTime && returnDateTime && returnDateTime > pickupDateTime);
  const billableDays   = pickupDateTime && returnDateTime && isReturnValid
    ? Math.max(1, Math.ceil((returnDateTime.getTime() - pickupDateTime.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canConfirm = !!startDate && !!endDate && !!pickupTime && !!returnTime && isReturnValid;

  // ── Page opener ───────────────────────────────────────────────────────────
  const openDates = () => setPage('dates');

  // ── Range selection ──────────────────────────────────────────────────────
  const handleChangeRange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
    // Auto-return to the main page once a full range is picked — matches the old
    // per-field behavior of closing the sub-page as soon as a day was selected.
    if (start && end) setPage('main');
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!canConfirm || !pickupDateTime || !returnDateTime) return;
    onConfirm(pickupDateTime, returnDateTime);
  };

  // ── Sub-page: dates ────────────────────────────────────────────────────────
  const renderDatesPage = () => (
    <>
      <View style={s.subHeader}>
        <TouchableOpacity style={s.subBackBtn} onPress={() => setPage('main')}>
          <Feather name="arrow-left" size={16} color={COLORS.carbon} />
        </TouchableOpacity>
        <Text style={s.subTitle}>Select dates</Text>
        <View style={{ width: 34 }} />
      </View>
      <DateRangeCalendar
        productId={productId}
        totalStock={totalStock}
        startDate={startDate}
        endDate={endDate}
        onChangeRange={handleChangeRange}
        timeSlots={timeSlots}
      />
    </>
  );

  // ── Sub-page: time list ────────────────────────────────────────────────────
  const renderTimePage = (mode: 'pickup' | 'return') => {
    const title      = mode === 'pickup' ? 'Pick-up time' : 'Return time';
    const subtitle   = mode === 'pickup'
      ? `${shop.name} · ${shop.hours}`
      : `Same shop hours · ${shop.hours}`;
    const activeTime = mode === 'pickup' ? pickupTime : returnTime;
    const availableSlots = getAvailableTimeSlots(mode === 'pickup' ? startDate : endDate, timeSlots);
    const onSelect   = (slot: string) => {
      if (mode === 'pickup') {
        setPickupTime(slot);
        if (!returnTime) setReturnTime(slot);
      } else {
        setReturnTime(slot);
      }
      setPage('main');
    };
    return (
      <>
        <View style={s.subHeader}>
          <TouchableOpacity style={s.subBackBtn} onPress={() => setPage('main')}>
            <Feather name="arrow-left" size={16} color={COLORS.carbon} />
          </TouchableOpacity>
          <Text style={s.subTitle}>{title}</Text>
          <View style={{ width: 34 }} />
        </View>
        <Text style={s.subSubtitle}>{subtitle}</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={s.timeScroll}
          contentContainerStyle={s.timeScrollContent}
        >
          {availableSlots.map(slot => {
            const active = activeTime === slot;
            return (
              <TouchableOpacity
                key={slot}
                style={[s.timeRow, active && s.timeRowActive]}
                onPress={() => onSelect(slot)}
                activeOpacity={0.7}
              >
                <Text style={[s.timeRowText, active && s.timeRowTextActive]}>{slot}</Text>
                {active && <Feather name="check" size={16} color={COLORS.carbon} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  // ── Main page ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <>
      <View style={s.mainHeader}>
        <Text style={s.mainTitle}>
          {startDate && endDate && pickupTime && returnTime
            ? 'Edit rental dates'
            : 'Set rental dates'}
        </Text>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Feather name="x" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
      </View>

      <View style={s.fieldGrid}>
        <TouchableOpacity
          style={[s.fieldBtn, s.fieldBtnFull, !!(startDate || endDate) && s.fieldBtnFilled]}
          onPress={openDates}
          activeOpacity={0.75}
        >
          <Text style={[s.fieldEye, !!(startDate || endDate) && s.fieldEyeFilled]}>DATES</Text>
          <Text style={[s.fieldVal, !!(startDate || endDate) && s.fieldValFilled]}>
            {startDate && endDate
              ? `${fmtFieldDate(startDate)} → ${fmtFieldDate(endDate)}`
              : startDate
              ? `${fmtFieldDate(startDate)} → Select return`
              : 'Select'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.fieldBtn, !!pickupTime && s.fieldBtnFilled]}
          onPress={() => setPage('pickup-time')}
          activeOpacity={0.75}
        >
          <Text style={[s.fieldEye, !!pickupTime && s.fieldEyeFilled]}>PICK-UP TIME</Text>
          <Text style={[s.fieldVal, !!pickupTime && s.fieldValFilled]}>
            {pickupTime ?? 'Select'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.fieldBtn, !!returnTime && s.fieldBtnFilled]}
          onPress={() => setPage('return-time')}
          activeOpacity={0.75}
        >
          <Text style={[s.fieldEye, !!returnTime && s.fieldEyeFilled]}>RETURN TIME</Text>
          <Text style={[s.fieldVal, !!returnTime && s.fieldValFilled]}>
            {returnTime ?? 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      {pickupDateTime && returnDateTime && (
        isReturnValid ? (
          <View style={s.durationChip}>
            <Feather name="clock" size={13} color={COLORS.success} />
            <Text style={s.durationText}>
              {billableDays} day{billableDays !== 1 ? 's' : ''}
            </Text>
          </View>
        ) : (
          <View style={s.returnError}>
            <Feather name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={s.returnErrorText}>Return must be after pick-up</Text>
          </View>
        )
      )}

      <TouchableOpacity
        style={[s.confirmBtn, !canConfirm && s.confirmBtnOff]}
        onPress={handleConfirm}
        disabled={!canConfirm}
        activeOpacity={0.85}
      >
        <Text style={[s.confirmBtnText, !canConfirm && s.confirmBtnTextOff]}>
          {canConfirm ? 'Confirm dates' : 'Select all fields to confirm'}
        </Text>
      </TouchableOpacity>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.root}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {page === 'main'        && renderMain()}
          {page === 'dates'       && renderDatesPage()}
          {page === 'pickup-time' && renderTimePage('pickup')}
          {page === 'return-time' && renderTimePage('return')}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(30,30,30,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Main header
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sub-page header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  subSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 12,
    marginTop: -8,
  },

  // Field grid: full-width dates field + a 2-col time row
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  fieldBtn: {
    width: '48%',
    backgroundColor: COLORS.porcelain,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
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
  fieldEye: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.fg3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  fieldEyeFilled: { color: 'rgba(30,30,30,0.55)' },
  fieldVal: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg3,
  },
  fieldValFilled: { color: COLORS.carbon },

  // Duration / error inline feedback
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46,139,87,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.2)',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
  returnError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(200,65,44,0.07)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,65,44,0.18)',
  },
  returnErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },

  // Confirm button
  confirmBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmBtnOff: {
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  confirmBtnTextOff: { color: COLORS.fg3 },

  // Time list
  timeScroll:        { maxHeight: 300 },
  timeScrollContent: { gap: 4 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.porcelain,
  },
  timeRowActive:     { backgroundColor: COLORS.amber },
  timeRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  timeRowTextActive: { fontWeight: '800', color: COLORS.carbon },
});
