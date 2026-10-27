import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { COLLECTION_TILE, type CollectionDoc } from '@/lib/collections';
import { RailHeader } from '@/components/home/RailHeader';

// Home "Got plans?" (validated mockup): 2-column grid of large tiles in the collection's
// shade — big icon, title, one short line. 4 tiles max, "See all" shows the rest inline.
const MAX = 4;

export default function CollectionTiles({ collections }: { collections: CollectionDoc[] }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  if (collections.length === 0) return null;
  const shown = all ? collections : collections.slice(0, MAX);
  return (
    <View>
      <RailHeader
        title={HOME_COPY.collectionsTitle}
        onSeeAll={!all && collections.length > MAX ? () => setAll(true) : undefined}
      />
      <View style={s.grid}>
        {shown.map(c => {
          const t = COLLECTION_TILE[c.shade] ?? COLLECTION_TILE.carbonLight;
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.tile, { backgroundColor: t.bg }]}
              onPress={() => router.push(`/collection/${c.id}`)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name={c.icon} size={30} color={t.icon} />
              <View style={{ marginTop: 'auto' }}>
                <Text style={[s.title, { color: t.title }]} numberOfLines={2}>{c.title}</Text>
                {!!c.subtitle && <Text style={[UI.subtitle, { color: t.sub }]} numberOfLines={2}>{c.subtitle}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48.4%', minHeight: 150, borderRadius: 18, padding: 16, gap: 18 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 21, letterSpacing: -0.2 },
});
