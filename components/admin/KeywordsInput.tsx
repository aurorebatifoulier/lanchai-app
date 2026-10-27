import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { normalize } from '@/lib/search';
import { SEARCH_LIMITS } from '@/lib/searchVocabulary';

/** Lowercase, accents removed, single spaces, ≤ 30 chars — how keywords are stored. */
export function cleanKeyword(raw: string): string {
  return normalize(raw).slice(0, SEARCH_LIMITS.termLength).trim();
}

// Product keywords (search): chips, type + Enter (or comma) to add, tap a chip to remove.
// "Suggested" row = name words + the category's vocabulary group; tap one or "Add all".
export default function KeywordsInput({
  keywords, onChange, suggestions,
}: {
  keywords: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState('');
  const full = keywords.length >= SEARCH_LIMITS.keywords;
  const add = (raw: string[]) => {
    const next = [...keywords];
    for (const r of raw) {
      const k = cleanKeyword(r);
      if (k && !next.includes(k) && next.length < SEARCH_LIMITS.keywords) next.push(k);
    }
    onChange(next);
  };
  const commit = () => {
    if (!draft.trim()) return;
    add(draft.split(','));
    setDraft('');
  };
  const pending = suggestions.map(cleanKeyword).filter(s => s && !keywords.includes(s));

  return (
    <View>
      <View style={s.chips}>
        {keywords.map(k => (
          <TouchableOpacity key={k} style={s.chip} onPress={() => onChange(keywords.filter(x => x !== k))} activeOpacity={0.7}>
            <Text style={s.chipText}>{k}</Text>
            <Feather name="x" size={12} color={SHADES.carbonMuted} />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={s.input}
        value={draft}
        onChangeText={t => (t.endsWith(',') ? (add([t.slice(0, -1)]), setDraft('')) : setDraft(t))}
        onSubmitEditing={commit}
        onBlur={commit}
        blurOnSubmit={false}
        editable={!full}
        placeholder={full ? `Maximum ${SEARCH_LIMITS.keywords} keywords` : 'Add a keyword, then Enter'}
        placeholderTextColor={SHADES.carbonFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />
      {pending.length > 0 && !full && (
        <View style={{ marginTop: 10 }}>
          <View style={s.sugHead}>
            <Text style={s.sugLabel}>Suggested</Text>
            <TouchableOpacity onPress={() => add(pending)} hitSlop={8}>
              <Text style={s.addAll}>Add all</Text>
            </TouchableOpacity>
          </View>
          <View style={s.chips}>
            {pending.map(k => (
              <TouchableOpacity key={k} style={[s.chip, s.sugChip]} onPress={() => add([k])} activeOpacity={0.7}>
                <Feather name="plus" size={12} color={SHADES.amberDeep} />
                <Text style={[s.chipText, { color: SHADES.amberDeep }]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <Text style={s.hint}>{keywords.length}/{SEARCH_LIMITS.keywords} · used by the app search (with the search vocabulary).</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SHADES.carbonLight, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  sugChip: { backgroundColor: SHADES.amberPale },
  input: {
    marginTop: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
    paddingHorizontal: 12, fontSize: 14, color: SHADES.carbon,
  },
  sugHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sugLabel: { fontSize: 12, fontWeight: '700', color: SHADES.carbonMuted },
  addAll: { fontSize: 12, fontWeight: '700', color: SHADES.amberText },
  hint: { fontSize: 11.5, color: SHADES.carbonMuted, marginTop: 6 },
});
