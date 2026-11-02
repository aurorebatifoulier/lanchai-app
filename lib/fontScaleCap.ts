import React from 'react';
import { MAX_FONT_SCALE } from '@/constants/typography';

// Caps the system font size for EVERY <Text> / <TextInput> (maxFontSizeMultiplier =
// MAX_FONT_SCALE unless a screen sets its own). React 19 ignores defaultProps on function
// components (Text is one since RN 0.81), so the module's `default` export is wrapped:
// react-native's index reads `require('./Libraries/Text/Text').default` on every access,
// and RN's own components read `_Text.default` at render time, so they all get the
// wrapper. Imported FIRST in app/_layout.tsx. Animated.Text created before this runs keeps
// the system scale (a handful of decorative texts only).

type AnyProps = Record<string, unknown>;

function cap(modulePath: 'text' | 'input') {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mod = modulePath === 'text'
    ? require('react-native/Libraries/Text/Text')
    : require('react-native/Libraries/Components/TextInput/TextInput');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Original = mod.default;
  if (!Original || Original.__fontScaleCapped) return;
  const Capped = (props: AnyProps) =>
    React.createElement(Original, props.maxFontSizeMultiplier === undefined
      ? { ...props, maxFontSizeMultiplier: MAX_FONT_SCALE }
      : props);
  // Keep the statics (TextInput.State, displayName…).
  Object.assign(Capped, Original, { displayName: Original.displayName, __fontScaleCapped: true });
  try {
    mod.default = Capped;
  } catch (err) {
    if (__DEV__) console.warn('[fontScaleCap] could not patch', modulePath, err);
  }
}

cap('text');
cap('input');

if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  if (!(RN.Text as { __fontScaleCapped?: boolean }).__fontScaleCapped) {
    console.warn('[fontScaleCap] Text is NOT capped — apply maxFontSizeMultiplier on shared components instead.');
  }
}
