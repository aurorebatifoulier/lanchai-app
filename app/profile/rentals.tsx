import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, useScreenInsets } from '@/components/account/ui';
import { RentalDocCard } from '@/components/RentalDocCard';
import { auth } from '@/lib/auth';
import { getMyReservations, type RentalDoc } from '@/lib/firestore';
import { rentalsWithDocuments, inPeriod, type RentalPeriod } from '@/utils/rentalDocs';
import PressScale from '@/components/PressScale';

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
  const screen = useScreenInsets();
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
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>All rentals</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[UI.screenContent, s.content, { paddingBottom: screen.contentBottom }]}
        >
          <View style={[UI.input, s.search]}>
            <Feather name="search" size={16} color={SHADES.carbonMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search an item"
              placeholderTextColor={SHADES.carbonFaint}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Feather name="x" size={16} color={SHADES.carbonMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={s.chips}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[UI.choice, period === p.key && UI.choiceOn]}
                onPress={() => setPeriod(p.key)}
                activeOpacity={0.8}
              >
                <Text style={[UI.choiceText, period === p.key && UI.choiceTextOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <Text style={[UI.errorText, s.count]}>Could not load your rentals. Please try again later.</Text>
          ) : (
            <Text style={[UI.small, s.count]}>
              {filtered.length} {filtered.length === 1 ? 'rental' : 'rentals'}
            </Text>
          )}

          {!error && filtered.length === 0 && (
            <View style={[UI.card, UI.cardPadded]}>
              <Text style={UI.body}>
                {rentals.length === 0
                  ? 'Your receipts and condition reports will appear here after your first rental.'
                  : 'No rentals match your search.'}
              </Text>
            </View>
          )}

          {visible.map(r => <RentalDocCard key={r.id} rental={r} />)}

          {visible.length < filtered.length && (
            <PressScale style={[UI.btnSecondary, { marginTop: 4 }]} onPress={() => setPages(p => p + 1)} activeOpacity={0.8}>
              <Text style={UI.btnSecondaryText}>Load more</Text>
            </PressScale>
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
  content: { paddingTop: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SHADES.white },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: SHADES.carbon, paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  count: { marginTop: 16, marginBottom: 10 },
});
