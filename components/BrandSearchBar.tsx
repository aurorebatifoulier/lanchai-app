// The brand search field, SHARED by Home and Explore so they can't drift apart (Liked
// keeps components/SearchBar.tsx with its filter button): ONE full-width WHITE field (h52,
// radius 14), 1.5px carbon border, soft shadow, magnifier in the exact logo yellow
// COLORS.amber #F4B400 (deliberate: 1.85:1 on white, decorative — the carbon border and
// the fg2 placeholder, ~8.9:1, identify the field), fg2 clear icon, carbon text. No
// search button: the keyboard "search" key calls `onSubmit` (Home → Explore); Explore
// searches live and passes none.
// The placeholder is drawn as a one-line Text overlay so a long first name ends with
// "…" (Android's native TextInput placeholder is clipped, never ellipsized); the input
// keeps the full text as its accessibility label.
// `compact` (Home scrolled; Explore never sets it) switches to smaller plain styles: field
// 52 → 40, text 14 → 13, icon 20 → 18 — the Home animates the switch with LayoutAnimation.
// Clear (x): a REAL 40px-wide, full-height touch target inside the field (Android ignores
// hitSlop outside the parent, and an 18px target let taps land on the input), focus kept
// in the field after clearing.
// No Reanimated here: see the Home sticky search notes.
import React, { useRef } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/AppText';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';

export default function BrandSearchBar({
  value, onChangeText, onSubmit, placeholder, compact = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** Keyboard "search" key (empty query handled by the caller). Optional: live search. */
  onSubmit?: () => void;
  placeholder: string;
  /** Smaller sizes once the Home is scrolled. */
  compact?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const clear = () => {
    onChangeText('');
    inputRef.current?.focus();
  };
  return (
    <View style={[s.field, compact && s.fieldCompact]}>
      <Feather name="search" size={compact ? 18 : 20} color={COLORS.amber} />
      <View style={s.inputWrap}>
        {value.length === 0 && (
          <Text style={[s.placeholder, compact && s.textCompact]} numberOfLines={1} ellipsizeMode="tail" pointerEvents="none" importantForAccessibility="no">
            {placeholder}
          </Text>
        )}
        <TextInput
          ref={inputRef}
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
          onPress={clear}
          style={s.clear}
          activeOpacity={0.6}
        >
          <Feather name="x" size={18} color={COLORS.fg2} />
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
  // 40px wide × the field's full inner height; the negative margin eats into the field's
  // right padding so the 18px icon stays where it was (centred ~25px / ~23px compact from
  // the edge).
  clear: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginRight: -11, marginLeft: -6 },
});
