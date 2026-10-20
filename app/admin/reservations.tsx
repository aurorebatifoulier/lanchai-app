import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { confirmReservationsPayment, type ReservationStatus } from '@/lib/firestore';
import { overdueSeverity, overdueChipColors } from '@/utils/overdue';
import { isPickupMissed } from '@/functions/src/shared/dates';
import DateFilterSheet from '@/components/DateFilterSheet';
import {
  DateFilterState,
  DateFieldOption,
  DEFAULT_DATE_FILTER,
  isDateFilterActive,
  getDateFieldValue,
  compareByDateField,
} from '@/lib/dateFilterConfig';

const DATE_FIELD_OPTIONS: DateFieldOption[] = [
  { id: 'pickupAt',   label: 'Pickup date' },
  { id: 'returnAt',   label: 'Expected return' },
  { id: 'returnedAt', label: 'Actual return' },
];

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<ReservationStatus, { label: string; bg: string; fg: string }> = {
  pending_payment: { label: 'Pending payment', bg: '#FEF9E5',           fg: '#92400E' },
  confirmed:       { label: 'Confirmed',       bg: '#D1FAE5',           fg: '#065F46' },
  active:          { label: 'Active',          bg: '#2E8B57',           fg: '#FFFFFF' },
  returned:        { label: 'Returned',        bg: COLORS.softGray200,  fg: COLORS.fg3 },
  cancelled:       { label: 'Cancelled',       bg: '#FEE2E2',           fg: '#B91C1C' },
  lost:            { label: 'Lost/stolen',     bg: COLORS.danger,       fg: '#FFFFFF' },
  no_show:         { label: 'No-show',         bg: '#EDE7DB',           fg: '#6B5A3A' },
};

// Alert-only badge for pending/confirmed bookings whose pick-up day is over — never a
// lock (a late pick-up still goes through), until an admin marks the no-show.
const NOT_PICKED_UP_BADGE = { label: 'Not picked up', bg: '#FDF0C4', fg: '#7A5500' };

