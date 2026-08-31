import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { getProduct, releaseReservation } from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import {
  effectiveStock,
  computeMonthAvailability,
  getOverlappingOccupancy,
  localDateKey,
  OCCUPYING_STATUSES,
  type OccupancyRecord,
} from '@/utils/availability';
import { buildCalendarDays, chunkIntoWeeks, sameDay, startOfDay, type CalDay } from '@/utils/calendarGrid';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Admins already have full `reservations` read access (isOwner()||isAdmin()) — no PII
// reason to round-trip through the stripped reservationOccupancy mirror here, unlike
// the renter-facing calendar. Querying directly gives renter name inline for free.
interface ProductReservation extends OccupancyRecord {
  renterName: string;
}

export default function AdminInventoryProductScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<ProductReservation[]>([]);

  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [releaseTarget,    setReleaseTarget]    = useState<ProductReservation | null>(null);
  const [releaseStaffName, setReleaseStaffName] = useState('');
  const [releasing,        setReleasing]        = useState(false);
  const [releaseError,     setReleaseError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProduct(id).then(p => { setProduct(p); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  // Live — a release fired from this same screen should disappear from the calendar
  // immediately without a manual refresh.
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      query(
        collection(db, 'reservations'),
        where('productId', '==', id),
        where('status', 'in', OCCUPYING_STATUSES),
      ),
      snap => {
        setReservations(snap.docs.map(d => {
          const data = d.data();
          const pickupAt: Timestamp | undefined = data.pickupAt;
          const returnAt: Timestamp | undefined = data.returnAt;
          return {
            reservationId: d.id,
            pickupAt: pickupAt?.toMillis() ?? 0,
            returnAt: returnAt?.toMillis() ?? 0,
            quantity: data.quantity ?? 0,
            renterName: data.renterName ?? 'Renter',
          };
        }));
      },
    );
  }, [id]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const monthAvailability = useMemo(() => {
    if (!product) return {};
    return computeMonthAvailability(reservations, calYear, calMonth, effectiveStock(product));
  }, [reservations, calYear, calMonth, product]);

  const weeks = useMemo(() => chunkIntoWeeks(buildCalendarDays(calYear, calMonth)), [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  // Unlike the renter booking calendar, every real day is tappable here — including
  // past and fully-booked ones — since the point is to INSPECT bookings, not select a
  // range to reserve. Only muted (adjacent-month) cells are inert.
  const handleDayPress = (day: CalDay) => {
    if (day.muted) return;
    setSelectedDay(day.date);
  };

  const dayReservations = useMemo(() => {
    if (!selectedDay) return [];
    const dayStart = startOfDay(selectedDay);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return getOverlappingOccupancy(reservations, dayStart, dayEnd);
  }, [selectedDay, reservations]);

  const handleRelease = useCallback(async () => {
    if (!releaseTarget || releasing || releaseStaffName.trim().length === 0) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      await releaseReservation(releaseTarget.reservationId, releaseStaffName.trim());
      setReleaseTarget(null);
      setReleaseStaffName('');
    } catch {
      setReleaseError('Failed to release. Please try again.');
    } finally {
      setReleasing(false);
    }
  }, [releaseTarget, releasing, releaseStaffName]);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} title="Loading…" />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} title="Not found" />
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={s.errorText}>Product not found.</Text>
        </View>
      </View>
    );
  }

  const eff = effectiveStock(product);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} title={product.name} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.statsRow}>
          <StatChip label="Stock" value={product.stockLeft} />
          <StatChip label="Bookable" value={eff} />
          <StatChip label="In repair" value={product.inRepairUnits ?? 0} />
          <StatChip label="Lost" value={product.lostUnits ?? 0} />
        </View>

        <TouchableOpacity
          style={s.editLink}
          onPress={() => router.push(`/admin/product-form?id=${product.id}`)}
          activeOpacity={0.75}
        >
          <Feather name="edit-2" size={13} color={COLORS.fg2} />
          <Text style={s.editLinkText}>Edit product / adjust stock condition</Text>
        </TouchableOpacity>

        {/* ── Calendar ── */}
        <View style={s.calNav}>
          <TouchableOpacity style={s.calNavBtn} onPress={prevMonth}>
            <Feather name="chevron-left" size={18} color={COLORS.carbon} />
          </TouchableOpacity>
          <Text style={s.calMonthTitle}>{MONTHS[calMonth]} {calYear}</Text>
          <TouchableOpacity style={s.calNavBtn} onPress={nextMonth}>
            <Feather name="chevron-right" size={18} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>
        <View style={s.calDowRow}>
          {DOW.map((d, i) => (
            <View key={i} style={s.calDow}><Text style={s.calDowText}>{d}</Text></View>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.calRow}>
            {week.map((day, di) => {
              const dateKey = !day.muted
                ? localDateKey(day.date.getFullYear(), day.date.getMonth(), day.date.getDate())
                : null;
              const availToday = dateKey ? monthAvailability[dateKey] : undefined;
              const isBooked   = !day.muted && availToday !== undefined && availToday < eff;
              const isPast     = !day.muted && day.date < today;
              const isSelected = !!(selectedDay && !day.muted && sameDay(day.date, selectedDay));
              return (
                <TouchableOpacity
                  key={di}
                  style={[
                    s.calCell,
                    day.muted && s.calCellMuted,
                    isBooked && s.calCellBooked,
                    isSelected && s.calCellSelected,
                  ]}
                  onPress={() => handleDayPress(day)}
                  disabled={day.muted}
                  activeOpacity={day.muted ? 1 : 0.7}
                >
                  <Text style={[
                    s.calCellText,
                    day.muted && s.calCellTextMuted,
                    isPast && !isSelected && s.calCellTextPast,
                    isSelected && s.calCellTextSelected,
                  ]}>
                    {day.d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* ── Selected day's bookings ── */}
        {selectedDay && (
          <View style={s.dayPanel}>
            <Text style={s.dayPanelTitle}>
              {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            {dayReservations.length === 0 ? (
              <Text style={s.dayPanelEmpty}>Nothing booked this day.</Text>
            ) : (
              dayReservations.map(r => (
                <View key={r.reservationId} style={s.resRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resName} numberOfLines={1}>{r.renterName}</Text>
                    <Text style={s.resMeta} numberOfLines={1}>
                      {new Date(r.pickupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' → '}
                      {new Date(r.returnAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}{r.quantity} unit{r.quantity !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.smallLink}
                    onPress={() => router.push(`/admin/reservations/${r.reservationId}`)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.smallLinkText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.smallLink, s.releaseLink]}
                    onPress={() => {
                      setReleaseTarget(r);
                      setReleaseStaffName('');
                      setReleaseError(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.smallLinkText, s.releaseLinkText]}>Release</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {releaseTarget && (
          <View style={{ marginTop: 12 }}>
            <ConfirmBox
              text={`Force-release ${releaseTarget.renterName}'s reservation? This clears the date block so the item becomes bookable again. It doesn't resolve any deposit or charges — use "Mark as returned" or "Report lost/stolen" on the reservation itself for a normal resolution.`}
              confirmLabel={releasing ? 'Releasing…' : 'Release'}
              confirmDisabled={releaseStaffName.trim().length === 0 || releasing}
              onCancel={() => setReleaseTarget(null)}
              onConfirm={handleRelease}
              destructive
            >
              <TextInput
                style={s.staffInput}
                value={releaseStaffName}
                onChangeText={setReleaseStaffName}
                placeholder="Staff member name"
                placeholderTextColor={COLORS.fg3}
              />
              {releaseError && <Text style={s.releaseErrorText}>{releaseError}</Text>}
            </ConfirmBox>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.statChip}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
    backgroundColor: COLORS.porcelain,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { fontSize: 14, fontWeight: '600', color: COLORS.fg3 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statChip: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.fg3 },

  editLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginBottom: 20,
  },
  editLinkText: { fontSize: 12, fontWeight: '600', color: COLORS.fg2 },

  calNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  calNavBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  calMonthTitle: { fontSize: 16, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.2 },

  calDowRow: { flexDirection: 'row', marginBottom: 4 },
  calDow: { flex: 1, alignItems: 'center', paddingBottom: 6 },
  calDowText: {
    fontSize: 10, fontWeight: '700', color: COLORS.softGray,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  calRow: { flexDirection: 'row' },
  calCell: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, margin: 1,
  },
  calCellMuted: { opacity: 0.25 },
  calCellBooked: { backgroundColor: COLORS.warmBeige },
  calCellSelected: { backgroundColor: COLORS.amber },
  calCellText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  calCellTextMuted: { color: COLORS.softGray },
  calCellTextPast: { color: COLORS.fg3 },
  calCellTextSelected: { color: COLORS.carbon, fontWeight: '800' },

  dayPanel: {
    marginTop: 16,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    gap: 10,
  },
  dayPanelTitle: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
  dayPanelEmpty: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },

  resRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resName: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  resMeta: { fontSize: 11, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },

  smallLink: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.warmBeige,
  },
  smallLinkText: { fontSize: 11, fontWeight: '700', color: COLORS.carbon },
  releaseLink: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  releaseLinkText: { color: COLORS.danger },

  staffInput: {
    height: 44, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    fontSize: 13, color: COLORS.carbon,
  },
  releaseErrorText: { fontSize: 11, fontWeight: '600', color: COLORS.danger },
});
