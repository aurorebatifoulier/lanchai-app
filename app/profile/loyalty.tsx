import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Timestamp, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import {
  TIER_ORDER, TIER_LABELS, tierPerksText, DEFAULT_REVIEW_REWARD_POINTS, DEFAULT_REFERRAL_REWARD_POINTS,
  type PaidTier,
} from '@/lib/loyalty';
import { useMyLoyalty } from '@/lib/loyaltyUi';

// Loyalty screen (validated mockup): the loyalty card, "Your path" (every tier: reached
// ✓ with its coupon used / ready, current "You're here", locked with required points and
// perks), "Earn more points", the referral card, and "Recent points" (users/{uid}/
// loyaltyHistory — written only by Cloud Functions). Excluded / business: not shown.
interface HistoryEntry { id: string; amount: number; source: 'rental' | 'review' | 'referral'; productName?: string; createdAt?: Timestamp }

const fmtDate = (ts: Timestamp) => ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const SOURCE_LABEL: Record<HistoryEntry['source'], string> = { rental: 'Rental', review: 'Review', referral: 'Invited friend' };

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const loyalty = useMyLoyalty();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Single orderBy, no filter → no composite index needed.
    getDocs(query(collection(db, 'users', uid, 'loyaltyHistory'), orderBy('createdAt', 'desc'), limit(30)))
      .then(snap => setHistory(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<HistoryEntry, 'id'>) }))))
      .catch(() => setHistory([]));
  }, []);

  const { config, points, tier, coupons, isResident } = loyalty;
  const reviewPts = config?.reviewRewardPoints ?? DEFAULT_REVIEW_REWARD_POINTS;
  const referralPts = config?.referralRewardPoints ?? DEFAULT_REFERRAL_REWARD_POINTS;
  const currentRank = TIER_ORDER.indexOf(tier);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Loyalty</Text>
      </View>

      {loyalty.loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      ) : loyalty.excluded ? (
        <View style={[s.card, { margin: 20 }]}>
          <Text style={s.muted}>Business accounts aren&apos;t part of the loyalty programme.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <LoyaltyCard interactive={false} />

          {/* ── Your path ── */}
          {config && (
            <>
              <Text style={s.section}>Your path</Text>
              <View style={s.card}>
                {TIER_ORDER.map((t, i) => {
                  const reached = i <= currentRank;
                  const isCurrent = i === currentRank;
                  const threshold = t === 'bronze' ? 0 : config.thresholds[t as PaidTier];
                  const coupon = t === 'bronze' ? null : coupons.find(c => c.tier === t);
                  return (
                    <View key={t} style={[s.pathRow, i > 0 && s.pathBorder]}>
                      <View style={[s.dot, reached ? s.dotOn : s.dotOff]}>
                        <Feather name={reached ? 'check' : 'lock'} size={14} color={reached ? COLORS.carbon : COLORS.fg3} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.pathTitleRow}>
                          <Text style={[s.pathTitle, !reached && s.pathTitleOff]}>{TIER_LABELS[t]}</Text>
                          {isCurrent && <Text style={s.here}>You&apos;re here</Text>}
                        </View>
                        <Text style={s.pathSub}>
                          {t === 'bronze'
                            ? 'Where everyone starts.'
                            : reached
                              ? coupon
                                ? (coupon.used ? `${coupon.percent}% coupon used` : `${coupon.percent}% coupon ready — apply it at checkout`)
                                : tierPerksText(t as PaidTier, config, isResident)
                              : `${threshold.toLocaleString('en-US')} points · ${tierPerksText(t as PaidTier, config, isResident)}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Earn more points ── */}
          <Text style={s.section}>Earn more points</Text>
          <View style={s.card}>
            {[
              { icon: 'shopping-bag' as const, title: 'Rent', sub: '1 point per 10,000 LAK of rental fees, once the rental is returned.' },
              { icon: 'star' as const, title: `Review · +${reviewPts}`, sub: 'For each review of a returned rental — whatever your rating.' },
              { icon: 'users' as const, title: `Invite a friend · +${referralPts}`, sub: 'For you and your friend, after their first rental.' },
            ].map((e, i) => (
              <View key={e.title} style={[s.pathRow, i > 0 && s.pathBorder]}>
                <View style={[s.dot, s.dotSoft]}><Feather name={e.icon} size={14} color="#B07A12" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pathTitle}>{e.title}</Text>
                  <Text style={s.pathSub}>{e.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Recent points ── */}
          {history.length > 0 && (
            <>
              <Text style={s.section}>Recent points</Text>
              <View style={s.card}>
                {history.map(h => (
                  <View key={h.id} style={s.historyRow}>
                    <Text style={s.historyText} numberOfLines={1}>
                      {`+${h.amount} · ${SOURCE_LABEL[h.source] ?? 'Points'}${h.productName ? ` — ${h.productName}` : ''}`}
                    </Text>
                    {h.createdAt && <Text style={s.historyDate}>{fmtDate(h.createdAt)}</Text>}
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={s.footnote}>
            Points never expire. Each tier&apos;s coupon is one-time. Points have no cash value.{points > 0 ? '' : ' Your first rental gets you started.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20 },
  section: { fontSize: 15, fontWeight: '800', color: COLORS.carbon, marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.softGray200, paddingHorizontal: 14 },
  muted: { fontSize: 14, color: COLORS.fg3, paddingVertical: 14 },
  pathRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  pathBorder: { borderTopWidth: 1, borderTopColor: COLORS.softGray200 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: COLORS.amber },
  dotOff: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.softGray },
  dotSoft: { backgroundColor: '#F7ECD9' },
  pathTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pathTitle: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  pathTitleOff: { color: COLORS.fg3 },
  here: {
    fontSize: 11, fontWeight: '800', color: '#7A5500', backgroundColor: '#FDF0C4',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
  },
  pathSub: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, marginTop: 2, lineHeight: 18 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10 },
  historyText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  historyDate: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  footnote: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginTop: 18, textAlign: 'center' },
});
