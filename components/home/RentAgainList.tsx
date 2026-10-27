import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { RailHeader } from '@/components/home/RailHeader';
import { ProductThumb } from '@/components/home/ProductThumb';
import type { RentAgainRow } from '@/lib/homeData';

const MAX_ROWS = 3;
const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Vientiane' });

// Home "Rent again" (validated mockup): a compact list in one white card, 3 rows max —
// thumbnail, name, "Last rented {date}", amber "Rent again" → the product page.
export default function RentAgainList({ rows }: { rows: RentAgainRow[] }) {
  const router = useRouter();
  if (rows.length === 0) return null;
  return (
    <View>
      <RailHeader title={HOME_COPY.rentAgainTitle} />
      <View style={[UI.card, s.card]}>
        {rows.slice(0, MAX_ROWS).map(({ product, lastMs }, i) => {
          const open = () => router.push(`/product/${product.id}`);
          return (
            <TouchableOpacity key={product.id} style={[s.row, i > 0 && s.sep]} onPress={open} activeOpacity={0.75}>
              <ProductThumb product={product} size={44} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={UI.title} numberOfLines={1}>{product.name}</Text>
                {lastMs > 0 && <Text style={UI.subtitle}>{HOME_COPY.lastRented(fmtDay(lastMs))}</Text>}
              </View>
              <TouchableOpacity style={s.btn} onPress={open} activeOpacity={0.85}>
                <Text style={s.btnText}>{HOME_COPY.rentAgainButton}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sep: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  btn: { backgroundColor: SHADES.amber, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { fontSize: 13, fontWeight: '700', color: SHADES.carbon },
});
