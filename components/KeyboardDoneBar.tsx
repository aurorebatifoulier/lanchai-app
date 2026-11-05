import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, DONE_BAR_ID } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';

// The "Done" bar above iOS numeric keyboards (phone, amounts, quantities) — see
// DONE_BAR_ID in components/AppText.tsx. Mounted ONCE in app/_layout.tsx; nothing on Android.
export default function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={DONE_BAR_ID}>
      <View style={s.bar}>
        <Pressable onPress={Keyboard.dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close the keyboard">
          <Text style={s.done}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.cream, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SHADES.border,
  },
  done: { ...TYPE.button, color: SHADES.carbon },
});
