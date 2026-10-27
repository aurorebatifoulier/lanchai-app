import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import type { WhyBuy } from '@/lib/homeData';
import PressScale from '@/components/PressScale';

const n = (v: number) => Math.round(v).toLocaleString('en-US');

// Home "Why buy it?" (validated mockup): carbon card with a real comparison — the
// renter's own most-rented product, or a catalogue example. Tap → the product.
export default function WhyBuyCard({ pick }: { pick: WhyBuy }) {
  const router = useRouter();
  const line2 = pick.kind === 'mine'
    ? HOME_COPY.whyBuyMine(pick.times, n(pick.paidLak))
    : HOME_COPY.whyBuyCatalogue(n(pick.perDayLak));
  const kicker = pick.kind === 'mine' ? HOME_COPY.whyBuyMineKicker : HOME_COPY.whyBuyCatalogueKicker;
  return (
    <PressScale style={[UI.card, s.card]} onPress={() => router.push(`/product/${pick.product.id}`)} activeOpacity={0.9}>
      <Text style={s.label}>{HOME_COPY.whyBuyLabel}</Text>
      <Text style={s.big}>{HOME_COPY.whyBuyCosts(pick.product.name, n(pick.retailLak))}</Text>
      <Text style={s.big}>{line2}</Text>
      <Text style={s.kicker}>{kicker}</Text>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon, padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: SHADES.amber, marginBottom: 8 },
  big: { fontSize: 19, fontWeight: '800', color: SHADES.white, lineHeight: 25, letterSpacing: -0.2 },
  kicker: { fontSize: 14, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 10 },
});
