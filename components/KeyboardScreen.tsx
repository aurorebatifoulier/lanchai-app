import React from 'react';
import { KeyboardAvoidingView, Platform, View, type ViewProps } from 'react-native';

// Root of a screen with text fields: on iOS the keyboard covers the bottom of the screen,
// so the content is padded up ('padding', the convention of every other form screen); on
// Android the window already resizes — a plain View (same as `behavior={undefined}`).
export default function KeyboardScreen({ children, ...rest }: ViewProps) {
  if (Platform.OS !== 'ios') return <View {...rest}>{children}</View>;
  return <KeyboardAvoidingView behavior="padding" {...rest}>{children}</KeyboardAvoidingView>;
}
