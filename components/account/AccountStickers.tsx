import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { CATEGORIES } from '@/lib/mockData';

// "Your stickers" (validated mockup): one round sticker per category with a RETURNED
// rental, slightly rotated, alternating amber / carbon shades, then ONE locked sticker
// for the next category not rented yet. Hidden for renters with no returned rental.
type Icon = { set: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }
  | { set: 'feather'; name: React.ComponentProps<typeof Feather>['name'] };

const ICONS: Record<string, Icon> = {
  outdoor: { set: 'mci', name: 'tent' },
  tools: { set: 'feather', name: 'tool' },
  fun: { set: 'mci', name: 'music' },
  sports: { set: 'mci', name: 'basketball' },
  kids: { set: 'mci', name: 'baby-carriage' },
  home: { set: 'feather', name: 'home' },
};
const STYLES = [
  { bg: SHADES.amberLight, fg: SHADES.amberDeep },
  { bg: SHADES.carbon, fg: SHADES.amber },
  { bg: SHADES.amberMid, fg: SHADES.carbon },
];
const ROTATIONS = ['-6deg', '4deg', '-3deg', '6deg', '-5deg', '3deg'];

export function AccountStickers({ stickers, next }: { stickers: string[]; next: string | null }) {
  if (stickers.length === 0) return null;
  const nextName = next ? CATEGORIES.find(c => c.id === next)?.name ?? next : null;
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{ACCOUNT_COPY.stickersTitle}</Text>
      <View style={s.grid}>
        {stickers.map((cat, i) => {
          const st = STYLES[i % STYLES.length];
          const icon = ICONS[cat];
          return (
            <View key={cat} style={s.item}>
              <View style={[s.sticker, { backgroundColor: st.bg, transform: [{ rotate: ROTATIONS[i % ROTATIONS.length] }] }]}>
                {icon?.set === 'feather'
                  ? <Feather name={icon.name} size={30} color={st.fg} />
                  : <MaterialCommunityIcons name={icon?.set === 'mci' ? icon.name : 'star-outline'} size={32} color={st.fg} />}
              </View>
              <Text style={s.label}>{ACCOUNT_COPY.stickerNames[cat] ?? cat}</Text>
            </View>
          );
        })}
        {nextName && (
          <View style={s.item}>
            <View style={[s.sticker, s.locked]}><Text style={s.q}>?</Text></View>
            <Text style={[s.label, s.lockedLabel]}>{ACCOUNT_COPY.stickerLocked(nextName)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 22 },
  title: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  item: { width: '25%', alignItems: 'center' },
  sticker: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  locked: { borderWidth: 2, borderStyle: 'dashed', borderColor: SHADES.carbonFaint, backgroundColor: 'transparent' },
  q: { fontSize: 24, fontWeight: '600', color: SHADES.carbonFaint },
  label: { fontSize: 12.5, fontWeight: '600', color: SHADES.carbon, textAlign: 'center', marginTop: 8, paddingHorizontal: 2, lineHeight: 16 },
  lockedLabel: { color: SHADES.carbonMuted, fontWeight: '500' },
});