const FILTER_OPTIONS: Array<{ key: 'all' | ReservationStatus; label: string }> = [
  { key: 'all',             label: 'All' },
  { key: 'pending_payment', label: 'Pending' },
  { key: 'confirmed',       label: 'Confirmed' },
  { key: 'active',          label: 'Active' },
  { key: 'returned',        label: 'Returned' },
  { key: 'cancelled',       label: 'Cancelled' },
  { key: 'lost',            label: 'Lost/stolen' },
  { key: 'no_show',         label: 'No-show' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReservationRow {
  id:          string;
  productName: string;
  pickupLabel: string;
  total:       number;
  status:      ReservationStatus;
  pickupAt?:   Timestamp;
  returnAt?:   Timestamp;
  returnedAt?: Timestamp;
  orderId?:    string;
  renterName?: string;
  outstandingBalance?: number;
  outstandingSettled?: boolean;
  outstandingWrittenOff?: boolean;
  chargeCurrency?:     'LAK' | 'USD' | 'THB';
}

// Bulk actions are all-or-nothing: only offered when every item in the group shares
// both the same status AND the same pickup/return dates (not guaranteed by construction —
// bag items can be dated independently before checkout).
type BulkAction =
  | { kind: 'confirm_payment' }
  | { kind: 'checklist'; checklistType: 'handover' | 'return' };

type AdminRenderEntry =
  | { type: 'single'; key: string; row: ReservationRow }
  | {
      type:       'group';
      key:        string;
      orderId:    string;
      rows:       ReservationRow[];
      renterName: string;
      bulkAction: BulkAction | null;
    };

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminReservationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rows,           setRows]           = useState<ReservationRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<'all' | ReservationStatus>('all');
  const [search,         setSearch]         = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<{ orderId: string; message: string } | null>(null);
  const [dateFilter,        setDateFilter]        = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [pendingDateFilter, setPendingDateFilter]  = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [dateSheetVisible,  setDateSheetVisible]   = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setRows(
          snap.docs.map(d => {
            const data = d.data();
            return {
              id:          d.id,
              productName: data.productName ?? '',
              pickupLabel: data.pickupLabel ?? '',
              total:       data.total ?? data.subtotal ?? 0,
              status:      (data.status ?? 'pending_payment') as ReservationStatus,
              pickupAt:    data.pickupAt ?? undefined,
              returnAt:    data.returnAt ?? undefined,
              returnedAt:  data.returnedAt ?? undefined,
              orderId:     data.orderId ?? undefined,
              renterName:  data.renterName ?? undefined,
              outstandingBalance: data.outstandingBalance ?? undefined,
              outstandingSettled: data.outstandingSettled ?? undefined,
              outstandingWrittenOff: data.outstandingWrittenOff ?? undefined,
              chargeCurrency:     data.chargeCurrency ?? undefined,
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const toggleGroup = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleConfirmPaymentForAll = async (orderId: string, ids: string[]) => {
    setBulkConfirming(orderId);
    setBulkError(null);
    try {
      await confirmReservationsPayment(ids);
      setConfirmingOrderId(null);
    } catch {
      setBulkError({ orderId, message: 'Failed to confirm payment. Please try again.' });
    } finally {
      setBulkConfirming(null);
    }
  };

  const handleStartChecklistChain = (checklistType: 'handover' | 'return', ids: string[]) => {
    const [firstId, ...restIds] = ids;
    router.push(`/admin/reservations/${firstId}/checklist?type=${checklistType}&queue=${restIds.join(',')}&chainIds=${ids.join(',')}`);
  };

  // ── Filter + group ────────────────────────────────────────────────────────
  const renderEntries = useMemo((): AdminRenderEntry[] => {
    let filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        (r.renterName ?? '').toLowerCase().includes(q),
      );
    }
    const grouped  = new Map<string, ReservationRow[]>();
    const singles: ReservationRow[] = [];

    filtered.forEach(row => {
      if (row.orderId) {
        const g = grouped.get(row.orderId) ?? [];
        g.push(row);
        grouped.set(row.orderId, g);
      } else {
        singles.push(row);
      }
    });

    const entries: AdminRenderEntry[] = [];
    singles.forEach(row => entries.push({ type: 'single', key: row.id, row }));
    grouped.forEach((groupRows, orderId) => {
      if (groupRows.length === 1) {
        entries.push({ type: 'single', key: groupRows[0].id, row: groupRows[0] });
      } else {
        const first = groupRows[0];
        const allSameStatus = groupRows.every(r => r.status === first.status);
        const allSameDates = groupRows.every(r =>
          r.pickupAt?.toMillis() === first.pickupAt?.toMillis() &&
          r.returnAt?.toMillis() === first.returnAt?.toMillis(),
        );
        const bulkEligible = allSameStatus && allSameDates;
        const bulkAction: BulkAction | null = !bulkEligible ? null :
          first.status === 'pending_payment' ? { kind: 'confirm_payment' } :
          first.status === 'confirmed'        ? { kind: 'checklist', checklistType: 'handover' } :
          first.status === 'active'           ? { kind: 'checklist', checklistType: 'return' } :
          null;

        entries.push({
          type:       'group',
          key:        orderId,
          orderId,
          rows:       groupRows,
          renterName: first.renterName ?? '—',
          bulkAction,
        });
      }
    });

    if (dateFilter.sortDir != null) {
      const sortDir = dateFilter.sortDir;
      // A group's representative value is the earliest (min) value among its rows for
      // the selected field — the group itself is a single sortable unit.
      const repValue = (entry: AdminRenderEntry): number | null => {
        if (entry.type === 'single') return getDateFieldValue(entry.row, dateFilter.field);
        const values = entry.rows
          .map(r => getDateFieldValue(r, dateFilter.field))
          .filter((v): v is number => v != null);
        return values.length > 0 ? Math.min(...values) : null;
      };
      entries.sort((a, b) => compareByDateField(repValue(a), repValue(b), sortDir));
    }

    return entries;
  }, [rows, filter, search, dateFilter]);

  const isEmpty = !loading && renderEntries.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Fixed top bar (header + search + chips grouped as one flex sibling) */}
      <View style={s.topBar}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Reservations</Text>
          <TouchableOpacity
            style={s.scanBtn}
            onPress={() => router.push('/admin/scan')}
            activeOpacity={0.7}
          >
            <Feather name="maximize" size={18} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>

        <View style={s.searchRow}>
          <View style={[s.searchWrap, { flex: 1 }]}>
            <Feather name="search" size={14} color={COLORS.fg3} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by product or renter…"
              placeholderTextColor={COLORS.fg3}
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity
            style={[s.dateFilterBtn, isDateFilterActive(dateFilter) && s.dateFilterBtnActive]}
            onPress={() => { setPendingDateFilter(dateFilter); setDateSheetVisible(true); }}
            activeOpacity={0.75}
          >
            <Feather name="sliders" size={16} color={isDateFilterActive(dateFilter) ? COLORS.porcelain : COLORS.fg3} />
            {isDateFilterActive(dateFilter) && <View style={s.dateFilterDot} />}
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chipsScroll}
          contentContainerStyle={s.filterRow}
        >
          {FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.filterChip, filter === opt.key && s.filterChipActive]}
              onPress={() => { setFilter(opt.key); setSearch(''); }}
              activeOpacity={0.75}
            >
              <Text style={[s.filterChipText, filter === opt.key && s.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List / empty / loading ──────────────────────────────────────── */}
      <ScrollView
        style={s.list}
        contentContainerStyle={[
          s.listContent,
          (loading || isEmpty) && s.listContentCenter,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : isEmpty ? (
          <>
            <View style={s.emptyIconBox}>
              <Feather name="calendar" size={32} color={COLORS.fg3} />
            </View>
            <Text style={s.emptyTitle}>
              {search.trim()
                ? 'No reservations match your search.'
                : filter === 'all'
                ? 'No reservations yet.'
                : `No ${STATUS_CONFIG[filter as ReservationStatus]?.label.toLowerCase() ?? filter} reservations.`}
            </Text>
          </>
        ) : (
          renderEntries.map((entry, index) => {
            if (entry.type === 'group') {
              const expanded = expandedOrders.has(entry.orderId);
              const groupTotal = entry.rows.reduce((s, r) => s + r.total, 0);
              return (
                <React.Fragment key={entry.key}>
                  {index > 0 && <View style={s.sep} />}
                  {/* Group header + bulk action share one continuous beige backdrop so
                      the amber button's own margins don't reveal the page background */}
                  <View style={s.groupCard}>
                    <TouchableOpacity
                      style={s.groupHeader}
                      onPress={() => toggleGroup(entry.orderId)}
                      activeOpacity={0.75}
                    >
                      <View style={s.rowMain}>
                        <Text style={s.rowName} numberOfLines={1}>
                          Order · {entry.rows.length} items
                        </Text>
                        <Text style={s.rowPickup} numberOfLines={1}>
                          Renter: {entry.renterName}
                        </Text>
                        <Text style={s.rowPrice}>
                          {groupTotal.toLocaleString('en-US')} LAK total
                        </Text>
                      </View>
                      <Feather
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color={COLORS.fg3}
                      />
                    </TouchableOpacity>

                    {/* Bulk action — only when every item shares status AND dates */}
                    {entry.bulkAction && (
                      confirmingOrderId === entry.orderId ? (
                        <View style={s.bulkConfirmRow}>
                          <Text style={s.bulkConfirmText}>
                            Confirm payment for all {entry.rows.length} items?
                          </Text>
                          <View style={s.bulkConfirmBtnRow}>
                            <TouchableOpacity
                              style={s.bulkCancelBtn}
                              onPress={() => setConfirmingOrderId(null)}
                              activeOpacity={0.75}
                            >
                              <Text style={s.bulkCancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.bulkConfirmBtn}
                              onPress={() => handleConfirmPaymentForAll(entry.orderId, entry.rows.map(r => r.id))}
                              disabled={bulkConfirming === entry.orderId}
                              activeOpacity={0.85}
                            >
                              {bulkConfirming === entry.orderId
                                ? <ActivityIndicator color={COLORS.carbon} size="small" />
                                : <Text style={s.bulkConfirmBtnText}>Confirm payment</Text>}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={s.bulkActionBtn}
                          onPress={() =>
                            entry.bulkAction!.kind === 'confirm_payment'
                              ? setConfirmingOrderId(entry.orderId)
                              : handleStartChecklistChain(entry.bulkAction!.checklistType, entry.rows.map(r => r.id))
                          }
                          activeOpacity={0.85}
                        >
                          <Text style={s.bulkActionBtnText}>
                            {entry.bulkAction.kind === 'confirm_payment'
                              ? 'Confirm payment for all'
                              : entry.bulkAction.checklistType === 'handover'
                              ? 'Mark all as picked up'
                              : 'Mark all as returned'}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                    {bulkError?.orderId === entry.orderId && (
                      <Text style={s.bulkErrorText}>{bulkError.message}</Text>
                    )}
                  </View>

                  {/* Expanded items */}
                  {expanded && entry.rows.map((row, ri) => {
                    const isOverdue = row.status === 'active' && row.returnAt != null && row.returnAt.toMillis() < Date.now();
                    const isMissed = (row.status === 'pending_payment' || row.status === 'confirmed')
                      && row.pickupAt != null && isPickupMissed(row.pickupAt.toMillis());
                    const badge = isMissed ? NOT_PICKED_UP_BADGE : isOverdue
                      ? (() => {
                          const sev = overdueSeverity(row.returnAt!);
                          return {
                            label: 'Overdue',
                            bg: overdueChipColors(sev).bg,
                            fg: overdueChipColors(sev).fg,
                          };
                        })()
                      : STATUS_CONFIG[row.status] ?? STATUS_CONFIG.pending_payment;
                    return (
                      <React.Fragment key={row.id}>
                        <View style={s.groupItemSep} />
                        <TouchableOpacity
                          style={[s.groupItemRow, isOverdue && { backgroundColor: '#FFF1F2' }]}
                          onPress={() => router.push(`/admin/reservations/${row.id}`)}
                          activeOpacity={0.75}
                        >
                          <View style={s.rowMain}>
                            <Text style={s.groupItemName} numberOfLines={1}>{row.productName}</Text>
                            <Text style={s.rowPickup} numberOfLines={1}>
                              Pickup: {row.pickupLabel}
                            </Text>
                            <Text style={s.rowPrice}>
                              {row.total.toLocaleString('en-US')} LAK
                            </Text>
                          </View>
                          <View style={[s.statusChip, { backgroundColor: badge.bg }]}>
                            <Text style={[s.statusChipText, { color: badge.fg }]}>{badge.label}</Text>
                          </View>
                          {!!row.outstandingBalance && !row.outstandingSettled && !row.outstandingWrittenOff && (
                            <View style={s.outstandingChip}>
                              <Text style={s.outstandingChipText}>
                                Outstanding: {row.outstandingBalance.toLocaleString('en-US')} {row.chargeCurrency}
                              </Text>
                            </View>
                          )}
                          <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            }

            // Single row
            const isOverdue = entry.row.status === 'active' && entry.row.returnAt != null && entry.row.returnAt.toMillis() < Date.now();
            const isMissed = (entry.row.status === 'pending_payment' || entry.row.status === 'confirmed')
              && entry.row.pickupAt != null && isPickupMissed(entry.row.pickupAt.toMillis());
            const badge = isMissed ? NOT_PICKED_UP_BADGE : isOverdue
              ? (() => {
                  const sev = overdueSeverity(entry.row.returnAt!);
                  return {
                    label: 'Overdue',
                    bg: overdueChipColors(sev).bg,
                    fg: overdueChipColors(sev).fg,
                  };
                })()
              : STATUS_CONFIG[entry.row.status] ?? STATUS_CONFIG.pending_payment;
            return (
              <React.Fragment key={entry.key}>
                {index > 0 && <View style={s.sep} />}
                <TouchableOpacity
                  style={[s.row, isOverdue && { backgroundColor: '#FFF1F2' }]}
                  onPress={() => router.push(`/admin/reservations/${entry.row.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowMain}>
                    <Text style={s.rowName} numberOfLines={1}>{entry.row.productName}</Text>
                    <Text style={s.rowPickup} numberOfLines={1}>
                      Pickup: {entry.row.pickupLabel}
                    </Text>
                    <Text style={s.rowPrice}>
                      {entry.row.total.toLocaleString('en-US')} LAK
                    </Text>
                  </View>
                  <View style={[s.statusChip, { backgroundColor: badge.bg }]}>
                    <Text style={[s.statusChipText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                  {!!entry.row.outstandingBalance && !entry.row.outstandingSettled && !entry.row.outstandingWrittenOff && (
                    <View style={s.outstandingChip}>
                      <Text style={s.outstandingChipText}>
                        Outstanding: {entry.row.outstandingBalance.toLocaleString('en-US')} {entry.row.chargeCurrency}
                      </Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      <DateFilterSheet
        visible={dateSheetVisible}
        title="Sort & filter by date"
        fieldOptions={DATE_FIELD_OPTIONS}
        pending={pendingDateFilter}
        onChange={setPendingDateFilter}
        onClose={() => setDateSheetVisible(false)}
        onApply={() => { setDateFilter(pendingDateFilter); setDateSheetVisible(false); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.porcelain },
  topBar: { flexShrink: 0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  scanBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0,
    textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginVertical: 12,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, height: 44,
    backgroundColor: COLORS.white,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.softGray200,
  },
  dateFilterBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  dateFilterBtnActive: {
    backgroundColor: COLORS.carbon, borderColor: COLORS.carbon,
  },
  dateFilterDot: {
    position: 'absolute', top: 7, right: 7,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.amber,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.carbon },

  chipsScroll: { height: 42, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    height: 32, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  filterChipActive:     { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  filterChipTextActive: { color: COLORS.porcelain },

  list:              { flex: 1 },
  listContent:       { paddingTop: 4 },
  listContentCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 0 },

  // Single row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  rowMain: { flex: 1, gap: 3 },
  rowName:   { fontSize: 14, fontWeight: '700', color: COLORS.carbon, letterSpacing: -0.1 },
  rowPickup: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  rowPrice:  { fontSize: 13, fontWeight: '600', color: COLORS.fg2, marginTop: 1 },
  sep: { height: 1, backgroundColor: COLORS.softGray200, marginLeft: 20 },

  // Continuous beige backdrop behind the group header + bulk action row, so the amber
  // button's own margins reveal this same beige instead of the page background.
  groupCard: {
    backgroundColor: COLORS.warmBeige,
  },

  // Group header row
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 20,
  },

  // Group expanded item row
  groupItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  groupItemSep: {
    height: 1, backgroundColor: COLORS.softGray200, marginLeft: 28,
  },
  groupItemName: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },

  statusChip: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  outstandingChip: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4,
    backgroundColor: COLORS.danger,
  },
  outstandingChipText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  // Bulk action row (under group header)
  bulkActionBtn: {
    marginHorizontal: 20, marginTop: 10, marginBottom: 10,
    height: 44, borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  bulkActionBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
  bulkConfirmRow: {
    marginHorizontal: 20, marginTop: -4, marginBottom: 10,
    padding: 12, borderRadius: 10, gap: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
  },
  bulkConfirmText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  bulkConfirmBtnRow: { flexDirection: 'row', gap: 8 },
  bulkCancelBtn: {
    flex: 1, height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
  },
  bulkCancelBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  bulkConfirmBtn: {
    flex: 1, height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.amber,
  },
  bulkConfirmBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
  bulkErrorText: {
    marginHorizontal: 20, marginTop: -4, marginBottom: 10,
    fontSize: 12, fontWeight: '600', color: COLORS.danger,
  },

  emptyIconBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.carbon,
    textAlign: 'center', letterSpacing: -0.2,
  },
});
