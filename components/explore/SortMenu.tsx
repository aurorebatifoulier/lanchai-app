// Explore's sort-only menu, opened from the "Popular ▾" / "Best match ▾" link above the
// grid. The backdrop is a SIBLING of the card (never its parent Pressable).
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { UI } from '@/components/account/ui';
import { EXPLORE_COPY } from '@/constants/exploreCopy';
import type { SortOption } from '@/lib/filterConfig';

const OPTIONS: SortOption[] = ['popular', 'price-asc', 'price-desc', 'newest'];

export default function SortMenu({
  visible, value, popularLabel, onSelect, onClose,
}: {
  visible: boolean;
  value: SortOption;
  /** "Popular", or "Best match" during a search (relevance order). */
  popularLabel: string;
  onSelect: (sort: SortOption) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[UI.card, s.card]}>
          <Text style={s.title}>{EXPLORE_COPY.sort.title}</Text>
          {OPTIONS.map(o => {
            const selected = o === value;
            return (
              <Pressable
                key={o}
                style={s.row}
                onPress={() => { onSelect(o); onClose(); }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[s.label, selected && s.labelOn]}>{o === 'popular' ? popularLabel : EXPLORE_COPY.sort[o]}</Text>
                {selected && <Feather name="check" size={18} color={SHADES.amberText} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.45)' },
  card: { paddingVertical: 8, paddingHorizontal: 16 },
  title: { ...TYPE.sectionTitle,color: SHADES.carbon, paddingVertical: 10 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...TYPE.body, color: SHADES.carbon },
  labelOn: { fontWeight: '700' },
});
