import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { RentalDocCard } from '@/components/RentalDocCard';
import { auth } from '@/lib/auth';
import { getMyReservations, getUserProfile, type RentalDoc, type UserProfile } from '@/lib/firestore';
import { canReplaceBtobDocument } from '@/utils/btob';
import { rentalsWithDocuments } from '@/utils/rentalDocs';

// Renter's documents in one place (validated mockup): "Your rentals" — the 3 most
// recent finished/ongoing rentals with at least one document (receipt, pick-up or
// return report), then "See all" → app/profile/rentals.tsx — business document (BtoB)
// and legal links. One equality query (getMyReservations), filtered/sorted in code.

const PREVIEW_COUNT = 3;

const LEGAL = [
  { title: 'Terms and conditions', route: '/legal/terms' },
  { title: 'Privacy policy', route: '/legal/privacy' },
  { title: 'Cancellation policy', route: '/legal/cancellation' },
] as const;

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rentals, setRentals] = useState<RentalDoc[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    Promise.all([getMyReservations(cu.uid), getUserProfile(cu.uid)])
      .then(([r, p]) => { setRentals(r); setProfile(p); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const withDocs = useMemo(() => rentalsWithDocuments(rentals), [rentals]);
  const isBtob = profile?.accountType === 'btob';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Documents</Text>
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

          {/* ── My ID ── */}
          <Text style={s.sectionTitle}>My ID</Text>
          <TouchableOpacity style={[s.card, s.row]} onPress={() => router.push('/profile/identity')} activeOpacity={0.75}>
            <Feather name="credit-card" size={16} color={COLORS.carbon} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>ID document</Text>
              <Text style={s.rowSub}>{profile?.idOnFile ? 'On file' : 'Needed to rent — add it here or show it at the shop'}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={COLORS.fg3} />
          </TouchableOpacity>

          {/* ── Residency status (not for business accounts) ── */}
          {profile?.customerType !== 'business' && (
            <>
              <Text style={s.sectionTitle}>Residency status</Text>
              <TouchableOpacity style={[s.card, s.row]} onPress={() => router.push('/profile/residency')} activeOpacity={0.75}>
                <Feather name="home" size={16} color={COLORS.carbon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{profile?.customerType === 'resident' ? 'Resident' : 'Tourist'}</Text>
                  <Text style={s.rowSub}>Residents pay a reduced deposit — verify my status</Text>
                </View>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Business document (BtoB only) ── */}
          {isBtob && (
            <>
              <Text style={s.sectionTitle}>Business document</Text>
              <View style={[s.card, s.bizCard]}>
                {profile?.btobDocumentUrl ? (
                  <Image source={{ uri: profile.btobDocumentUrl }} style={s.docThumb} />
                ) : (
                  <View style={[s.docThumb, s.docThumbEmpty]}>
                    <Feather name="file" size={18} color={COLORS.fg3} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>Registration document</Text>
                  <Text style={s.rowSub}>{profile?.btobDocumentUrl ? 'On file' : 'Not uploaded yet'}</Text>
                </View>
                {canReplaceBtobDocument(profile) && (
                  <TouchableOpacity
                    style={s.updateBtn}
                    onPress={() => router.push('/profile/business-document')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.updateBtnText}>{profile?.btobDocumentUrl ? 'Update' : 'Upload'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!canReplaceBtobDocument(profile) && (
                <Text style={s.empty}>Your account is approved — contact us if your registration document changes.</Text>
              )}
            </>
          )}

          {/* ── Legal ── */}
          <Text style={s.sectionTitle}>Legal</Text>
          <View style={s.card}>
            {LEGAL.map((l, i) => (
              <TouchableOpacity
                key={l.route}
                style={[s.row, i > 0 && s.rowBorder]}
                onPress={() => router.push(l.route)}
                activeOpacity={0.75}
              >
                <Text style={[s.rowTitle, { flex: 1 }]}>{l.title}</Text>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            ))}
          </View>
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
