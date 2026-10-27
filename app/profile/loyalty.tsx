import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Timestamp, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { ReferralCard } from '@/components/ReferralCard';
import {
  TIER_ORDER, TIER_LABELS, tierPerksText, DEFAULT_REVIEW_REWARD_POINTS, DEFAULT_REFERRAL_REWARD_POINTS,
  type PaidTier,
} from '@/lib/loyalty';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, RowGroup, Row, Chip, useScreenInsets } from '@/components/account/ui';

// Loyalty screen (validated mockup): the loyalty card, "Your path" (every tier: reached
// ✓ with its coupon used / ready, current "You're here", locked with required points and
// perks), "Earn more points", the referral card, and "Recent points" (users/{uid}/
// loyaltyHistory — written only by Cloud Functions). Excluded / business: not shown.
interface HistoryEntry { id: string; amount: number; source: 'rental' | 'review' | 'referral'; productName?: string; createdAt?: Timestamp }

const fmtDate = (ts: Timestamp) => ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const SOURCE_LABEL: Record<HistoryEntry['source'], string> = { rental: 'Rental', review: 'Review', referral: 'Invited friend' };

export default function LoyaltyScreen() {
  const screen = useScreenInsets();
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
  // ?section=referral (Home referral card) → scroll to the referral card once laid out.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const currentRank = TIER_ORDER.indexOf(tier);

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Loyalty</Text>
      </View>

      {loyalty.loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} />
      ) : loyalty.excluded ? (
        <View style={[UI.card, UI.cardPadded, { margin: 16 }]}>
          <Text style={UI.body}>Business accounts aren&apos;t part of the loyalty programme.</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
          showsVerticalScrollIndicator={false}
        >
          <LoyaltyCard interactive={false} />

          {/* ── Your path ── */}
          {config && (
            <>
              <SectionTitle>Your path</SectionTitle>
              <RowGroup>
                {TIER_ORDER.map((t, i) => {
                  const reached = i <= currentRank;
                  const isCurrent = i === currentRank;
                  const threshold = t === 'bronze' ? 0 : config.thresholds[t as PaidTier];
                  const coupon = t === 'bronze' ? null : coupons.find(c => c.tier === t);
                  // NOT the My Account row rule: here amber = reached (filled amber circle,
                  // carbon check / award for the current tier), grey dashed lock = not yet.
                  return (
                    <View key={t} style={s.pathRow}>
                      {reached ? (
                        <View style={s.reached}>
                          <Feather name={isCurrent ? 'award' : 'check'} size={16} color={SHADES.carbon} />
                        </View>
                      ) : (
                        <View style={s.locked}><Feather name="lock" size={15} color={SHADES.carbonMuted} /></View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={s.pathTitleRow}>
                          <Text style={[UI.title, !reached && { color: SHADES.carbonMuted }]}>{TIER_LABELS[t]}</Text>
                          {isCurrent && <Chip label="You're here" tone="carbon" small />}
                        </View>
                        <Text style={UI.subtitle}>
                          {t === 'bronze'
                            ? 'Where everyone starts.'
                            : reached
                              // Reached: the coupon state, never "Unlocks…".
                              ? coupon
                                ? (coupon.used ? `${coupon.percent}% coupon used` : `${coupon.percent}% coupon ready to use`)
                                : `${TIER_LABELS[t]} reached`
                              : `${tierPerksText(t as PaidTier, config, isResident)} · ${threshold.toLocaleString('en-US')} points`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </RowGroup>
            </>
          )}

          {/* ── Earn more points ── */}
          <SectionTitle>Earn more points</SectionTitle>
          <RowGroup>
            {[
              { icon: 'shopping-bag' as const, title: 'Rent', sub: '1 point per 10,000 LAK of rental fees, once the rental is returned.' },
              { icon: 'star' as const, title: `Review · +${reviewPts}`, sub: 'For each review of a returned rental — whatever your rating.' },
              { icon: 'users' as const, title: `Invite a friend · +${referralPts}`, sub: 'For you and your friend, after their first rental.' },
            ].map(e => <Row key={e.title} icon={{ name: e.icon }} title={e.title} sub={e.sub} />)}
          </RowGroup>

          {/* ── Referral ── */}
          <View
            onLayout={e => {
              if (section !== 'referral' || scrolled.current) return;
              scrolled.current = true;
              const y = e.nativeEvent.layout.y;
              setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }), 250);
            }}
          >
            <ReferralCard points={referralPts} />
          </View>

          {/* ── Recent points ── */}
          {history.length > 0 && (
            <>
              <SectionTitle>Recent points</SectionTitle>
              <RowGroup>
                {history.map(h => (
                  <View key={h.id} style={s.historyRow}>
                    <Text style={s.historyAmount}>+{h.amount}</Text>
                    <Text style={s.historyText} numberOfLines={1}>
                      {`${SOURCE_LABEL[h.source] ?? 'Points'}${h.productName ? ` — ${h.productName}` : ''}`}
                    </Text>
                    {h.createdAt && <Text style={UI.small}>{fmtDate(h.createdAt)}</Text>}
                  </View>
                ))}
              </RowGroup>
            </>
          )}

          <Text style={[UI.small, s.footnote]}>
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
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  reached: { width: 36, height: 36, borderRadius: 18, backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center' },
  locked: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: SHADES.carbonFaint,
    backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center',
  },
  pathTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  historyAmount: { minWidth: 38, fontSize: 14, fontWeight: '800', color: SHADES.amberDeep },
  historyText: { flex: 1, fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  footnote: { marginTop: 18, textAlign: 'center' },
});
