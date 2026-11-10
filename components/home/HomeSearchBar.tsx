// Home search (Home only — Explore / Liked keep components/SearchBar.tsx): a stronger
// field (h52, 1.5px carbon border, soft shadow) + an amber square search button.
// The placeholder is drawn as a one-line Text overlay so a long first name ends with
// "…" (Android's native TextInput placeholder is clipped, never ellipsized); the input
// keeps the full text as its accessibility label.
// `compact` (Home scrolled) switches to smaller plain styles: field 52 → 40, text 14 →
// 13, icons 20 → 18, button 46 → 40 — the Home animates the switch with LayoutAnimation.
// No Reanimated here (and no PressScale, which uses it): see the Home sticky search notes.
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/AppText';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';

export default function HomeSearchBar({
  value, onChangeText, onSubmit, placeholder, compact = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** Keyboard "search" key and the amber button (empty query handled by the caller). */
  onSubmit: () => void;
  placeholder: string;
  /** Smaller sizes once the Home is scrolled. */
  compact?: boolean;
}) {
  const icon = compact ? 18 : 20;
  return (
    <View style={s.row}>
      <View style={[s.field, compact && s.fieldCompact]}>
        <Feather name="search" size={icon} color={SHADES.carbon} />
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
          />
        </View>
        {value.length > 0 && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear"
            onPress={() => onChangeText('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={18} color={COLORS.fg2} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[s.btn, compact && s.btnCompact]}
        onPress={onSubmit}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Search"
        hitSlop={compact ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
      >
        <Feather name="search" size={icon} color={SHADES.carbon} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: SHADES.white,
    borderWidth: 1.5,
    borderColor: SHADES.carbon,
    // Soft lift (elevation = Android, shadow* = iOS).
    shadowColor: SHADES.carbon,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fieldCompact: { height: 40, paddingHorizontal: 14 },
  inputWrap: { flex: 1, justifyContent: 'center', height: '100%' },
  placeholder: { ...TYPE.body, color: COLORS.fg2, position: 'absolute', left: 0, right: 0 },
  input: { ...TYPE.body, color: SHADES.carbon, padding: 0, height: '100%' },
  textCompact: { fontSize: 13, lineHeight: 18 },
  // Same size / radius as the old Explore filter button.
  btn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: SHADES.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCompact: { width: 40, height: 40, borderRadius: 12 },
});
