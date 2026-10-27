import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { shadeOf, type CollectionDoc } from '@/lib/collections';

// Home "Got plans?" — horizontal white cards (icon circle, title, one witty line), tap →
// the collection screen. Only collections with at least one visible product are passed in.
export default function CollectionCards({ collections }: { collections: CollectionDoc[] }) {
  const router = useRouter();
  if (collections.length === 0) return null;
  return (
    <View>
      <SectionTitle>{HOME_COPY.collectionsTitle}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.rail}>
        {collections.map(c => {
          const shade = shadeOf(c);
          return (
            <TouchableOpacity key={c.id} style={[UI.card, s.card]} onPress={() => router.push(`/collection/${c.id}`)} activeOpacity={0.85}>
              <View style={[s.circle, { backgroundColor: shade.bg }]}>
                <MaterialCommunityIcons name={c.icon} size={22} color={shade.fg} />
              </View>
              <Text style={s.title} numberOfLines={2}>{c.title}</Text>
              {!!c.subtitle && <Text style={UI.subtitle} numberOfLines={3}>{c.subtitle}</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 12 },
  card: { width: 170, padding: 16 },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, lineHeight: 20 },
});
