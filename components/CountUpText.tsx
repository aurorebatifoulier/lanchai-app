import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { MOTION, useReducedMotion } from '@/constants/motion';

// Counts a number up from 0 on its FIRST display in this app session (~500ms, ease-out),
// then shows it as is (later visits, value changes). `format` renders each step (e.g.
// compactLak). ~30 updates per second, only during the count. Reduce motion → final value.
const countedThisSession = new Set<string>();
const COUNT_MS = MOTION.duration.count;
const FRAME_MS = 33;

export default function CountUpText({
  id, value, format = v => String(Math.round(v)), ...textProps
}: TextProps & { id: string; value: number; format?: (v: number) => string }) {
  const reduce = useReducedMotion();
  const animate = useRef(!countedThisSession.has(id)).current;
  const [shown, setShown] = useState(animate ? 0 : value);

  useEffect(() => {
    countedThisSession.add(id);
    if (!animate || reduce) { setShown(value); return; }
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_MS);
      setShown(value * (1 - Math.pow(1 - t, 3))); // ease-out cubic, like MOTION.easing.out
      if (t < 1) timer = setTimeout(tick, FRAME_MS);
    };
    tick();
    return () => clearTimeout(timer);
  }, [id, value, animate, reduce]);

  return <Text {...textProps}>{format(shown)}</Text>;
}

