import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { RentalDocCard } from '@/components/RentalDocCard';
import { auth } from '@/lib/auth';
import { getMyReservations, type RentalDoc } from '@/lib/firestore';
import { rentalsWithDocuments, inPeriod, type RentalPeriod } from '@/utils/rentalDocs';

// "All rentals" (from Receipts & reports › See all): every rental with at least one document,
// newest first, with search, period chips and "Load more" (10 per page).
// Pagination is client-side on purpose: ONE equality query (renterId ==, no orderBy),
// then filter/sort/slice in code. Server-side pages would need where(renterId) +
// orderBy(pickupAt) — a composite index this project avoids (CLAUDE.md) — and the
// search/period filters couldn't run server-side anyway. A renter's reservations stay
// small (dozens), so one read is cheap; only rendering is paged.

const PAGE_SIZE = 10;
const PERIODS: { key: RentalPeriod; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'month', label: 'This month' },
  { key: '3months', label: '3 months' },
  { key: 'year', label: 'This year' },
];

export default function AllRentalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rentals, setRentals] = useState<RentalDoc[]>([]);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<RentalPeriod>('all');
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getMyReservations(cu.uid)
      .then(r => setRentals(rentalsWithDocuments(r)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Back to the first page whenever the filters change.
  useEffect(() => { setPages(1); }, [query, period]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rentals.filter(r => inPeriod(r, period) && (!q || r.productName.toLowerCase().includes(q)));
  }, [rentals, query, period]);
  const visible = filtered.slice(0, pages * PAGE_SIZE);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>All rentals</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        >
          <View style={s.search}>
            <Feather name="search" size={16} color={COLORS.fg3} />
            <TextInput
              style={s.searchInput}
              placeholder="Search an item"
              placeholderTextColor={COLORS.fg3}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Feather name="x" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
          </View>

          <View style={s.chips}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[s.chip, period === p.key && s.chipActive]}
                onPress={() => setPeriod(p.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.chipText, period === p.key && s.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <Text style={s.error}>Could not load your rentals. Please try again later.</Text>
          ) : (
            <Text style={s.count}>
              {filtered.length} {filtered.length === 1 ? 'rental' : 'rentals'}
            </Text>
          )}

          {!error && filtered.length === 0 && (
            <Text style={s.empty}>
              {rentals.length === 0
                ? 'Your receipts and condition reports will appear here after your first rental.'
                : 'No rentals match your search.'}
            </Text>
          )}

          {visible.map(r => <RentalDocCard key={r.id} rental={r} icons={false} />)}

          {visible.length < filtered.length && (
            <TouchableOpacity style={s.loadMore} onPress={() => setPages(p => p + 1)} activeOpacity={0.8}>
              <Text style={s.loadMoreText}>Load more</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.carbon, paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  chipActive: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  chipTextActive: { color: COLORS.white },
  count: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, marginTop: 16, marginBottom: 10 },
  empty: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, lineHeight: 19 },
  error: { fontSize: 13, fontWeight: '500', color: COLORS.danger, marginTop: 16 },
  loadMore: {
    height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.carbon,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  loadMoreText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
});
