import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { COLLECTION_TILE, type CollectionDoc } from '@/lib/collections';
import { RailHeader } from '@/components/home/RailHeader';
import PressScale from '@/components/PressScale';
import { SHADES } from '@/constants/brandShades';

// Home "Got plans?" (validated mockup): 2-column grid of large tiles in the collection's
// shade — big icon, title, one short line. 4 tiles max, "See all" shows the rest inline.
// Odd count (incl. a single collection): the LAST tile takes the full width — never a
// half-empty row. Also the Home "Packs" section (title + a "−5%" chip per pack tile).
const MAX = 4;

export default function CollectionTiles({ collections, title = HOME_COPY.collectionsTitle, badge }: {
  collections: CollectionDoc[];
  title?: string;
  /** Small chip on a tile (packs: "−5%"), null = none. */
  badge?: (c: CollectionDoc) => string | null;
}) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  if (collections.length === 0) return null;
  const shown = all ? collections : collections.slice(0, MAX);
  return (
    <View>
      <RailHeader
        title={title}
        onSeeAll={!all && collections.length > MAX ? () => setAll(true) : undefined}
      />
      <View style={s.grid}>
        {shown.map((c, i) => {
          const t = COLLECTION_TILE[c.shade] ?? COLLECTION_TILE.carbonLight;
          const wide = shown.length % 2 === 1 && i === shown.length - 1;
          return (
            <PressScale
              key={c.id}
              style={[s.tile, wide && s.tileWide, { backgroundColor: t.bg }]}
              onPress={() => router.push(`/collection/${c.id}`)}
              activeOpacity={0.85}
            >
              <View style={s.top}>
                <MaterialCommunityIcons name={c.icon} size={30} color={t.icon} />
                {!!badge?.(c) && <View style={s.badge}><Text style={s.badgeText}>{badge(c)}</Text></View>}
              </View>
              <View style={{ marginTop: 'auto' }}>
                <Text style={[s.title, { color: t.title }]} numberOfLines={2}>{c.title}</Text>
                {!!c.subtitle && <Text style={[UI.subtitle, { color: t.sub }]} numberOfLines={2}>{c.subtitle}</Text>}
              </View>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48.4%', minHeight: 150, borderRadius: 18, padding: 16, gap: 18 },
  tileWide: { width: '100%', minHeight: 130 },
  title: { fontSize: 15, fontWeight: '800', lineHeight: 19, letterSpacing: -0.2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  badge: { backgroundColor: SHADES.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700', color: SHADES.carbon },
});
