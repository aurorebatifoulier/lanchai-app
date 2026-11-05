import React, { forwardRef } from 'react';
import {
  Platform,
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps,
  type TextInputProps,
} from 'react-native';
import { MAX_FONT_SCALE } from '@/constants/typography';

// The app's <Text> / <TextInput>: react-native's, with the system font size CAPPED at
// MAX_FONT_SCALE (maxFontSizeMultiplier) unless a caller sets its own. Every screen and
// component imports Text / TextInput from HERE, never from 'react-native' (a global
// patch of RN's modules can't work in Expo Go — their exports are getters).
// Same names as RN's, value AND type, so `useRef<TextInput>(null)` keeps working.

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} ref={ref} />;
});
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Text = RNText;

// iOS numeric keyboards have no return key, so the keyboard could never be closed: every
// numeric field gets the shared "Done" bar (<KeyboardDoneBar>, mounted once in app/_layout).
export const DONE_BAR_ID = 'lanchai-keyboard-done';
const NO_RETURN_KEY = new Set(['number-pad', 'phone-pad', 'decimal-pad', 'numeric']);

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const doneBar = Platform.OS === 'ios' && NO_RETURN_KEY.has(props.keyboardType ?? '') ? DONE_BAR_ID : undefined;
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} inputAccessoryViewID={doneBar} {...props} ref={ref} />;
});
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type TextInput = RNTextInput;
