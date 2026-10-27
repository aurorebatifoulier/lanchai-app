import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, RowGroup, Row, useScreenInsets } from '@/components/account/ui';
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
  const screen = useScreenInsets();
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
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Receipts &amp; reports</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
        >
          {/* ── Your rentals ── */}
          <SectionTitle style={{ marginTop: 16 }}>Your rentals</SectionTitle>
          {error && <Text style={[UI.errorText, { marginBottom: 10 }]}>Could not load your rentals. Please try again later.</Text>}
          {withDocs.length === 0 ? (
            <View style={[UI.card, UI.cardPadded]}>
              <Text style={UI.body}>Your receipts and condition reports will appear here after your first rental.</Text>
            </View>
          ) : (
            <>
              {withDocs.slice(0, PREVIEW_COUNT).map(r => <RentalDocCard key={r.id} rental={r} />)}
              {withDocs.length > PREVIEW_COUNT && (
                <View style={{ marginTop: 6 }}>
                  <RowGroup>
                    <Row icon={{ name: 'file-text' }} title={`See all (${withDocs.length})`} onPress={() => router.push('/profile/rentals')} />
                  </RowGroup>
                </View>
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
});
