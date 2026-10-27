import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { ProductThumb } from '@/components/home/ProductThumb';
import type { Product } from '@/lib/mockData';
import { toLak } from '@/utils/currency';
import PressScale from '@/components/PressScale';

// Home "Under {X} LAK a day" (validated mockup): light-amber card, 2×2 mini cards
// (thumbnail, name, price in an amber chip). 4 shown, or 2 when only 2–3 match.
export default function BudgetPicks({ products, thresholdLak, exchangeRate }: { products: Product[]; thresholdLak: number; exchangeRate: number | null }) {
  const router = useRouter();
  const shown = products.slice(0, products.length >= 4 ? 4 : 2);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{HOME_COPY.budgetLabel}</Text>
          <Text style={s.title}>{HOME_COPY.budgetTitle(thresholdLak.toLocaleString('en-US'))}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/explore', params: { maxPrice: String(thresholdLak) } } as never)}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={[UI.link, { color: SHADES.amberDeep }]}>{HOME_COPY.seeAll}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.grid}>
        {shown.map(p => (
          <PressScale key={p.id} style={s.mini} onPress={() => router.push(`/product/${p.id}`)} activeOpacity={0.85}>
            <View style={s.thumbBox}>
              <ProductThumb product={p} size={64} radius={12} fill />
            </View>
            <Text style={s.name} numberOfLines={1}>{p.name}</Text>
            {exchangeRate != null && (
              <View style={s.price}>
                <Text style={s.priceText}>{toLak(p.pricePerDay, exchangeRate).toLocaleString('en-US')}</Text>
              </View>
            )}
          </PressScale>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: SHADES.amberLight, borderRadius: 18, padding: 16, marginTop: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: SHADES.amberDeep },
  title: { fontSize: 20, fontWeight: '800', color: SHADES.carbon, marginTop: 2, letterSpacing: -0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  mini: { width: '48.5%', backgroundColor: SHADES.white, borderRadius: 16, padding: 10 },
  thumbBox: { height: 78, borderRadius: 12, overflow: 'hidden' },
  name: { fontSize: 14, fontWeight: '600', color: SHADES.carbon, marginTop: 8 },
  price: { alignSelf: 'flex-start', backgroundColor: SHADES.amber, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  priceText: { fontSize: 12.5, fontWeight: '700', color: SHADES.carbon },
});
