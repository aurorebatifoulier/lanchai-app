import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { TIER_LABELS } from '@/lib/loyalty';
import { useMyLoyalty, useAveragePointsPerRental, loyaltyCardSubline } from '@/lib/loyaltyUi';

// Loyalty card — light version (validated mockup), the SAME component on My Account and
// the Loyalty screen: "LANCHAI member" + points, carbon badge → gauge (light amber track,
// amber fill animated on focus) → dashed lock, current / next tier labels, then ONE line:
// "{n} points to {next}." (bold) + one playful sub-line. Platinum: badge, no gauge.
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
  const { progress, points, config } = loyalty;
  const current = TIER_LABELS[progress.current];
  const next = progress.next ? TIER_LABELS[progress.next] : null;

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push('/profile/loyalty')} activeOpacity={0.9} disabled={!interactive}>
      <View style={s.topRow}>
        <Text style={s.member}>{LOYALTY_COPY.memberLabel}</Text>
        <Text style={s.points}>
          {points.toLocaleString('en-US')}<Text style={s.pts}> pts</Text>
        </Text>
      </View>

      <View style={s.gaugeRow}>
        <View style={s.badge}><Feather name="award" size={22} color={SHADES.amber} /></View>
        {next ? (
          <>
            <View style={{ flex: 1 }}>
              <View style={s.track}>
                <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
              </View>
              <View style={s.labels}>
                <Text style={s.tierLabel}>{current}</Text>
                <Text style={s.tierLabel}>{next}</Text>
              </View>
            </View>
            <View style={s.lock}><Feather name="lock" size={17} color={SHADES.carbonFaint} /></View>
          </>
        ) : (
          <Text style={s.topTier}>{current}</Text>
        )}
      </View>

      <Text style={s.line}>
        {next && progress.remaining != null
          ? <Text style={s.lineBold}>{LOYALTY_COPY.pointsToNext(progress.remaining, next)} </Text>
          : null}
        <Text style={s.lineSub}>{loyaltyCardSubline(progress, avg, config)}</Text>
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { ...UI.card, ...UI.cardPadded, marginTop: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  member: { fontSize: 16, fontWeight: '700', color: SHADES.carbon },
  points: { fontSize: 16, fontWeight: '800', color: SHADES.carbon },
  pts: { fontWeight: '500', color: SHADES.carbonMuted },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  badge: { width: 46, height: 46, borderRadius: 23, backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  track: { height: 12, borderRadius: 6, backgroundColor: SHADES.amberLight, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: SHADES.amber },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tierLabel: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  lock: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderStyle: 'dashed', borderColor: SHADES.carbonFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  topTier: { fontSize: 16, fontWeight: '800', color: SHADES.carbon },
  line: { marginTop: 14, fontSize: 15, lineHeight: 21 },
  lineBold: { fontWeight: '800', color: SHADES.carbon },
  lineSub: { fontWeight: '500', color: SHADES.carbonMuted },
});
