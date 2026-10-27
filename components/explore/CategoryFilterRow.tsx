import React from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SHADES } from '@/constants/brandShades';
import { CategoryBadge } from '@/components/account/ui';
import PressScale from '@/components/PressScale';

// Explore category filter: "All" + the shared category circles, all visible on one row
// (scroll only beyond 7). Selected = amber circle + bold label.
export default function CategoryFilterRow({
  categories, active, onSelect,
}: {
  categories: readonly { id: string; name: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const fit = categories.length <= 7;
  const itemW = fit ? (width - 32) / categories.length : 64;
  const circle = Math.min(48, Math.floor(itemW - 6));
  const items = categories.map(c => (
    <PressScale key={c.id} style={[s.item, { width: itemW }]} onPress={() => onSelect(c.id)}>
      <CategoryBadge cat={c.id} size={circle} selected={active === c.id} />
      <Text style={[s.label, active === c.id && s.labelOn]} numberOfLines={1}>{c.name}</Text>
    </PressScale>
  ));
  return fit
    ? <View style={s.row}>{items}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false}>{items}</ScrollView>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
  item: { alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 6 },
  labelOn: { fontWeight: '800', color: SHADES.carbon },
});
