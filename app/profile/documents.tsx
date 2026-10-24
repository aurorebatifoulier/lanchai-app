import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { RentalDocCard } from '@/components/RentalDocCard';
import { auth } from '@/lib/auth';
import { getMyReservations, type RentalDoc } from '@/lib/firestore';
import { rentalsWithDocuments } from '@/utils/rentalDocs';

// Receipts & reports (validated mockup): "Your rentals" — the 3 most recent finished/
// ongoing rentals with at least one document (receipt, pick-up or return report), then
// "See all" → app/profile/rentals.tsx. Legal texts live in Account → Legal, the business
// document in Account → Business document. One equality query (getMyReservations),
// filtered/sorted in code.

const PREVIEW_COUNT = 3;


export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rentals, setRentals] = useState<RentalDoc[]>([]);

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getMyReservations(cu.uid)
      .then(setRentals)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const withDocs = useMemo(() => rentalsWithDocuments(rentals), [rentals]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Receipts &amp; reports</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        >
          {error && <Text style={s.error}>Could not load your rentals. Please try again later.</Text>}

          {/* ── Your rentals ── */}
          <Text style={s.sectionTitle}>Your rentals</Text>
          {withDocs.length === 0 ? (
            <Text style={s.empty}>Your receipts and condition reports will appear here after your first rental.</Text>
          ) : (
            <>
              {withDocs.slice(0, PREVIEW_COUNT).map(r => <RentalDocCard key={r.id} rental={r} />)}
              {withDocs.length > PREVIEW_COUNT && (
                <TouchableOpacity style={s.seeAll} onPress={() => router.push('/profile/rentals')} activeOpacity={0.7}>
                  <Text style={s.seeAllText}>See all ({withDocs.length})</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.amberTintText} />
                </TouchableOpacity>
              )}
            </>
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
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginTop: 16, marginBottom: 10 },
  empty: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, lineHeight: 19, marginBottom: 4 },
  error: { fontSize: 13, fontWeight: '500', color: COLORS.danger, marginBottom: 8 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: COLORS.softGray200 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  rowSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  seeAllText: { fontSize: 14, fontWeight: '800', color: COLORS.amberTintText },
  bizCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 6 },
  docThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: COLORS.softGray200 },
  docThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  updateBtn: { borderWidth: 1.5, borderColor: COLORS.carbon, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  updateBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
});
