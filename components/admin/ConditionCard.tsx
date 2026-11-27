import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Text, TextInput } from '@/components/AppText';
import { UI } from '@/components/account/ui';
import { RATING_STYLE, RATING_LABELS } from '@/components/ChecklistSummary';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { TYPE } from '@/constants/typography';
import { askCamera } from '@/lib/mediaPermissions';
import { CHECKLIST_CATEGORIES, type ChecklistRating } from '@/lib/firestore';

// One item's condition checklist (Good / Fair / Damaged / Unusable per part, a note when
// not Good, photos) — the Condition step of BOTH the 3-step return (app/admin/return.tsx)
// and the 4-step pick-up (app/admin/pickup.tsx). No amounts here. State lives in the
// screen (nothing is uploaded before its last step).

export const RATINGS: ChecklistRating[] = ['good', 'fair', 'damaged', 'unusable'];

export interface ConditionState {
  ratings: Record<string, ChecklistRating | null>;
  notes: Record<string, string>;
  photos: string[]; // local uris
  units: number;
}
export const emptyCondition = (): ConditionState => ({
  ratings: Object.fromEntries(CHECKLIST_CATEGORIES.map(c => [c.id, null])),
  notes: {}, photos: [], units: 1,
});
export const conditionComplete = (it: ConditionState) => CHECKLIST_CATEGORIES.every(c => it.ratings[c.id] != null);
export const conditionNeedsPhoto = (it: ConditionState) => Object.values(it.ratings).some(r => r != null && r !== 'good');
export const conditionReady = (it: ConditionState) => conditionComplete(it) && (!conditionNeedsPhoto(it) || it.photos.length > 0);
export const worstCondition = (it: ConditionState): ChecklistRating =>
  (Object.values(it.ratings).filter(Boolean) as ChecklistRating[])
    .reduce<ChecklistRating>((w, r) => (RATINGS.indexOf(r) > RATINGS.indexOf(w) ? r : w), 'good');
/** The callable's checklist shape (photos = uploaded URLs). */
export const conditionPayload = (it: ConditionState, photos: string[]) => ({
  categories: Object.fromEntries(CHECKLIST_CATEGORIES.map(c => [c.id, {
    rating: it.ratings[c.id] as ChecklistRating,
    ...(it.notes[c.id]?.trim() ? { note: it.notes[c.id].trim() } : {}),
  }])),
  photos,
});

export function ConditionCard({ title, index, count, open, onToggle, state, onChange, reference, extra }: {
  title: string;
  /** Position in the order (shown when count > 1). */
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  state: ConditionState;
  onChange: (next: ConditionState) => void;
  /** Return: what was recorded at pick-up, per part ("At pick-up: Fair — scratch"). */
  reference?: Record<string, { rating: ChecklistRating; note?: string }> | null;
  /** Slot under the parts (the return's damaged-units stepper). */
  extra?: React.ReactNode;
}) {
  const it = state;
  const addPhoto = async (camera: boolean) => {
    if (camera && !(await askCamera()).granted) return;
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
    if (r.canceled) return;
    onChange({ ...it, photos: [...it.photos, ...r.assets.map(a => a.uri)].slice(0, 20) });
  };
  const needsPhoto = conditionNeedsPhoto(it);
  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={s.itemHead} disabled={count === 1}>
        <View style={{ flex: 1 }}>
          {count > 1 && <Text style={UI.small}>{`Item ${index + 1} of ${count}`}</Text>}
          <Text style={UI.title}>{title}</Text>
        </View>
        {conditionReady(it) && <Feather name="check-circle" size={18} color={COLORS.success} />}
        {count > 1 && <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.fg3} />}
      </TouchableOpacity>
      {open && (
        <View style={{ gap: 12 }}>
          {CHECKLIST_CATEGORIES.map(c => {
            const at = reference?.[c.id];
            return (
              <View key={c.id} style={s.cat}>
                <Text style={s.catLabel}>{c.label}</Text>
                {!!at && <Text style={UI.small}>{`At pick-up: ${RATING_LABELS[at.rating]}${at.note ? ` — ${at.note}` : ''}`}</Text>}
                <View style={s.chips}>
                  {RATINGS.map(rt => {
                    const on = it.ratings[c.id] === rt;
                    return (
                      <TouchableOpacity key={rt} activeOpacity={0.8}
                        style={[s.chip, on && { backgroundColor: RATING_STYLE[rt].bg, borderColor: RATING_STYLE[rt].bg }]}
                        onPress={() => onChange({ ...it, ratings: { ...it.ratings, [c.id]: rt } })}>
                        <Text style={[s.chipText, on && { color: RATING_STYLE[rt].text }]}>{RATING_LABELS[rt]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {it.ratings[c.id] != null && it.ratings[c.id] !== 'good' && (
                  <TextInput style={[UI.input, s.note]} value={it.notes[c.id] ?? ''} placeholder="What's wrong? (optional)"
                    placeholderTextColor={SHADES.carbonPlaceholder}
                    onChangeText={t => onChange({ ...it, notes: { ...it.notes, [c.id]: t } })} />
                )}
              </View>
            );
          })}
          {extra}
          <Text style={s.catLabel}>{needsPhoto ? 'Photos (required)' : 'Photos'}</Text>
          {it.photos.length > 0 && (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {it.photos.map(u => (
                <View key={u}>
                  <Image source={{ uri: u }} style={s.thumb} />
                  <TouchableOpacity style={s.remove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove photo"
                    onPress={() => onChange({ ...it, photos: it.photos.filter(x => x !== u) })}>
                    <Feather name="x" size={14} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={s.row}>
            <TouchableOpacity style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => addPhoto(true)} activeOpacity={0.85}>
              <Feather name="camera" size={16} color={SHADES.carbon} />
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => addPhoto(false)} activeOpacity={0.85}>
              <Feather name="image" size={16} color={SHADES.carbon} />
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>From photos</Text>
            </TouchableOpacity>
          </View>
          {needsPhoto && it.photos.length === 0 && (
            <Text style={UI.errorText}>A part isn’t in good condition: add at least one photo.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, marginTop: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cat: { gap: 6 },
  catLabel: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white },
  chipText: { ...TYPE.tab, color: SHADES.carbon },
  note: { height: 44 },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(30,30,30,0.7)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
});
