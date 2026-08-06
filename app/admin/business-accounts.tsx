import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';

// ── Status config ─────────────────────────────────────────────────────────────

type BtobStatus = 'pending_approval' | 'approved' | 'rejected';

export const BTOB_STATUS_CONFIG: Record<BtobStatus, { label: string; bg: string; fg: string }> = {
  pending_approval: { label: 'Pending',  bg: '#FEF9E5', fg: '#92400E' },
  approved:         { label: 'Approved', bg: '#D1FAE5', fg: '#065F46' },
  rejected:         { label: 'Rejected', bg: '#FEE2E2', fg: '#B91C1C' },
};

const FILTER_OPTIONS: Array<{ key: 'all' | BtobStatus; label: string }> = [
  { key: 'all',               label: 'All' },
  { key: 'pending_approval',  label: 'Pending' },
  { key: 'approved',          label: 'Approved' },
  { key: 'rejected',          label: 'Rejected' },
];

interface BusinessAccountRow {
  id: string;
  btobCompanyName?: string;
  btobResponsibleName?: string;
  btobStatus?: BtobStatus;
  btobSubmittedAt?: Timestamp;
}

function fmtDate(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminBusinessAccountsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rows, setRows] = useState<BusinessAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BtobStatus>('all');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('accountType', '==', 'btob'));
    return onSnapshot(
      q,
      snap => {
        setRows(
          snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              btobCompanyName:     data.btobCompanyName ?? undefined,
              btobResponsibleName: data.btobResponsibleName ?? undefined,
              btobStatus:          data.btobStatus ?? undefined,
              btobSubmittedAt:     data.btobSubmittedAt ?? undefined,
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filteredRows = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter(r => r.btobStatus === filter);
    return [...filtered].sort((a, b) => (b.btobSubmittedAt?.toMillis() ?? 0) - (a.btobSubmittedAt?.toMillis() ?? 0));
  }, [rows, filter]);

  const isEmpty = !loading && filteredRows.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.topBar}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Business accounts</Text>
          <View style={{ width: 40 }} />
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
              onPress={() => setFilter(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.filterChipText, filter === opt.key && s.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={s.list}
        contentContainerStyle={[s.listContent, (loading || isEmpty) && s.listContentCenter]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : isEmpty ? (
          <>
            <View style={s.emptyIconBox}>
              <Feather name="briefcase" size={32} color={COLORS.fg3} />
            </View>
            <Text style={s.emptyTitle}>
              {filter === 'all'
                ? 'No business accounts yet.'
                : `No ${BTOB_STATUS_CONFIG[filter as BtobStatus]?.label.toLowerCase() ?? filter} accounts.`}
            </Text>
          </>
        ) : (
          filteredRows.map((row, index) => {
            const badge = row.btobStatus ? BTOB_STATUS_CONFIG[row.btobStatus] : BTOB_STATUS_CONFIG.pending_approval;
            return (
              <React.Fragment key={row.id}>
                {index > 0 && <View style={s.sep} />}
                <TouchableOpacity
                  style={s.row}
                  onPress={() => router.push(`/admin/business-accounts/${row.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowMain}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {row.btobCompanyName || '(No company name)'}
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {row.btobResponsibleName ?? '—'}
                    </Text>
                    <Text style={s.rowDate}>Submitted {fmtDate(row.btobSubmittedAt)}</Text>
                  </View>
                  <View style={[s.statusChip, { backgroundColor: badge.bg }]}>
                    <Text style={[s.statusChipText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  topBar: { flexShrink: 0 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },

  chipsScroll: { height: 42, flexShrink: 0 },
  filterRow: { paddingHorizontal: 20, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    height: 32, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  filterChipActive:     { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  filterChipTextActive: { color: COLORS.porcelain },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  listContentCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyIconBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.fg3, textAlign: 'center' },

  sep: { height: 1, backgroundColor: COLORS.softGray200 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  rowSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg2 },
  rowDate: { fontSize: 11, fontWeight: '400', color: COLORS.fg3, marginTop: 2 },
  statusChip: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
});
