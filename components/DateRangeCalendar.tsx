import React, { useState, useEffect, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/AppText';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { getAvailableTimeSlots } from '@/utils/timeSlots';
import { vteToday } from '@/lib/vteTime';
import {
  fetchOccupancy,
  computeMonthAvailability,
  localDateKey,
  type OccupancyRecord,
} from '@/utils/availability';
import {
  buildCalendarDays,
  chunkIntoWeeks,
  sameDay,
  startOfDay,
  type CalDay,
} from '@/utils/calendarGrid';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ── Component ───────────────────────────────────────────────────────────────

/** A pack item: the day is free only if this product has `qty` units free (whole day). */
export interface PackCalendarItem { productId: string; totalStock: number; qty: number }

export interface DateRangeCalendarProps {
  /** '' = no product (pack dates — see packItems). */
  productId: string;
  /** Pack mode: a day is unavailable as soon as ONE item hasn't its full quantity free
   *  (same occupancy + computeMonthAvailability as the product calendar); a range can't
   *  span such a day. */
  packItems?: PackCalendarItem[];
  totalStock: number;
  startDate: Date | null;
  endDate: Date | null;
  /** Tap 1 sets start; tap 2 (after start, no end yet) sets end; a tap once a full
   * range exists starts a new selection (matches start=null, end=null → new start). */
  onChangeRange: (start: Date | null, end: Date | null) => void;
  /** Defaults to today at local midnight. */
  minDate?: Date;
  /** Shop pickup/return slots (getShopTimeSlots) — used to dim today once no slot is left. */
  timeSlots: string[];
}

export default function DateRangeCalendar({
  productId,
  packItems,
  totalStock,
  startDate,
  endDate,
  onChangeRange,
  minDate,
  timeSlots,
}: DateRangeCalendarProps) {
  // Today = the VIENTIANE day (a day token), whatever the phone's timezone.
  const today = useMemo(() => startOfDay(minDate ?? vteToday()), [minDate]);

  const [calYear,  setCalYear]  = useState(() => (startDate ?? today).getFullYear());
  const [calMonth, setCalMonth] = useState(() => (startDate ?? today).getMonth());

  const [occupancy, setOccupancy]         = useState<OccupancyRecord[] | null>(null);
  const [packOcc, setPackOcc]             = useState<OccupancyRecord[][] | null>(null);
  const packKey = (packItems ?? []).map(i => `${i.productId}:${i.qty}:${i.totalStock}`).join('|');
  const [loadingAvail, setLoadingAvail]   = useState(true);
  const [availError, setAvailError]       = useState(false);

  // Fetched once per product — month navigation below re-derives the per-day map from
  // this same in-memory data via computeMonthAvailability, no re-fetch per month.
  useEffect(() => {
    let cancelled = false;
    // Pack: every item's occupancy (same fetch as a product), combined per day below.
    if (packItems && packItems.length > 0) {
      setLoadingAvail(true);
      setAvailError(false);
      Promise.all(packItems.map(i => fetchOccupancy(i.productId).catch(() => { if (!cancelled) setAvailError(true); return [] as OccupancyRecord[]; })))
        .then(list => { if (!cancelled) setPackOcc(list); })
        .finally(() => { if (!cancelled) setLoadingAvail(false); });
      return () => { cancelled = true; };
    }
    // No product and no pack items: plain calendar, no per-day marks.
    if (!productId) { setOccupancy(null); setLoadingAvail(false); setAvailError(false); return; }
    setLoadingAvail(true);
    setAvailError(false);
    fetchOccupancy(productId)
      .then(records => { if (!cancelled) setOccupancy(records); })
      .catch(() => {
        // Conservative, non-blocking fallback: treat as "nothing known to be booked"
        // rather than freezing the calendar — the exact-timestamp check still runs
        // again at booking-confirmation time regardless of what the calendar shows.
        if (!cancelled) { setOccupancy([]); setAvailError(true); }
      })
      .finally(() => { if (!cancelled) setLoadingAvail(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, packKey]);

  const monthAvailability = useMemo(() => {
    if (packItems && packItems.length > 0) {
      if (!packOcc) return {};
      // Packs of the full quantity free that day = the smallest over the items.
      const maps = packItems.map((it, i) => computeMonthAvailability(packOcc[i] ?? [], calYear, calMonth, it.totalStock));
      const out: Record<string, number> = {};
      for (const key of Object.keys(maps[0] ?? {})) {
        out[key] = Math.min(...packItems.map((it, i) => Math.floor((maps[i][key] ?? 0) / Math.max(1, it.qty))));
      }
      return out;
    }
    if (!occupancy) return {};
    return computeMonthAvailability(occupancy, calYear, calMonth, totalStock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancy, packOcc, packKey, calYear, calMonth, totalStock]);

  // Pack mode: is there a fully booked day strictly between a and b? (a < b)
  const blockedBetween = (a: Date, b: Date): boolean => {
    if (!packItems?.length || !packOcc) return false;
    const months = new Map<string, Record<string, number>[]>(); // per month, per item
    const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1);
    while (d < b) {
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (!months.has(mk)) {
        months.set(mk, packItems.map((it, i) => computeMonthAvailability(packOcc[i] ?? [], d.getFullYear(), d.getMonth(), it.totalStock)));
      }
      const key = localDateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (packItems.some((it, i) => (months.get(mk)![i][key] ?? 0) < it.qty)) return true;
      d.setDate(d.getDate() + 1);
    }
    return false;
  };

  const weeks = useMemo(() => chunkIntoWeeks(buildCalendarDays(calYear, calMonth)), [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const handleDayPress = (day: CalDay) => {
    const noSelectionOrComplete = !startDate || (startDate && endDate);
    if (noSelectionOrComplete) {
      onChangeRange(day.date, null);
    } else if (day.date < startDate!) {
      onChangeRange(day.date, null);
    } else if (sameDay(day.date, startDate!)) {
      onChangeRange(day.date, null);
    } else if (blockedBetween(startDate!, day.date)) {
      // A pack range can't span a day where an item isn't free: start over from here.
      onChangeRange(day.date, null);
    } else {
      onChangeRange(startDate, day.date);
    }
  };

  return (
    <View>
      <View style={s.calNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" style={s.calNavBtn} onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-left" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
        <Text style={s.calMonthTitle}>{MONTHS[calMonth]} {calYear}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" style={s.calNavBtn} onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-right" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
      </View>

      <View style={s.calDowRow}>
        {DOW.map((d, i) => (
          <View key={i} style={s.calDow}>
            <Text style={s.calDowText}>{d}</Text>
          </View>
        ))}
      </View>

      {loadingAvail ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 24 }} />
      ) : (
        weeks.map((week, wi) => (
          <View key={wi} style={s.calRow}>
            {week.map((day, di) => {
              const dateKey    = !day.muted ? localDateKey(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()) : null;
              const availToday = dateKey ? monthAvailability[dateKey] : undefined;
              const isPast          = !day.muted && day.date < today;
              const isTodayNoSlots  = !day.muted && sameDay(day.date, today) && getAvailableTimeSlots(day.date, timeSlots).length === 0;
              // Fully booked only applies to today/future — a past day that also happens to
              // be fully booked still reads as "past" (dimmed), not "taken" (grey fill), since
              // the reason it's unselectable is that it's out of scope, not that it's occupied.
              const isFullyBooked   = !day.muted && !isPast && availToday === 0;
              // Muted (adjacent-month) days, past days, and today-with-no-slots-left all share
              // the same "temporally out of scope" dimmed treatment — distinct from the grey
              // fill used for fully-booked days, which are otherwise selectable in principle.
              const isDimmed = !!day.muted || isPast || isTodayNoSlots;
              const disabled = isDimmed || isFullyBooked;

              const isStart   = !!(startDate && !day.muted && sameDay(day.date, startDate));
              const isEnd     = !!(endDate && !day.muted && sameDay(day.date, endDate));
              const isInRange = !!(startDate && endDate && !day.muted && day.date > startDate && day.date < endDate);
              const isEndpoint = isStart || isEnd;

              return (
                <View key={di} style={s.calCellWrap}>
                  {(isEndpoint || isInRange) && (
                    <View
                      style={[
                        s.rangeBar,
                        isStart && !isEnd && s.rangeBarFromStart,
                        isEnd && !isStart && s.rangeBarToEnd,
                      ]}
                    />
                  )}
                  <TouchableOpacity
                    style={[
                      s.calCell,
                      isDimmed && s.calCellDisabled,
                      isFullyBooked && s.calCellUnavailable,
                      isEndpoint && s.calCellEndpoint,
                    ]}
                    onPress={() => handleDayPress(day)}
                    disabled={disabled}
                    activeOpacity={disabled ? 1 : 0.7}
                  >
                    <Text style={[
                      s.calCellText,
                      isDimmed && s.calCellTextDisabled,
                      isFullyBooked && s.calCellTextUnavailable,
                      isEndpoint && s.calCellTextEndpoint,
                    ]}>
                      {day.d}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))
      )}

      {availError && (
        <View style={s.availErrorNote}>
          <Feather name="alert-circle" size={12} color={SHADES.carbonMuted} />
          <Text style={s.availErrorNoteText}>
            Couldn&apos;t load availability — dates will be verified when you continue.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: SHADES.carbonLight,
    borderWidth: 1,
    borderColor: SHADES.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },

  calDowRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calDow: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 6,
  },
  calDowText: {
    fontSize: 10,
    fontWeight: '700',
    color: SHADES.carbonFaint,
    letterSpacing: 0.5,
  },

  calRow: {
    flexDirection: 'row',
  },
  calCellWrap: {
    flex: 1,
    aspectRatio: 1,
    position: 'relative',
  },
  rangeBar: {
    position: 'absolute',
    top: '15%',
    bottom: '15%',
    left: 0,
    right: 0,
    backgroundColor: SHADES.amberLight,
  },
  rangeBarFromStart: {
    left: '50%',
  },
  rangeBarToEnd: {
    right: '50%',
  },
  calCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calCellDisabled: {
    opacity: 0.3,
  },
  calCellUnavailable: {
    backgroundColor: SHADES.border,
  },
  calCellEndpoint: {
    backgroundColor: COLORS.amber,
    borderRadius: 10,
  },
  calCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  calCellTextDisabled: {
    color: SHADES.carbonFaint,
  },
  calCellTextUnavailable: {
    color: SHADES.carbonMuted,
  },
  calCellTextEndpoint: {
    color: COLORS.carbon,
    fontWeight: '800',
  },

  availErrorNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  availErrorNoteText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: SHADES.carbonMuted,
  },
});
