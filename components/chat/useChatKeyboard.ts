import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView } from 'react-native';

/**
 * Shared keyboard + auto-scroll behavior for chat screens (Phase 1 renter
 * chat and Phase 2 admin thread). Keeps both screens pixel-identical.
 */
export function useChatKeyboard() {
  const scrollRef = useRef<ScrollView>(null);
  const isFirstLoad = useRef(true);
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    // On iOS, keyboardWillShow fires before the animation starts so the padding
    // change animates in sync with the keyboard. Android only has the *Did* events.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, () => {
      setKeyboardShown(true);
    });
    // Scroll AFTER the keyboard is fully present so the KAV has already shrunk
    // the ScrollView to its final height before we ask it to scroll.
    const onDidShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardShown(false);
    });

    return () => {
      onShow.remove();
      onDidShow.remove();
      onHide.remove();
    };
  }, []);

  const handleContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: !isFirstLoad.current });
    isFirstLoad.current = false;
  }, []);

  return { scrollRef, keyboardShown, handleContentSizeChange };
}
