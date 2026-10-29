import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SHADES } from '@/constants/brandShades';

// Finger signature pad — react-native-svg + PanResponder (no extra dependency, Expo Go
// compatible, works inside a Modal). Strokes are kept as points and rendered as smooth
// quadratic paths; `toSignatureSvg()` turns them into a standalone vector SVG for the PDF.
// Never put it inside a ScrollView: the pad owns every touch that starts on it.

export type Stroke = { x: number; y: number }[];
export interface Signature { strokes: Stroke[]; width: number; height: number }

const INK = SHADES.carbon;
const WIDTH = 2.4;

/** Smooth path through the points (quadratic curves through the midpoints). */
export function strokePath(points: Stroke): string {
  if (points.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (points.length < 3) {
    const [a, b = a] = points;
    return `M${f(a.x)} ${f(a.y)} L${f(b.x + 0.1)} ${f(b.y + 0.1)}`;
  }
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${f(points[i].x)} ${f(points[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${f(last.x)} ${f(last.y)}`;
}

/** Total ink length — "Confirm" waits for a real signature, not a dot. */
export function inkLength(strokes: Stroke[]): number {
  let len = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
}

/** Standalone SVG markup (vector) for the PDF. */
export function toSignatureSvg(sig: Signature): string {
  const paths = sig.strokes.map(s =>
    `<path d="${strokePath(s)}" fill="none" stroke="${INK}" stroke-width="${WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(sig.width)} ${Math.round(sig.height)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
}

export default function SignaturePad({ height = 200, onChange }: {
  height?: number;
  /** Called after every stroke (and on clear) with the current signature. */
  onChange: (sig: Signature) => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  const size = useRef({ width: 0, height });
  const live = useRef<Stroke>([]);
  const done = useRef<Stroke[]>([]);

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      live.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      setCurrent(live.current);
    },
    onPanResponderMove: e => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const prev = live.current[live.current.length - 1];
      if (prev && Math.hypot(x - prev.x, y - prev.y) < 1.5) return;
      live.current = [...live.current, { x, y }];
      setCurrent(live.current);
    },
    onPanResponderRelease: () => {
      if (live.current.length > 0) done.current = [...done.current, live.current];
      live.current = [];
      setCurrent([]);
      setStrokes(done.current);
      onChange({ strokes: done.current, ...size.current });
    },
  }), [onChange]);

  return (
    <View style={[s.pad, { height }]} onLayout={onLayout} {...pan.panHandlers}>
      <View style={s.line} pointerEvents="none" />
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((st, i) => (
          <Path key={i} d={strokePath(st)} stroke={INK} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {current.length > 0 && (
          <Path d={strokePath(current)} stroke={INK} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
}

/** Imperative clear: remount the pad with a new `key`. */
export const clearKey = (k: number) => k + 1;

const s = StyleSheet.create({
  pad: {
    width: '100%', backgroundColor: SHADES.white, borderRadius: 16,
    borderWidth: 1, borderColor: SHADES.border, overflow: 'hidden',
  },
  line: { position: 'absolute', left: 20, right: 20, bottom: 44, height: 1, backgroundColor: SHADES.border },
});
