import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { BTOB_STATUS_CONFIG, type BtobStatus } from '@/utils/btob';
import { ID_DOC_TYPES, idCheckNeeded } from '@/lib/identity';

// Admin → Verifications: Identity (ID documents), Residency (resident requests + legacy
// residents) and Business (the former Business accounts list, unchanged behaviour —
// detail stays at /admin/business-accounts/{uid}). Fabric rule: ONE fixed wrapper
// (header + tabs + filters) above the ScrollView.

type Tab = 'identity' | 'residency' | 'business';
const TABS: { key: Tab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'residency', label: 'Residency' },
  { key: 'business', label: 'Business' },
];

interface Row { id: string; title: string; sub: string; date?: Timestamp; badge: { label: string; bg: string; fg: string }; route: string; group: string }

const fmtDate = (ts?: Timestamp) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const B = {
  pending: { label: 'Pending', bg: '#FEF9E5', fg: '#92400E' },
  approved: { label: 'Approved', bg: '#D1FAE5', fg: '#065F46' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', fg: '#B91C1C' },
  grey: { label: '', bg: '#F0F0EF', fg: '#6B6B6B' },
  check: { label: 'Check pending', bg: '#FDF0C4', fg: '#7A5500' },
};

/** users/{uid} docs, fetched once each (names + ID check state). */
function useUsers(ids: string[]) {
  const [users, setUsers] = useState<Record<string, Record<string, unknown>>>({});
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    const missing = key ? key.split(',').filter(id => !(id in users)) : [];
    if (missing.length === 0) return;
    Promise.all(missing.map(id => getDoc(doc(db, 'users', id)).then(s => [id, s.data() ?? {}] as const).catch(() => [id, {}] as const)))
      .then(entries => setUsers(u => ({ ...u, ...Object.fromEntries(entries) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return users;
}

const nameOf = (u?: Record<string, unknown>) =>
  (u?.displayName as string) || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || '(No name)';

export default function AdminVerificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((['identity', 'residency', 'business'] as Tab[]).includes(params.tab as Tab) ? params.tab as Tab : 'residency');
  const [filter, setFilter] = useState('pending');

  const [identityDocs, setIdentityDocs] = useState<{ id: string; data: Record<string, unknown> }[] | null>(null);
  const [residencyDocs, setResidencyDocs] = useState<{ id: string; data: Record<string, unknown> }[] | null>(null);
  const [businessDocs, setBusinessDocs] = useState<{ id: string; data: Record<string, unknown> }[] | null>(null);
  const [legacyDocs, setLegacyDocs] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [legacyConfirm, setLegacyConfirm] = useState<{ uid: string; action: 'ask' | 'tourist' } | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  useEffect(() => {
    const map = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => snap.docs.map(d => ({ id: d.id, data: d.data() }));
    const u1 = onSnapshot(collection(db, 'identityChecks'), s => setIdentityDocs(map(s)), () => setIdentityDocs([]));
    const u2 = onSnapshot(collection(db, 'residencyRequests'), s => setResidencyDocs(map(s)), () => setResidencyDocs([]));
    const u3 = onSnapshot(query(collection(db, 'users'), where('accountType', '==', 'btob')), s => setBusinessDocs(map(s)), () => setBusinessDocs([]));
    // Residents set before verification existed (no residencyVerifiedAt).
    const u4 = onSnapshot(query(collection(db, 'users'), where('customerType', '==', 'resident')),
      s => setLegacyDocs(map(s).filter(d => !d.data.residencyVerifiedAt)), () => setLegacyDocs([]));
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const users = useUsers((identityDocs ?? []).map(d => d.id));

  const filters: { key: string; label: string }[] = tab === 'identity'
    ? [{ key: 'pending', label: 'Check pending' }, { key: 'rejected', label: 'Declined' }, { key: 'all', label: 'All' }]
    : tab === 'residency'
      ? [{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'all', label: 'All' }]
      : [{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'all', label: 'All' }];

  const rows: Row[] | null = useMemo(() => {
    if (tab === 'identity') {
      if (!identityDocs) return null;
      return identityDocs.map(d => {
        const u = users[d.id];
        const needs = u ? idCheckNeeded(u) : false;
        const st = d.data.status as string;
        const group = st === 'rejected' ? 'rejected' : needs ? 'pending' : 'done';
        return {
          id: d.id, group,
          title: nameOf(u),
          sub: `${ID_DOC_TYPES.find(t => t.key === d.data.docType)?.label ?? 'ID'}${d.data.source === 'counter' ? ' · taken at the shop' : ''}`,
          date: d.data.uploadedAt as Timestamp,
          badge: st === 'rejected' ? { ...B.rejected, label: 'Declined' } : needs ? B.check : { ...B.approved, label: 'Checked' },
          route: `/admin/identity/${d.id}`,
        };
      });
    }
    if (tab === 'residency') {
      if (!residencyDocs) return null;
      return residencyDocs.map(d => {
        const st = d.data.status as string;
        const badge = st === 'pending' ? B.pending : st === 'approved' ? B.approved : st === 'rejected' ? B.rejected : { ...B.grey, label: st === 'expired' ? 'Expired' : 'Withdrawn' };
        return {
          id: d.id, group: ['pending', 'approved', 'rejected'].includes(st) ? st : 'other',
          title: (d.data.renterName as string) || '(No name)',
          sub: d.data.path === 'lao_national' ? 'Lao national' : `Foreign resident · ${d.data.proofType === 'lease' ? 'lease contract' : 'visa / permit'}`,
          date: (d.data.resubmittedAt ?? d.data.submittedAt) as Timestamp,
          badge, route: `/admin/residency/${d.id}`,
        };
      });
    }
    if (!businessDocs) return null;
    return businessDocs.map(d => {
      const st = (d.data.btobStatus as BtobStatus) ?? 'pending_approval';
      return {
        id: d.id, group: st === 'pending_approval' ? 'pending' : st,
        title: (d.data.btobCompanyName as string) || '(No company name)',
        sub: (d.data.btobResponsibleName as string) ?? '—',
        date: d.data.btobSubmittedAt as Timestamp,
        badge: BTOB_STATUS_CONFIG[st], route: `/admin/business-accounts/${d.id}`,
      };
    });
  }, [tab, identityDocs, residencyDocs, businessDocs, users]);

  const visible = (rows ?? [])
    .filter(r => filter === 'all' || r.group === filter)
    .sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));

  const runLegacy = async () => {
    if (!legacyConfirm) return;
    setLegacyBusy(true);
    setLegacyError(null);
    try {
      await httpsCallable(functions, 'adminLegacyResident')(legacyConfirm);
      setLegacyConfirm(null);
    } catch (e) {
      setLegacyError((e as { message?: string })?.message || 'Failed. Please try again.');
    } finally {
      setLegacyBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={{ flexShrink: 0 }}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Verifications</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.tabs}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabOn]} onPress={() => { setTab(t.key); setFilter('pending'); }} activeOpacity={0.8}>
              <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 42, flexShrink: 0 }} contentContainerStyle={s.filters}>
          {filters.map(f => (
            <TouchableOpacity key={f.key} style={[s.chip, filter === f.key && s.chipOn]} onPress={() => setFilter(f.key)} activeOpacity={0.75}>
              <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {tab === 'residency' && legacyDocs.length > 0 && (
          <View style={s.legacyCard}>
            <Text style={s.legacyTitle}>Legacy residents ({legacyDocs.length})</Text>
            <Text style={s.legacySub}>Marked resident before verification existed. Ask them to verify (30 days of grace) or switch them to tourist.</Text>
            {legacyDocs.map(d => (
              <View key={d.id} style={s.legacyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{nameOf(d.data)}</Text>
                  <Text style={s.rowSub}>
                    {d.data.residencyBasis === 'legacy' ? `Asked to verify · until ${fmtDate(d.data.residencyValidUntil as Timestamp)}` : 'No documents'}
                  </Text>
                </View>
                {d.data.residencyBasis !== 'legacy' && (
                  <TouchableOpacity style={s.smallBtn} onPress={() => setLegacyConfirm({ uid: d.id, action: 'ask' })}>
                    <Text style={s.smallBtnText}>Ask to verify</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.smallBtn} onPress={() => setLegacyConfirm({ uid: d.id, action: 'tourist' })}>
                  <Text style={s.smallBtnText}>Tourist now</Text>
                </TouchableOpacity>
              </View>
            ))}
            {legacyConfirm && (
              <ConfirmBox
                text={legacyConfirm.action === 'ask'
                  ? 'Keep this account as resident for 30 days and ask them to send their documents?'
                  : 'Switch this account to tourist now? Their next bookings use the standard deposit.'}
                confirmLabel={legacyBusy ? 'Working…' : legacyConfirm.action === 'ask' ? 'Ask to verify' : 'Switch to tourist'}
                cancelLabel="Cancel"
                confirmDisabled={legacyBusy}
                onCancel={() => setLegacyConfirm(null)}
                onConfirm={runLegacy}
              />
            )}
            {legacyError && <Text style={s.error}>{legacyError}</Text>}
          </View>
        )}

        {rows === null ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginTop: 32 }} />
        ) : visible.length === 0 ? (
          <Text style={s.empty}>Nothing here.</Text>
        ) : visible.map((r, i) => (
          <React.Fragment key={r.id}>
            {i > 0 && <View style={s.sep} />}
            <TouchableOpacity style={s.row} onPress={() => router.push(r.route as never)} activeOpacity={0.75}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{r.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{r.sub}</Text>
                <Text style={s.rowDate}>{fmtDate(r.date)}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: r.badge.bg }]}>
                <Text style={[s.badgeText, { color: r.badge.fg }]}>{r.badge.label}</Text>
              </View>
              <Feather name="chevron-right" size={15} color={COLORS.fg3} />
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, backgroundColor: COLORS.warmBeige, borderRadius: 10, padding: 3 },
  tab: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: COLORS.white },
  tabText: { fontSize: 13, fontWeight: '700', color: COLORS.fg3 },
  tabTextOn: { color: COLORS.carbon },
  filters: { paddingHorizontal: 20, paddingTop: 10, gap: 8, flexDirection: 'row' },
  chip: {
    height: 30, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200, alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  chipTextOn: { color: COLORS.porcelain },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  empty: { fontSize: 14, fontWeight: '600', color: COLORS.fg3, textAlign: 'center', marginTop: 32 },
  sep: { height: 1, backgroundColor: COLORS.softGray200 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  rowSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg2 },
  rowDate: { fontSize: 11, fontWeight: '400', color: COLORS.fg3, marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  legacyCard: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 8 },
  legacyTitle: { fontSize: 14, fontWeight: '800', color: '#7A5500' },
  legacySub: { fontSize: 12, fontWeight: '500', color: COLORS.fg2, marginTop: 4, marginBottom: 6, lineHeight: 17 },
  legacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  smallBtn: { borderWidth: 1.5, borderColor: COLORS.carbon, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: COLORS.white },
  smallBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.carbon },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 6 },
});
