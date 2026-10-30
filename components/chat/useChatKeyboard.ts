import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Keyboard state shared by both chat screens (renter chat + admin thread). The lists
 * are inverted FlatLists (ChatThread), which already sit on the newest message — no
 * scroll-to-end handling needed any more.
 */
export function useChatKeyboard() {
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    // On iOS, keyboardWillShow fires before the animation starts so the padding
    // change animates in sync with the keyboard. Android only has the *Did* events.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, () => setKeyboardShown(true));
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardShown(false));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  return { keyboardShown };
}
