import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, type UserProfile, type LoyaltyCoupon } from '@/lib/firestore';
import { useLoyaltyConfig, TIER_LABELS, pointsToNextTier, nextTierName } from '@/lib/loyalty';

function fmtDate(ts: Timestamp): string {
  const d = ts.toDate();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const config = useLoyaltyConfig();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserProfile(user.uid)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const points   = profile?.loyaltyPoints ?? 0;
  const tier     = profile?.loyaltyTier ?? 'bronze';
  const toNext   = pointsToNextTier(points, config);
  const nextTier = nextTierName(points, config);
  const unusedCoupons: LoyaltyCoupon[] = (profile?.coupons ?? []).filter(c => !c.used);
  // Business accounts are excluded from the loyalty program — this screen isn't
  // linked to from account.tsx for them, but guard direct navigation too.
  const isBusinessAccount = profile?.customerType === 'business';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Loyalty</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      ) : isBusinessAccount ? (
        <View style={[s.emptyBox, { marginHorizontal: 20, marginTop: 20 }]}>
          <Feather name="award" size={20} color={COLORS.fg3} />
          <Text style={s.emptyText}>Business accounts aren&apos;t part of the loyalty program.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Tier card ── */}
          <View style={s.tierCard}>
            <View style={s.tierBadge}>
              <Feather name="award" size={22} color={COLORS.amber} />
            </View>
            <Text style={s.tierName}>{TIER_LABELS[tier]}</Text>
            <Text style={s.tierPoints}>{points} points</Text>
            {toNext != null && nextTier ? (
              <Text style={s.tierNext}>{toNext} points to {TIER_LABELS[nextTier]}</Text>
            ) : config ? (
              <Text style={s.tierNext}>You&apos;ve reached the top tier</Text>
            ) : null}
          </View>

          {/* ── Coupons ── */}
          <Text style={s.sectionLabel}>Your coupons</Text>
          {unusedCoupons.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="tag" size={20} color={COLORS.fg3} />
              <Text style={s.emptyText}>No coupons yet — reach a new tier to earn one.</Text>
            </View>
          ) : (
            unusedCoupons.map(c => (
              <View key={c.id} style={s.couponCard}>
                <View style={s.couponPercentBox}>
                  <Text style={s.couponPercentText}>{c.percent}%</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.couponTitle}>{TIER_LABELS[c.tier]} tier reward</Text>
                  <Text style={s.couponSub}>Issued {fmtDate(c.issuedAt)} · apply at checkout</Text>
                </View>
              </View>
            ))
          )}

          {/* ── How it works ── */}
          <Text style={s.sectionLabel}>How tiers work</Text>
          <View style={s.explainCard}>
            {[
              'Earn 1 point for every 10,000 LAK of rental fees, credited when a rental is completed.',
              'Points accumulate for life — no expiry, no reset.',
              'Reach a new tier and you get a one-time discount coupon to use on a future booking.',
              'Platinum members get a reduced deposit on every rental.',
            ].map((line, i) => (
              <View key={i} style={s.explainRow}>
                <Text style={s.explainBullet}>·</Text>
                <Text style={s.explainText}>{line}</Text>
              </View>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  tierCard: {
    backgroundColor: COLORS.carbon,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  tierBadge: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(244,180,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  tierName: {
    fontSize: 20, fontWeight: '800', color: COLORS.porcelain, letterSpacing: -0.3,
  },
  tierPoints: {
    fontSize: 13, fontWeight: '600', color: 'rgba(250,250,247,0.7)', marginTop: 4,
  },
  tierNext: {
    fontSize: 12, fontWeight: '500', color: 'rgba(250,250,247,0.55)', marginTop: 8,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: COLORS.fg3, marginBottom: 10,
  },

  emptyBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 16, marginBottom: 24,
  },
  emptyText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.fg3, lineHeight: 18 },

  couponCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.amberTintBorder,
    padding: 14, marginBottom: 10,
  },
  couponPercentBox: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  couponPercentText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  couponTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  couponSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },

  explainCard: {
    backgroundColor: COLORS.white, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 16, gap: 10, marginBottom: 12,
  },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  explainBullet: { fontSize: 14, color: COLORS.fg3, lineHeight: 18 },
  explainText: { flex: 1, fontSize: 12, fontWeight: '400', color: COLORS.fg2, lineHeight: 18 },
});
