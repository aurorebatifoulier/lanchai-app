import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';

// ── date helpers ──────────────────────────────────────────────────────────────

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type DayFlags = { pickup: boolean; ret: boolean; overdue: boolean; task: boolean; pending: boolean };

type CellData = {
  date: Date;
  key: string;
  inMonth: boolean;
};

function buildCells(month: Date): CellData[][] {
  const firstDay = month;
  const rawDow = firstDay.getDay(); // 0=Sun,1=Mon,...
  const startOffset = rawDow === 0 ? 6 : rawDow - 1; // Monday-first
  const daysInMonth = endOfMonth(month).getDate();

  const flat: CellData[] = [];
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - i);
    flat.push({ date: d, key: toDateKey(d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), d);
    flat.push({ date, key: toDateKey(date), inMonth: true });
  }
  const remainder = flat.length % 7;
  if (remainder !== 0) {
    for (let i = 1; i <= 7 - remainder; i++) {
      const d = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, i);
      flat.push({ date: d, key: toDateKey(d), inMonth: false });
    }
  }

  const rows: CellData[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    rows.push(flat.slice(i, i + 7));
  }
  return rows;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AdminCalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAdmin, loading: authLoading, adminLoading } = useAuth();

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [dayFlags, setDayFlags] = useState<Map<string, DayFlags>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMonth = useCallback(async (month: Date) => {
    const ms = Timestamp.fromDate(startOfMonth(month));
    const me = Timestamp.fromDate(endOfMonth(month));

    const [pickupSnap, returnSnap, taskSnap] = await Promise.all([
      getDocs(query(collection(db, 'reservations'), where('pickupAt', '>=', ms), where('pickupAt', '<=', me))),
      getDocs(query(collection(db, 'reservations'), where('returnAt', '>=', ms), where('returnAt', '<=', me))),
      getDocs(query(collection(db, 'adminTasks'), where('date', '>=', ms), where('date', '<=', me))),
    ]);

    const flags = new Map<string, DayFlags>();
    const get = (k: string): DayFlags => flags.get(k) ?? { pickup: false, ret: false, overdue: false, task: false, pending: false };

    pickupSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.pickupAt as Timestamp | undefined;
      if (ts && data.status === 'confirmed') {
        const k = toDateKey(ts.toDate());
        flags.set(k, { ...get(k), pickup: true });
      }
    });
    pickupSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.pickupAt as Timestamp | undefined;
      if (ts && data.status === 'pending_payment') {
        const k = toDateKey(ts.toDate());
        flags.set(k, { ...get(k), pending: true });
      }
    });
    returnSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.returnAt as Timestamp | undefined;
      if (ts && data.status === 'active') {
        const k = toDateKey(ts.toDate());
        const isOverdue = ts.toDate().getTime() < Date.now();
        flags.set(k, { ...get(k), ...(isOverdue ? { overdue: true } : { ret: true }) });
      }
    });
    taskSnap.docs.forEach(d => {
      const ts = d.data().date as Timestamp | undefined;
      if (ts) {
        const k = toDateKey(ts.toDate());
        flags.set(k, { ...get(k), task: true });
      }
    });

    setDayFlags(flags);
  }, []);

  useEffect(() => {
    if (authLoading || adminLoading || !isAdmin) return;
    setFetchError(false);
    setLoading(true);
    fetchMonth(currentMonth)
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [authLoading, adminLoading, isAdmin, currentMonth, fetchMonth]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchError(false);
    try { await fetchMonth(currentMonth); } catch { setFetchError(true); }
    setRefreshing(false);
  }, [fetchMonth, currentMonth]);

  const todayKey = toDateKey(new Date());
  const rows = buildCells(currentMonth);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.fixedTop}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Calendar</Text>
          <View style={s.monthNav}>
            <TouchableOpacity
              style={s.navBtn}
              onPress={() => setCurrentMonth(m => addMonths(m, -1))}
              activeOpacity={0.7}
            >
              <Feather name="chevron-left" size={18} color={COLORS.carbon} />
            </TouchableOpacity>
            <Text style={s.monthLabel}>
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity
              style={s.navBtn}
              onPress={() => setCurrentMonth(m => addMonths(m, 1))}
              activeOpacity={0.7}
            >
              <Feather name="chevron-right" size={18} color={COLORS.carbon} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.weekRow}>
          {DAY_LABELS.map(l => (
            <Text key={l} style={s.weekLabel}>{l}</Text>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.gridContainer, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.amber}
            colors={[COLORS.amber]}
          />
        }
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="small" color={COLORS.amber} style={{ marginTop: 32 }} />
        ) : fetchError ? (
          <Text style={s.errorText}>Failed to load — pull to refresh</Text>
        ) : (
          <>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={s.row}>
                {row.map(cell => {
                  const flags = dayFlags.get(cell.key);
                  const isToday = cell.key === todayKey;
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[s.cell, isToday && s.cellToday]}
                      onPress={() => router.push(`/admin/calendar/${cell.key}` as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        s.cellNum,
                        !cell.inMonth && s.cellNumOff,
                        isToday && s.cellNumToday,
                      ]}>
                        {cell.date.getDate()}
                      </Text>
                      <View style={s.dots}>
                        {flags?.pickup && <View style={[s.dot, { backgroundColor: COLORS.amber }]} />}
                        {flags?.overdue && <View style={[s.dot, { backgroundColor: COLORS.danger }]} />}
                        {!flags?.overdue && flags?.ret && <View style={[s.dot, { backgroundColor: COLORS.success }]} />}
                        {flags?.pending && <View style={[s.dot, { backgroundColor: COLORS.pending }]} />}
                        {flags?.task && <View style={[s.dot, { backgroundColor: COLORS.carbon }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={[s.legend, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: COLORS.amber }]} />
          <Text style={s.legendLabel}>Pickup</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: COLORS.success }]} />
          <Text style={s.legendLabel}>Return</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: COLORS.danger }]} />
          <Text style={s.legendLabel}>Overdue</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: COLORS.pending }]} />
          <Text style={s.legendLabel}>Pending payment</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: COLORS.carbon }]} />
          <Text style={s.legendLabel}>Task</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  fixedTop: {
    flexShrink: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  monthNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    minWidth: 116,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    letterSpacing: 0.3,
  },
  gridContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 0,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    marginHorizontal: 1,
  },
  cellToday: {
    backgroundColor: COLORS.amberTint,
    borderWidth: 1.5,
    borderColor: COLORS.amber,
  },
  cellNum: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
    lineHeight: 18,
  },
  cellNumOff: {
    color: COLORS.fg3,
    fontWeight: '400',
  },
  cellNumToday: {
    color: COLORS.amberTintText,
    fontWeight: '800',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    height: 6,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    color: COLORS.fg3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: COLORS.fg3,
    fontWeight: '500',
  },
});
