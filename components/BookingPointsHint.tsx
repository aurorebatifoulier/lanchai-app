import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { TIER_LABELS, loyaltyPointsFor, tierForPoints } from '@/lib/loyalty';
import { useMyLoyalty } from '@/lib/loyaltyUi';

// Booking reminder (validated mockup) under the deposit / resident hint: points this
// booking will earn — the SAME rule as the real credit (loyaltyPointsFor on each line's
// pre-coupon subtotal, credited when returned). Crossing a tier / top tier variants.
// Hidden for excluded / business accounts and before the loyalty config exists.
// `compact`: one small dark-amber line (booking total card) instead of the boxed hint.
export function BookingPointsHint({ subtotals, style, compact }: { subtotals: number[]; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { loading, excluded, points, progress, config } = useMyLoyalty();
  const pts = subtotals.reduce((s, x) => s + loyaltyPointsFor(x), 0);
  if (loading || excluded || !progress || !config || pts <= 0) return null;

  let line: { bold: string; rest: string };
  if (!progress.next || progress.remaining == null) {
    line = LOYALTY_COPY.bookingTop(pts);
  } else if (pts >= progress.remaining) {
    // Name the highest tier this booking reaches (may skip one).
    line = LOYALTY_COPY.bookingCrossing(pts, TIER_LABELS[tierForPoints(points + pts, config.thresholds)]);
  } else {
    line = LOYALTY_COPY.bookingNormal(pts, TIER_LABELS[progress.next], progress.remaining - pts);
  }
  if (compact) {
    return (
      <View style={[s.compact, style]}>
        <Feather name="award" size={14} color={SHADES.amberDeep} />
        <Text style={s.compactText}><Text style={s.bold}>{line.bold}</Text>{line.rest}</Text>
      </View>
    );
  }
  return (
    <View style={[s.box, style]}>
      <Feather name="award" size={18} color="#B07A12" />
      <Text style={s.text}>
        <Text style={s.bold}>{line.bold}</Text>{line.rest}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#F7ECD9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '500', color: '#3D2E12', lineHeight: 20 },
  bold: { fontWeight: '800' },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  compactText: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.amberDeep, lineHeight: 18 },
});
