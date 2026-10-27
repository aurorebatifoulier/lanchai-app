import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, withDelay, withTiming, ReduceMotion,
} from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION, useReducedMotion } from '@/constants/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Check path in a 24×24 box and its length (for the stroke-dash draw).
const CHECK = 'M6.5 12.5 L10.5 16.5 L17.5 8.5';
const CHECK_LEN = 17;

// Booking confirmation: an amber circle pops in, then a carbon check draws itself
// (stroke-dash, MOTION slow). Reduce motion → shown complete at once.
export default function DrawnCheck({ size = 56 }: { size?: number }) {
  const reduce = useReducedMotion();
  const circle = useSharedValue(reduce ? 1 : 0.6);
  const draw = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    const rm = { reduceMotion: ReduceMotion.System };
    if (reduce) { circle.value = 1; draw.value = 1; return; }
    circle.value = withTiming(1, { duration: MOTION.duration.base, easing: MOTION.easing.out, ...rm });
    draw.value = withDelay(MOTION.duration.base, withTiming(1, { duration: MOTION.duration.slow, easing: MOTION.easing.out, ...rm }));
  }, [reduce, circle, draw]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: circle.value }], opacity: Math.min(1, circle.value * 1.6 - 0.6) }));
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }));

  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center' }, circleStyle]}>
      <View style={{ width: size * 0.6, height: size * 0.6 }}>
        <Svg width="100%" height="100%" viewBox="0 0 24 24">
          <AnimatedPath
            d={CHECK}
            stroke={SHADES.carbon}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[CHECK_LEN, CHECK_LEN]}
            animatedProps={pathProps}
          />
        </Svg>
      </View>
    </Animated.View>
  );
}
