import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { TYPE } from '@/constants/typography';
import { CategoryBadge, UI } from '@/components/account/ui';
import { CATEGORY_CONFIG, MAX_CATEGORIES, categoryLabel } from '@/functions/src/shared/categories';

// Admin product form: every category (config order, internal "Other" last) as tappable
// bubbles in their own colours. Tap = add / remove. The FIRST selected one is the MAIN
// category (amber star) — changed with the "Main: … · Change" row only.
export default function CategoryPicker({ value, onChange, error }: {
  /** Selected ids, main first. */
  value: string[];
  onChange: (next: string[]) => void;
  error?: boolean;
}) {
  const [choosingMain, setChoosingMain] = useState(false);
  const full = value.length >= MAX_CATEGORIES;
  const main = value[0] ?? null;

  const toggle = (id: string) => {
    if (value.includes(id)) {
      const next = value.filter(x => x !== id);
      onChange(next);
      if (next.length < 2) setChoosingMain(false);
    } else if (!full) {
      onChange([...value, id]);
    }
  };
  const makeMain = (id: string) => {
    onChange([id, ...value.filter(x => x !== id)]);
    setChoosingMain(false);
  };

  return (
    <View>
      <View style={[s.grid, error && s.gridErr]}>
        {CATEGORY_CONFIG.map(c => {
          const on = value.includes(c.id);
          const disabled = !on && full;
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.item, disabled && s.disabled]}
              onPress={() => toggle(c.id)}
              disabled={disabled}
              activeOpacity={0.75}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={c.id === main ? `${c.label}, main category` : c.label}
              accessibilityHint={c.adminHint}
            >
              <View style={[s.ring, on && s.ringOn]}>
                <CategoryBadge cat={c.id} size={44} />
                {on && (
                  <View style={[s.mark, c.id === main && s.markMain]}>
                    <MaterialCommunityIcons name={c.id === main ? 'star' : 'check'} size={11} color={SHADES.carbon} />
                  </View>
                )}
              </View>
              <Text style={[s.label, on && s.labelOn]} numberOfLines={1}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {main && (
        <View style={s.mainRow}>
          <MaterialCommunityIcons name="star" size={14} color={SHADES.amberText} />
          <Text style={s.mainText}>Main: {categoryLabel(main)}</Text>
          {value.length > 1 && (
            <TouchableOpacity onPress={() => setChoosingMain(v => !v)} hitSlop={12} accessibilityRole="button">
              <Text style={UI.link}>{choosingMain ? ' · Done' : ' · Change'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {choosingMain && (
        <View style={s.mainChoices}>
          {value.map(id => (
            <TouchableOpacity
              key={id}
              style={[UI.choice, id === main && UI.choiceOn]}
              onPress={() => makeMain(id)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: id === main }}
            >
              <Text style={[UI.choiceText, id === main && UI.choiceTextOn]}>{categoryLabel(id)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={s.help}>
        The main category sets the colour and sticker. Up to {MAX_CATEGORIES}. “Other” is never shown to renters.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, borderRadius: 12, paddingVertical: 4 },
  gridErr: { borderWidth: 1, borderColor: COLORS.danger },
  item: { width: '25%', alignItems: 'center' },
  disabled: { opacity: 0.35 },
  ring: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: SHADES.carbon },
  mark: {
    position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9,
    backgroundColor: SHADES.white, borderWidth: 1, borderColor: SHADES.carbon,
    alignItems: 'center', justifyContent: 'center',
  },
  markMain: { backgroundColor: SHADES.amber },
  label: { ...TYPE.small, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 4 },
  labelOn: { fontWeight: '800', color: SHADES.carbon },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  mainText: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon },
  mainChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  help: { ...TYPE.small, color: SHADES.carbonMuted, marginTop: 8 },
});
