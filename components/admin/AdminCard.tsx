import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { COLORS } from '@/constants/Colors';
import type { AdminSection } from '@/constants/adminSections';

// One admin entry card (dashboard + Tools screen): icon, title, sub-line, optional red
// count pill, chevron.
export default function AdminCard({ item, badge, onPress }: {
  item: Pick<AdminSection, 'icon' | 'title' | 'sub'>; badge?: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.82}
      accessibilityRole="button" accessibilityLabel={badge ? `${item.title}, ${badge}` : item.title}>
      <View style={s.iconBox}>
        <Feather name={item.icon} size={22} color={COLORS.carbon} />
      </View>
      <View style={s.body}>
        <Text style={s.title}>{item.title}</Text>
        <Text style={s.sub}>{item.sub}</Text>
      </View>
      {!!badge && badge > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      <Feather name="chevron-right" size={18} color={COLORS.fg3} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.softGray200,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.carbon, marginBottom: 2 },
  sub: { fontSize: 13, fontWeight: '500', color: COLORS.fg3 },
  badge: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: COLORS.white },
});
