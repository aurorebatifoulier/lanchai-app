// Home search (Home only — Explore / Liked keep components/SearchBar.tsx): a stronger
// field (1.5px carbon border, soft shadow) + an amber square search button.
// `compact` (0 → 1, a Reanimated shared value driven by the Home scroll) shrinks it on the
// UI thread: field 52 → 40, text 14 → ~13 (a scale on the text block — no animated
// Text / TextInput: an animated fontSize on them crashed on reload in Expo Go), icons
// 20 → 18, button 46 → 40. Worklets read that shared value and plain numbers only.
// The placeholder is drawn as a one-line Text overlay so a long first name ends with
// "…" (Android's native TextInput placeholder is clipped, never ellipsized); the input
// keeps the full text as its accessibility label.
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Reanimated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/AppText';
import PressScale from '@/components/PressScale';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';

export default function HomeSearchBar({
  value, onChangeText, onSubmit, placeholder, compact,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** Keyboard "search" key and the amber button (empty query handled by the caller). */
  onSubmit: () => void;
  placeholder: string;
  /** 0 = full size, 1 = compact (scrolled). */
  compact: SharedValue<number>;
}) {
  const fieldStyle = useAnimatedStyle(() => ({
    height: interpolate(compact.value, [0, 1], [52, 40]),
    paddingHorizontal: interpolate(compact.value, [0, 1], [16, 14]),
  }));
  const btnStyle = useAnimatedStyle(() => {
    const size = interpolate(compact.value, [0, 1], [46, 40]);
    return { width: size, height: size };
  });
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(compact.value, [0, 1], [1, 0.9]) }], // 20 → 18
  }));
  // Text 14 → 13 as a scale from the left edge (layout unchanged, so the placeholder's
  // one-line "…" stays computed on the real width).
  const textStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(compact.value, [0, 1], [1, 13 / 14]) }],
  }));

  return (
    <View style={s.row}>
      <Reanimated.View style={[s.field, fieldStyle]}>
        <Reanimated.View style={iconStyle}>
          <Feather name="search" size={20} color={SHADES.carbon} />
        </Reanimated.View>
        <Reanimated.View style={[s.inputWrap, textStyle]}>
          {value.length === 0 && (
            <Text style={s.placeholder} numberOfLines={1} ellipsizeMode="tail" pointerEvents="none" importantForAccessibility="no">
              {placeholder}
            </Text>
          )}
          <TextInput
            style={s.input}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={placeholder}
          />
        </Reanimated.View>
        {value.length > 0 && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear"
            onPress={() => onChangeText('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={18} color={COLORS.fg2} />
          </TouchableOpacity>
        )}
      </Reanimated.View>
      <Reanimated.View style={btnStyle}>
        <PressScale style={s.btn} onPress={onSubmit} accessibilityRole="button" accessibilityLabel="Search"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Reanimated.View style={iconStyle}>
            <Feather name="search" size={20} color={SHADES.carbon} />
          </Reanimated.View>
        </PressScale>
      </Reanimated.View>
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
  inputWrap: { flex: 1, justifyContent: 'center', height: '100%', transformOrigin: 'left center' },
  placeholder: { ...TYPE.body, lineHeight: undefined, color: COLORS.fg2, position: 'absolute', left: 0, right: 0 },
  input: { ...TYPE.body, lineHeight: undefined, color: SHADES.carbon, padding: 0, height: '100%' },
  // Same radius as the old Explore filter button; size animated by the wrapper.
  btn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: SHADES.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
