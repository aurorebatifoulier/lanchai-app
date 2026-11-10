// Home search (Home only — Explore / Liked keep components/SearchBar.tsx): ONE full-width
// CARBON field (~16:1 against the porcelain page), no border, soft shadow, brand amber
// magnifier (~9:1), carbonFaint placeholder + clear icon (~8.2:1), cream text (~16:1),
// amber cursor / translucent amber selection. No search button: the keyboard "search"
// key submits.
// The placeholder is drawn as a one-line Text overlay so a long first name ends with
// "…" (Android's native TextInput placeholder is clipped, never ellipsized); the input
// keeps the full text as its accessibility label.
// `compact` (Home scrolled) switches to smaller plain styles: field 52 → 40, text 14 →
// 13, icon 20 → 18 — the Home animates the switch with LayoutAnimation.
// No Reanimated here: see the Home sticky search notes.
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';

// Selection highlight / iOS caret tint: brand amber, translucent so selected cream text
// stays readable (Android draws the caret with cursorColor, solid amber).
const SELECTION = 'rgba(244,180,0,0.45)';

export default function HomeSearchBar({
  value, onChangeText, onSubmit, placeholder, compact = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** Keyboard "search" key (empty query handled by the caller). */
  onSubmit: () => void;
  placeholder: string;
  /** Smaller sizes once the Home is scrolled. */
  compact?: boolean;
}) {
  return (
    <View style={[s.field, compact && s.fieldCompact]}>
      <Feather name="search" size={compact ? 18 : 20} color={SHADES.amber} />
      <View style={s.inputWrap}>
        {value.length === 0 && (
          <Text style={[s.placeholder, compact && s.textCompact]} numberOfLines={1} ellipsizeMode="tail" pointerEvents="none" importantForAccessibility="no">
            {placeholder}
          </Text>
        )}
        <TextInput
          style={[s.input, compact && s.textCompact]}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={placeholder}
          cursorColor={SHADES.amber}
          selectionColor={SELECTION}
        />
      </View>
      {value.length > 0 && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear"
          onPress={() => onChangeText('')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={18} color={SHADES.carbonFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: SHADES.carbon,
    // Soft lift (elevation = Android, shadow* = iOS).
    shadowColor: SHADES.carbon,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fieldCompact: { height: 40, paddingHorizontal: 14 },
  inputWrap: { flex: 1, justifyContent: 'center', height: '100%' },
  placeholder: { ...TYPE.body, color: SHADES.carbonFaint, position: 'absolute', left: 0, right: 0 },
  input: { ...TYPE.body, color: SHADES.cream, padding: 0, height: '100%' },
  textCompact: { fontSize: 13, lineHeight: 18 },
});
