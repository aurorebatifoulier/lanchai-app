import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { EXPLORE_COPY } from '@/constants/exploreCopy';
import { UI, IconCircle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import WhyBuyCard from '@/components/home/WhyBuyCard';
import type { CollectionDoc } from '@/lib/collections';
import type { ReviewQuote } from '@/lib/reviewQuotes';
import type { WhyBuy } from '@/lib/homeData';

// Full-width "surprise" cards inserted in the Explore grid (validated mockup). Each one
// only renders with real data; the caller decides where (never in the first 4 items,
// never two in a row, none during a search).
export type Surprise =
  | { kind: 'collection'; collection: CollectionDoc }
  | { kind: 'review'; quote: ReviewQuote }
  | { kind: 'whyBuy'; pick: WhyBuy }
  | { kind: 'resident'; percent: number }
  | { kind: 'loyalty'; line: string };

export function SurpriseCard({ item }: { item: Surprise }) {
  const router = useRouter();
  const c = EXPLORE_COPY.surprise;
  switch (item.kind) {
    case 'collection':
      return (
        <PressScale style={[s.card, s.carbon]} onPress={() => router.push(`/collection/${item.collection.id}`)}>
          <Text style={s.kickerAmber}>{c.collectionsLabel}</Text>
          <View style={s.colRow}>
            <MaterialCommunityIcons name={item.collection.icon} size={30} color={SHADES.amber} />
            <View style={{ flex: 1 }}>
              <Text style={s.titleLight}>{item.collection.title}</Text>
              {!!item.collection.subtitle && <Text style={s.subLight}>{item.collection.subtitle}</Text>}
            </View>
            <Feather name="chevron-right" size={20} color={SHADES.amber} />
          </View>
        </PressScale>
      );
    case 'review':
      return (
        <PressScale style={[s.card, s.amber]} onPress={() => router.push(`/product/${item.quote.productId}`)}>
          <Text style={s.stars}>{'★'.repeat(Math.round(item.quote.rating))}</Text>
          <Text style={s.quote}>“{item.quote.text}”</Text>
          <Text style={s.by}>{c.reviewBy(item.quote.firstName, item.quote.productName)}</Text>
        </PressScale>
      );
    case 'whyBuy':
      return <WhyBuyCard pick={item.pick} />;
    case 'resident':
      return (
        <PressScale style={[UI.card, s.card, s.row]} onPress={() => router.push('/profile/id-residency')}>
          <IconCircle icon={{ name: 'home' }} tone="amber" size={48} />
          <View style={{ flex: 1 }}>
            <Text style={UI.title}>{c.residentTitle(item.percent)}</Text>
            <Text style={UI.subtitle}>{c.residentSub}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={SHADES.amberText} />
        </PressScale>
      );
    case 'loyalty':
      return (
        <PressScale style={[UI.card, s.card, s.row]} onPress={() => router.push('/profile/loyalty')}>
          <IconCircle icon={{ name: 'award' }} tone="amber" size={48} />
          <View style={{ flex: 1 }}>
            <Text style={UI.title}>{c.loyaltyTitle(item.line)}</Text>
            <Text style={UI.subtitle}>{c.loyaltySub}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={SHADES.amberText} />
        </PressScale>
      );
  }
}

/** End of the grid (and empty states): "Can't find it? Ask us." → the request flow. */
export function AskCard({ onPress }: { onPress: () => void }) {
  return (
    <PressScale style={[s.card, s.ask, s.row]} onPress={onPress}>
      <IconCircle icon={{ set: 'mci', name: 'message-question-outline' }} tone="amber" size={52} />
      <View style={{ flex: 1 }}>
        <Text style={s.askTitle}>{EXPLORE_COPY.ask.title}</Text>
        <Text style={UI.subtitle}>{EXPLORE_COPY.ask.sub}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={SHADES.amberText} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  carbon: { backgroundColor: SHADES.carbon },
  amber: { backgroundColor: SHADES.amberLight },
  kickerAmber: { fontSize: 13, fontWeight: '700', color: SHADES.amber, marginBottom: 10 },
  colRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleLight: { fontSize: 18, fontWeight: '800', color: SHADES.white },
  subLight: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 2 },
  stars: { fontSize: 16, color: SHADES.amberDeep, letterSpacing: 2 },
  quote: { fontSize: 19, fontWeight: '700', color: SHADES.carbon, lineHeight: 26, marginTop: 8 },
  by: { fontSize: 14, fontWeight: '500', color: SHADES.amberDeep, marginTop: 10 },
  ask: { backgroundColor: SHADES.white, borderWidth: 1, borderStyle: 'dashed', borderColor: SHADES.carbonFaint },
  askTitle: { fontSize: 16, fontWeight: '700', color: SHADES.carbon },
});
