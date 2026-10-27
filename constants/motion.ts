import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing as REasing } from 'react-native-reanimated';

// ONE motion system for the app's micro-animations (press feedback, heart, bag, counters,
// confirmation check, Home sections). Every animation must check useReducedMotion() and
// jump straight to its end state when it's on (Reanimated: also .reduceMotion(System)).
export const MOTION = {
  duration: { fast: 120, base: 220, slow: 450, count: 500 },
  easing: {
    standard: REasing.bezier(0.2, 0, 0, 1),
    out: REasing.out(REasing.cubic),
    in: REasing.in(REasing.cubic),
  },
  spring: {
    /** Press feedback: quick, no visible overshoot. */
    press: { damping: 22, stiffness: 420, mass: 0.6 },
    /** Small playful bounce (heart, bag). */
    bounce: { damping: 9, stiffness: 320, mass: 0.6 },
  },
  pressScale: 0.97,
  riseY: 8,
} as const;

/** Live system "reduce motion" setting (Android: Remove animations). */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}
