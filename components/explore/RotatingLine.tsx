import React, { useEffect, useState } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { MOTION, useReducedMotion } from '@/constants/motion';

const EVERY_MS = 4000;

// A one-liner that cross-fades to the next every ~4s. Reduce motion → the first line, static.
export default function RotatingLine({ lines, style }: { lines: readonly string[]; style?: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || lines.length < 2) { setI(0); return; }
    const t = setInterval(() => setI(x => (x + 1) % lines.length), EVERY_MS);
    return () => clearInterval(t);
  }, [reduce, lines.length]);
  return (
    <Animated.Text
      key={i}
      entering={FadeIn.duration(MOTION.duration.slow).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(ReduceMotion.System)}
      style={style}
      numberOfLines={1}
    >
      {lines[i]}
    </Animated.Text>
  );
}
