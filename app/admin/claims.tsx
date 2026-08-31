import React, { useState, useEffect } from 'react';
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
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { toClaimDoc, type ClaimDoc, type ClaimType, type ClaimStatus } from '@/lib/claims';

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  damage_not_caused: "Damage not caused",
  missing_accessory: 'Missing accessory',
  not_as_described:  'Not as described',
  other:             'Other',
};

export const CLAIM_STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; fg: string }> = {
  open:      { label: 'Open',      bg: '#FEF9E5',          fg: '#92400E' },
  in_review: { label: 'In review', bg: 'rgba(37,115,181,0.1)', fg: COLORS.pending },
  resolved:  { label: 'Resolved',  bg: 'rgba(46,139,87,0.1)',  fg: COLORS.success },
  rejected:  { label: 'Rejected',  bg: COLORS.softGray200,     fg: COLORS.fg3 },
};

const FILTER_OPTIONS: Array<{ key: 'all' | ClaimStatus; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'in_review', label: 'In review' },
  { key: 'resolved',  label: 'Resolved' },
  { key: 'rejected',  label: 'Rejected' },
];

export default function AdminClaimsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [claims,  setClaims]  = useState<ClaimDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | ClaimStatus>('all');

  useEffect(() => {
    const q = query(collection(db, 'claims'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setClaims(snap.docs.map(d => toClaimDoc(d.id, d.data())));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filtered = filter === 'all' ? claims : claims.filter(c => c.status === filter);
  const isEmpty = !loading && filtered.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Fixed top bar (header + filter chips grouped as one flex sibling) — required
          on Android/new-arch so the list below doesn't start mid-screen. ── */}
      <View style={s.topBar}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Claims</Text>
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
              <Feather name="flag" size={32} color={COLORS.fg3} />
            </View>
            <Text style={s.emptyTitle}>
              {filter === 'all' ? 'No claims yet.' : `No ${CLAIM_STATUS_CONFIG[filter as ClaimStatus]?.label.toLowerCase() ?? filter} claims.`}
            </Text>
          </>
        ) : (
          filtered.map((claim, index) => {
            const badge = CLAIM_STATUS_CONFIG[claim.status];
            return (
              <React.Fragment key={claim.id}>
                {index > 0 && <View style={s.sep} />}
                <TouchableOpacity
                  style={s.row}
                  onPress={() => router.push(`/admin/claims/${claim.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowMain}>
                    <Text style={s.rowType} numberOfLines={1}>{CLAIM_TYPE_LABELS[claim.type]}</Text>
                    <Text style={s.rowDescription} numberOfLines={1}>{claim.description}</Text>
                    <Text style={s.rowMeta} numberOfLines={1}>Reservation: {claim.reservationId}</Text>
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
  headerTitle: {
    position: 'absolute', left: 0, right: 0,
    textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  chipsScroll: { height: 58, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
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

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  rowMain: { flex: 1, gap: 3 },
  rowType:        { fontSize: 14, fontWeight: '700', color: COLORS.carbon, letterSpacing: -0.1 },
  rowDescription: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  rowMeta:        { fontSize: 11, fontWeight: '500', color: COLORS.fg3, marginTop: 1 },
  sep: { height: 1, backgroundColor: COLORS.softGray200, marginLeft: 20 },

  statusChip: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },

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
