import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { ProductThumb } from '@/components/home/ProductThumb';
import type { Product } from '@/lib/mockData';
import PressScale from '@/components/PressScale';

// Home "Most rented" podium (validated mockup): top 3 shown 2 – 1 – 3, centre highest.
// 1 = amber, 2 = light amber (dark amber number), 3 = carbon (amber number).
const STEPS = [
  { rank: 2, height: 78, bg: SHADES.amberLight, fg: SHADES.amberDeep, img: 56 },
  { rank: 1, height: 108, bg: SHADES.amber, fg: SHADES.carbon, img: 64 },
  { rank: 3, height: 58, bg: SHADES.carbon, fg: SHADES.amber, img: 52 },
];

/** "Chicco travel cot" → "Travel cot": drops a leading brand word when the name is long. */
function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name;
  const rest = words.slice(1).join(' ');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export default function MostRentedPodium({ top }: { top: Product[] }) {
  const router = useRouter();
  const ordered = [top[1], top[0], top[2]];
  return (
    <View style={s.row}>
      {STEPS.map((st, i) => {
        const p = ordered[i];
        if (!p) return <View key={st.rank} style={s.col} />;
        return (
          <PressScale key={st.rank} style={s.col} onPress={() => router.push(`/product/${p.id}`)} activeOpacity={0.8}>
            <ProductThumb product={p} size={st.img} />
            <Text style={s.name} numberOfLines={2}>{shortName(p.name)}</Text>
            <View style={[s.block, { height: st.height, backgroundColor: st.bg }]}>
              <Text style={[s.rank, { color: st.fg }]}>{st.rank}</Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  col: { flex: 1, alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '600', color: SHADES.carbon, textAlign: 'center', marginTop: 8, marginBottom: 8, minHeight: 17 },
  block: { alignSelf: 'stretch', borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rank: { fontSize: 28, fontWeight: '800' },
});
