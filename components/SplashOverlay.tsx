import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { COLORS } from '@/constants/Colors';

const ANIM_DURATION = 550;

// Shown in place of app/_layout.tsx's loading branch while Firebase Auth and the
// onboarding-complete flag are both resolving — hands off from the native splash (via
// hideAsync, called on mount) with a matching porcelain background, then plays a
// subtle zoom + fade-in on the LANCHAI mark. The root layout holds this on screen until
// this animation finishes (via onFinish), even if init resolves faster, so the intro
// never gets cut short.
export default function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    scale.value = withTiming(1, { duration: ANIM_DURATION });
    opacity.value = withTiming(1, { duration: ANIM_DURATION });
    const t = setTimeout(onFinish, ANIM_DURATION);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <Animated.View style={markStyle}>
        <Image
          source={require('@/assets/images/lanchai-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
  },
});
