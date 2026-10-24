import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { TIER_LABELS, tierPerksText, type PaidTier } from '@/lib/loyalty';
import { useMyLoyalty, useAveragePointsPerRental, loyaltyCardSubline } from '@/lib/loyaltyUi';

// My Account loyalty card (validated mockup): carbon card, "LANCHAI member" + points,
// a gauge from the CURRENT tier to the NEXT one only (amber badge left, dashed lock
// right, fill animated on screen focus), "{n} points to {next}.", a playful sub-line
// and the next tier's perks. Platinum: full badge, no gauge. Tap → Loyalty screen.
// Hidden for excluded / business accounts and before the loyalty config exists.
export function LoyaltyCard({ interactive = true }: { interactive?: boolean }) {
  const router = useRouter();
  const loyalty = useMyLoyalty();
  const avg = useAveragePointsPerRental();
  const fill = useRef(new Animated.Value(0)).current;
  const target = loyalty.progress?.fraction ?? 0;

  useFocusEffect(useCallback(() => {
    fill.setValue(0);
    Animated.timing(fill, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fill, target]));

  if (loyalty.loading || loyalty.excluded || !loyalty.progress) return null;
  const { progress, points, config, isResident } = loyalty;
  const current = TIER_LABELS[progress.current];
  const next = progress.next ? TIER_LABELS[progress.next] : null;

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push('/profile/loyalty')} activeOpacity={0.9} disabled={!interactive}>
      <View style={s.topRow}>
        <Text style={s.member}>{LOYALTY_COPY.memberLabel}</Text>
        <Text style={s.points}>{LOYALTY_COPY.points(points)}</Text>
      </View>

      {next ? (
        <View style={s.gaugeRow}>
          <View style={s.tierCol}>
            <View style={s.badge}><Feather name="award" size={26} color={COLORS.carbon} /></View>
            <Text style={s.tierLabel}>{current}</Text>
          </View>
          <View style={s.track}>
            <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
          <View style={s.tierCol}>
            <View style={s.locked}><Feather name="lock" size={20} color="rgba(250,250,247,0.55)" /></View>
            <Text style={[s.tierLabel, s.tierLabelMuted]}>{next}</Text>
          </View>
        </View>
      ) : (
        <View style={s.topTierRow}>
          <View style={[s.badge, s.badgeBig]}><Feather name="award" size={32} color={COLORS.carbon} /></View>
          <Text style={s.topTierName}>{current}</Text>
        </View>
      )}

      {next && progress.remaining != null && (
        <Text style={s.main}>{LOYALTY_COPY.pointsToNext(progress.remaining, next)}</Text>
      )}
      <Text style={s.sub}>{loyaltyCardSubline(progress, avg, config)}</Text>
      {progress.next && (
        <View style={s.perkRow}>
          <Feather name="gift" size={14} color={COLORS.amber} />
          <Text style={s.perk}>{tierPerksText(progress.next as PaidTier, config, isResident)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: COLORS.carbon, borderRadius: 22, padding: 20, marginTop: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  member: { fontSize: 14, fontWeight: '600', color: 'rgba(250,250,247,0.7)', letterSpacing: 0.3 },
  points: { fontSize: 16, fontWeight: '800', color: COLORS.amber },
  gaugeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  tierCol: { alignItems: 'center', gap: 6, width: 64 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.amber, alignItems: 'center', justifyContent: 'center' },
  badgeBig: { width: 72, height: 72, borderRadius: 36 },
  locked: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed',
    borderColor: 'rgba(250,250,247,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  tierLabel: { fontSize: 14, fontWeight: '800', color: COLORS.porcelain },
  tierLabelMuted: { fontWeight: '600', color: 'rgba(250,250,247,0.7)' },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#3A3A3A', marginTop: 22, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: COLORS.amber },
  topTierRow: { alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 4 },
  topTierName: { fontSize: 16, fontWeight: '800', color: COLORS.porcelain },
  main: { fontSize: 19, fontWeight: '800', color: COLORS.porcelain, marginTop: 18, letterSpacing: -0.3 },
  sub: { fontSize: 14, fontWeight: '500', color: 'rgba(250,250,247,0.7)', marginTop: 4, lineHeight: 20 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  perk: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.amber },
});
