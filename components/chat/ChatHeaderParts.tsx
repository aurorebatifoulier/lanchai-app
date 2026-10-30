import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { CHAT_COPY } from '@/constants/chatCopy';
import { categoryStyle } from '@/constants/categoryStyle';
import PressScale from '@/components/PressScale';

/** The real LANCHAI bee logo (same asset as the Home header) in a round avatar. */
export function ChatMark({ size = 40 }: { size?: number }) {
  return (
    <View style={[s.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* The asset has generous margins — scaled up so the bee fills the circle. */}
      <Image source={LOGO} style={{ width: size * 1.45, height: size * 1.45 }} contentFit="contain" />
    </View>
  );
}

const LOGO = require('@/assets/images/lanchai-logo.png');

/** Pinned "About" card (chat opened from a product or a rental) → View. */
export function ContextCard({ name, image, category, onView }: {
  name: string; image?: string | null; category?: string | null; onView: () => void;
}) {
  const cat = category ? categoryStyle(category) : null;
  return (
    <PressScale style={s.card} onPress={onView}>
      <View style={s.thumb}>
        {image
          ? <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          : <MaterialCommunityIcons name={cat?.icon ?? 'package-variant-closed'} size={24} color={SHADES.carbonMuted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.about}>{CHAT_COPY.about}</Text>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
      </View>
      <Text style={s.view}>{CHAT_COPY.view}</Text>
    </PressScale>
  );
}

/** Quick question chips — tap sends the question. */
export function QuickQuestions({ questions, onAsk }: { questions: readonly string[]; onAsk: (q: string) => void }) {
  return (
    <View style={s.chips}>
      {questions.map(q => (
        <PressScale key={q} style={s.chip} onPress={() => onAsk(q)}>
          <Text style={s.chipText}>{q}</Text>
        </PressScale>
      ))}
    </View>
  );
}

/** "Usually replies within a few hours" — one line (ellipsis as a last resort). */
export function ReplyLine() {
  return (
    <View style={s.replyRow}>
      <View style={s.dot} />
      <Text style={s.reply} numberOfLines={1} ellipsizeMode="tail">{CHAT_COPY.replies}</Text>
    </View>
  );
}

export const ReadMark = () => <Text style={s.read}>{CHAT_COPY.read}</Text>;

const s = StyleSheet.create({
  mark: { backgroundColor: SHADES.cream, borderWidth: 0.5, borderColor: SHADES.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18,
    backgroundColor: SHADES.white, borderWidth: 0.5, borderColor: SHADES.border,
  },
  thumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center' },
  about: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  name: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, marginTop: 1 },
  view: { fontSize: 15, fontWeight: '700', color: SHADES.amberText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white },
  chipText: { fontSize: 14, fontWeight: '500', color: SHADES.carbon },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SHADES.amber },
  reply: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  read: { fontSize: 11.5, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'right', marginTop: -2, marginBottom: 4 },
});
