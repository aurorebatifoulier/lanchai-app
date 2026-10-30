import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useScreenInsets } from '@/components/account/ui';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import type { ProductCategory } from '@/lib/mockData';
import { useExchangeRate } from '@/lib/exchangeRate';
import { formatLak } from '@/utils/currency';

// ── Category labels — mirror explore.tsx EXPLORE_CATEGORIES ──────────────────

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  'fun':     'Fun',
  'tools':   'Tools',
  'outdoor': 'Outdoor',
  'sports':  'Sports',
  'kids':    'Kids',
  'home':    'Home',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  category: string;
  pricePerDay: number;
  quantity: number;
  status: 'draft' | 'published' | 'archived';
  available: boolean;
  accessMode: 'public' | 'earlyAccess' | 'exclusive';
}

const ACCESS_MODE_LABELS: Record<'earlyAccess' | 'exclusive', string> = {
  earlyAccess: 'Early access',
  exclusive:   'Exclusive',
};

const CATEGORY_FILTER_OPTIONS: Array<{ id: 'all' | ProductCategory; label: string }> = [
  { id: 'all', label: 'All' },
  ...(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([id, label]) => ({ id, label })),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusStyle(status: string, available: boolean) {
  if (status === 'archived')                return { label: 'Archived',    bg: COLORS.softGray200, fg: COLORS.fg3 };
  if (status === 'published' && available)  return { label: 'Published',   bg: '#D1FAE5', fg: '#065F46' };
  if (status === 'published' && !available) return { label: 'Unavailable', bg: COLORS.softGray200, fg: COLORS.fg3 };
  return { label: 'Draft', bg: '#FEF9E5', fg: '#92400E' };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminProductsScreen() {
  // Top + bottom insets: the list stops above the Android 3-button / gesture bar.
  const screen = useScreenInsets();
  const router  = useRouter();
  const exchangeRate = useExchangeRate();

  const [rows,       setRows]       = useState<ProductRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,         setSearch]         = useState('');
  const [filterMode,     setFilterMode]     = useState<'active' | 'archived'>('active');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setRows(
          snap.docs.map(d => {
            const data = d.data();
            return {
              id:          d.id,
              name:        data.name        ?? '',
              category:    data.category    ?? 'home',
              pricePerDay: data.pricePerDay ?? 0,
              quantity:    data.quantity    ?? 0,
              status:      data.status      ?? 'draft',
              available:   data.available   ?? true,
              accessMode:  data.accessMode  ?? 'public',
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filtered = useMemo(() => {
    let list = rows.filter(r =>
      filterMode === 'archived' ? r.status === 'archived' : r.status !== 'archived',
    );
    if (categoryFilter !== 'all') list = list.filter(r => r.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r => r.name.toLowerCase().includes(q));
    return list;
  }, [rows, search, filterMode, categoryFilter]);

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />

      {/* ── Fixed top bar (header + search + chips grouped as one flex sibling) */}
      <View style={s.topBar}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Products</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => router.push('/admin/product-form')}
            activeOpacity={0.82}
          >
            <Feather name="plus" size={18} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>

        <View style={s.searchWrap}>
          <Feather name="search" size={14} color={COLORS.fg3} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name…"
            placeholderTextColor={COLORS.fg3}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>

        <View style={s.filterRow}>
          {(['active', 'archived'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[s.filterChip, filterMode === mode && s.filterChipActive]}
              onPress={() => { setFilterMode(mode); setSearch(''); }}
              activeOpacity={0.75}
            >
              <Text style={[s.filterChipText, filterMode === mode && s.filterChipTextActive]}>
                {mode === 'active' ? 'Active' : 'Archived'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chipsScroll}
          contentContainerStyle={s.categoryFilterRow}
        >
          {CATEGORY_FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[s.filterChip, categoryFilter === opt.id && s.filterChipActive]}
              onPress={() => setCategoryFilter(opt.id)}
              activeOpacity={0.75}
            >
              <Text style={[s.filterChipText, categoryFilter === opt.id && s.filterChipTextActive]}>
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
          { paddingBottom: screen.contentBottom },
          s.listContent,
          (loading || filtered.length === 0) && s.listContentCenter,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : filtered.length === 0 ? (
          <>
            <View style={s.emptyIconBox}>
              <Feather name="package" size={32} color={COLORS.fg3} />
            </View>
            <Text style={s.emptyTitle}>
              {search.trim()
                ? 'No products match your search.'
                : categoryFilter !== 'all'
                ? `No ${CATEGORY_LABELS[categoryFilter].toLowerCase()} products${filterMode === 'archived' ? ' in Archived' : ''}.`
                : filterMode === 'archived'
                ? 'No archived products.'
                : 'No products yet.'}
            </Text>
            {!search.trim() && categoryFilter === 'all' && filterMode === 'active' && (
              <Text style={s.emptySub}>Tap + to add your first one.</Text>
            )}
          </>
        ) : (
          filtered.map((item, index) => {
            const badge    = getStatusStyle(item.status, item.available);
            const catLabel = CATEGORY_LABELS[item.category as ProductCategory] ?? item.category;
            return (
              <React.Fragment key={item.id}>
                {index > 0 && <View style={s.sep} />}
                <TouchableOpacity
                  style={s.row}
                  onPress={() => router.push(`/admin/product-form?id=${item.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowMain}>
                    <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                    <View style={s.rowMeta}>
                      <View style={s.catChip}>
                        <Text style={s.catChipText}>{catLabel}</Text>
                      </View>
                      {item.accessMode !== 'public' && (
                        <View style={s.accessChip}>
                          <Text style={s.accessChipText}>{ACCESS_MODE_LABELS[item.accessMode]}</Text>
                        </View>
                      )}
                      <Text style={s.rowDetail}>
                        {formatLak(item.pricePerDay, exchangeRate)} / day · qty {item.quantity}
                      </Text>
                    </View>
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
  addBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginVertical: 12,
    paddingHorizontal: 14, height: 44,
    backgroundColor: COLORS.white,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.softGray200,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.carbon,
  },


  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 8,
    height: 40, flexShrink: 0,
  },
  chipsScroll: { height: 40, flexShrink: 0 },
  categoryFilterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  filterChip: {
    height: 32, paddingHorizontal: 16, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.carbon, borderColor: COLORS.carbon,
  },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  filterChipTextActive: { color: COLORS.porcelain },

  list:              { flex: 1 },
  listContent:       { paddingTop: 4 },
  listContentCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 0 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 20,
  },
  rowMain: { flex: 1 },
  rowName: {
    fontSize: 14, fontWeight: '700', color: COLORS.carbon,
    letterSpacing: -0.1, marginBottom: 5,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catChip: {
    backgroundColor: COLORS.warmBeige, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  catChipText: { fontSize: 10, fontWeight: '700', color: COLORS.fg2 },
  accessChip: {
    backgroundColor: COLORS.amber, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  accessChipText: { fontSize: 10, fontWeight: '700', color: COLORS.carbon },
  rowDetail: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  sep: { height: 1, backgroundColor: COLORS.softGray200, marginLeft: 20 },

  statusChip: {
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, marginRight: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  emptyIconBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17, fontWeight: '800', color: COLORS.carbon,
    textAlign: 'center', marginBottom: 8, letterSpacing: -0.2,
  },
  emptySub: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, textAlign: 'center' },
});
