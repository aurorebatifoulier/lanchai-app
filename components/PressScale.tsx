import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle, type Insets } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, ReduceMotion } from 'react-native-reanimated';
import { MOTION, useReducedMotion } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Shared press feedback (constants/motion.ts): scales to 0.97 on press-in, springs back on
// release — UI thread only. Drop-in for TouchableOpacity on cards, rows and buttons
// (`activeOpacity` accepted and ignored). Disabled → no motion; reduce motion → none.
export type PressScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  hitSlop?: number | Insets;
  children?: React.ReactNode;
};

export default function PressScale({ style, disabled, onPressIn, onPressOut, activeOpacity: _ignored, children, ...rest }: PressScaleProps) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (v: number) => {
    if (reduce || disabled) return;
    scale.value = withSpring(v, { ...MOTION.spring.press, reduceMotion: ReduceMotion.System });
  };
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={e => { to(MOTION.pressScale); onPressIn?.(e); }}
      onPressOut={e => { to(1); onPressOut?.(e); }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
