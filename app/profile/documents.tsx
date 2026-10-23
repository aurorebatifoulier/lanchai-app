import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import type { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { ChecklistSummary } from '@/components/ChecklistSummary';
import { auth } from '@/lib/auth';
import { getMyReservations, getUserProfile, type RentalDoc, type UserProfile } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import { canReplaceBtobDocument } from '@/utils/btob';

// Renter's documents in one place. Receipts reuse the existing receipt screen
// (app/rentals/[id]/receipt.tsx — RentalReceipt + PDF), same condition: returned +
// returnFinalizedAt; one receipt per reservation, like that screen. Condition reports
// reuse the read-only ChecklistSummary. One equality query (renterId), sorted in code.

const fmtDate = (ts?: Timestamp | null) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const itemName = (r: RentalDoc) => (r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName);
const ms = (ts?: Timestamp | null) => ts?.toMillis() ?? 0;

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

  const receipts = useMemo(
    () => rentals
      .filter(r => r.status === 'returned' && r.returnFinalizedAt)
      .sort((a, b) => ms(b.returnedAt ?? b.returnAt) - ms(a.returnedAt ?? a.returnAt)),
    [rentals],
  );
  const reports = useMemo(
    () => rentals
      .filter(r => r.handoverChecklist || r.returnChecklist)
      .sort((a, b) => ms(b.pickupAt) - ms(a.pickupAt)),
    [rentals],
  );
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

          {/* ── Receipts ── */}
          <Text style={s.sectionTitle}>Receipts</Text>
          {receipts.length === 0 ? (
            <Text style={s.empty}>Your receipts will appear here after your first rental.</Text>
          ) : (
            <View style={s.card}>
              {receipts.map((r, i) => (
                <TouchableOpacity
                  key={r.id}
                  style={[s.row, i > 0 && s.rowBorder]}
                  onPress={() => router.push(`/rentals/${r.id}/receipt`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowIcon}>
                    <Feather name="file-text" size={16} color={COLORS.carbon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{itemName(r)}</Text>
                    <Text style={s.rowSub}>
                      Returned {fmtDate(r.returnedAt ?? r.returnAt)}{r.orderId ? ` · Order ${r.orderId}` : ''}
                    </Text>
                  </View>
                  <Text style={s.rowAmount}>{formatLakAmount(r.total)}</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.fg3} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Condition reports ── */}
          <Text style={s.sectionTitle}>Condition reports</Text>
          {reports.length === 0 ? (
            <Text style={s.empty}>The condition of your items at pick-up and return will appear here.</Text>
          ) : (
            reports.map(r => (
              <View key={r.id} style={s.reportBlock}>
                <Text style={s.rowTitle}>{itemName(r)}</Text>
                <Text style={[s.rowSub, { marginBottom: 8 }]}>
                  {fmtDate(r.pickupAt)} → {fmtDate(r.returnAt)}
                </Text>
                {r.handoverChecklist && <ChecklistSummary checklist={r.handoverChecklist} title="Pick-up checklist" />}
                {r.returnChecklist && <ChecklistSummary checklist={r.returnChecklist} title="Return checklist" />}
              </View>
            ))
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
  rowIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  rowSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  reportBlock: {
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 14, marginBottom: 10,
  },
  bizCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 6 },
  docThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: COLORS.softGray200 },
  docThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  updateBtn: { borderWidth: 1.5, borderColor: COLORS.carbon, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  updateBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
});
