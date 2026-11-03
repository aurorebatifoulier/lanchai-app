import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The dotted "bee trail" motion (My Account header, Home "Rent. Return. Repeat."), on the
 * UI THREAD (Reanimated shared values → SVG animatedProps — no JS frame per tick):
 *   • `draw` 1 → 0 once, when `ready` (layout measured) — the reveal mask;
 *   • then `drift` 0 → 1 forever (one dash period every `driftMs`) — the dashes moving.
 * The endless drift PAUSES while the screen isn't focused or the app is in the
 * background, and resumes from where it stopped. Reduce motion = static end state.
 */
export function useTrailMotion(ready: boolean, reduce: boolean, drawMs: number, driftMs = 2400): {
  draw: SharedValue<number>;
  drift: SharedValue<number>;
} {
  const draw = useSharedValue(1);
  const drift = useSharedValue(0);
  const drawn = useRef(false);
  const [drawDone, setDrawDone] = useState(false);
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Reveal, once per mount.
  useEffect(() => {
    if (!ready) return;
    if (reduce) {
      cancelAnimation(draw);
      cancelAnimation(drift);
      draw.value = 0;
      drift.value = 0;
      drawn.current = true;
      return;
    }
    if (drawn.current) return;
    drawn.current = true;
    draw.value = 1;
    draw.value = withTiming(0, { duration: drawMs, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => setDrawDone(true), drawMs);
    return () => clearTimeout(t);
  }, [ready, reduce, drawMs, draw, drift]);

  // Endless drift — only while visible (focused screen, app in the foreground).
  useEffect(() => {
    if (!drawDone || reduce || !focused || !active) return;
    const from = drift.value % 1;
    drift.value = withSequence(
      withTiming(1, { duration: Math.max(1, (1 - from) * driftMs), easing: Easing.linear }),
      withTiming(0, { duration: 0 }),
      withRepeat(withTiming(1, { duration: driftMs, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(drift);
  }, [drawDone, reduce, focused, active, driftMs, drift]);

  return { draw, drift };
}
