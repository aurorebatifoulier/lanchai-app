import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { ProductThumb } from '@/components/home/ProductThumb';
import type { Product } from '@/lib/mockData';
import type { WeekendWindow } from '@/lib/homeData';
import { toLak } from '@/utils/currency';

const THUMB = 104;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()}`;

// Home "Free this weekend" (validated mockup): products free for the whole weekend
// window, small square thumbnails (amber dot), tap → booking with the dates pre-filled.
export default function FreeWeekend({ products, win, exchangeRate }: { products: Product[]; win: WeekendWindow; exchangeRate: number | null }) {
  const router = useRouter();
  return (
    <View>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <SectionTitle style={s.title}>{HOME_COPY.freeWeekendTitle}</SectionTitle>
          <Text style={UI.subtitle}>{HOME_COPY.freeWeekendSub}</Text>
        </View>
        <View style={s.chip}>
          <Feather name="calendar" size={13} color={SHADES.amber} />
          <Text style={s.chipText}>{HOME_COPY.freeWeekendChip(fmt(win.pickupAt), fmt(win.returnAt))}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.rail}>
        {products.map(p => (
          <TouchableOpacity
            key={p.id}
            style={{ width: THUMB }}
            onPress={() => router.push({
              pathname: '/booking/new',
              params: { productId: p.id, pickupAt: String(win.pickupAt.getTime()), returnAt: String(win.returnAt.getTime()) },
            } as never)}
            activeOpacity={0.8}
          >
            <View style={s.thumbWrap}>
              <ProductThumb product={p} size={THUMB} radius={18} />
              <View style={s.dot} />
            </View>
            <Text style={s.name} numberOfLines={1}>{p.name}</Text>
            {exchangeRate != null && p.pricePerDay > 0 && (
              <Text style={UI.small}>{HOME_COPY.perDay(toLak(p.pricePerDay, exchangeRate).toLocaleString('en-US'))}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.hint}>
        <MaterialCommunityIcons name="gesture-tap" size={15} color={SHADES.amberDeep} />
        <Text style={s.hintText}>{HOME_COPY.freeWeekendHint}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 24, marginBottom: 12 },
  title: { marginTop: 0, marginBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SHADES.carbon, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700', color: SHADES.amber },
  scroll: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 12 },
  thumbWrap: { borderRadius: 18, borderWidth: 0.5, borderColor: SHADES.border, overflow: 'hidden' },
  dot: { position: 'absolute', top: 10, left: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: SHADES.amber },
  name: { fontSize: 14, fontWeight: '700', color: SHADES.carbon, marginTop: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  hintText: { fontSize: 12.5, fontWeight: '500', color: SHADES.amberDeep, flex: 1 },
});
