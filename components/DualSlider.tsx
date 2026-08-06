import React, { useRef, useEffect, useCallback } from 'react';
import { View, Animated, PanResponder, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/Colors';

const SLIDER_H   = 40;
const TRACK_H    = 4;
const HANDLE_D   = 22;
const TRACK_TOP  = (SLIDER_H - TRACK_H)  / 2;
const HANDLE_TOP = (SLIDER_H - HANDLE_D) / 2;

interface DualSliderProps {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}

export default function DualSlider({ min, max, step, valueMin, valueMax, onChangeMin, onChangeMax }: DualSliderProps) {
  const HALF = HANDLE_D / 2;
  const trackWRef   = useRef(0);
  const valueMinRef = useRef(valueMin);
  const valueMaxRef = useRef(valueMax);

  useEffect(() => { valueMinRef.current = valueMin; }, [valueMin]);
  useEffect(() => { valueMaxRef.current = valueMax; }, [valueMax]);

  const minAnim = useRef(new Animated.Value(0)).current;
  const maxAnim = useRef(new Animated.Value(0)).current;

  const syncAnims = useCallback((tw: number, vMin: number, vMax: number) => {
    minAnim.setValue(((vMin - min) / (max - min)) * tw);
    maxAnim.setValue(((vMax - min) / (max - min)) * tw);
  }, [min, max, minAnim, maxAnim]);

  useEffect(() => {
    if (trackWRef.current > 0) syncAnims(trackWRef.current, valueMin, valueMax);
  }, [valueMin, valueMax, syncAnims]);

  const startMinX = useRef(0);
  const startMaxX = useRef(0);

  const minPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const tw = trackWRef.current;
        startMinX.current = ((valueMinRef.current - min) / (max - min)) * tw;
      },
      onPanResponderMove: (_, gs) => {
        const tw  = trackWRef.current;
        const cap = ((valueMaxRef.current - min) / (max - min)) * tw - 1;
        minAnim.setValue(Math.max(0, Math.min(cap, startMinX.current + gs.dx)));
      },
      onPanResponderRelease: (_, gs) => {
        const tw  = trackWRef.current;
        const cap = ((valueMaxRef.current - min) / (max - min)) * tw - 1;
        const x   = Math.max(0, Math.min(cap, startMinX.current + gs.dx));
        const raw = (x / tw) * (max - min) + min;
        const val = Math.max(min, Math.min(valueMaxRef.current - step, Math.round(raw / step) * step));
        onChangeMin(val);
        minAnim.setValue(((val - min) / (max - min)) * tw);
      },
    })
  ).current;

  const maxPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const tw = trackWRef.current;
        startMaxX.current = ((valueMaxRef.current - min) / (max - min)) * tw;
      },
      onPanResponderMove: (_, gs) => {
        const tw  = trackWRef.current;
        const flr = ((valueMinRef.current - min) / (max - min)) * tw + 1;
        maxAnim.setValue(Math.max(flr, Math.min(tw, startMaxX.current + gs.dx)));
      },
      onPanResponderRelease: (_, gs) => {
        const tw  = trackWRef.current;
        const flr = ((valueMinRef.current - min) / (max - min)) * tw + 1;
        const x   = Math.max(flr, Math.min(tw, startMaxX.current + gs.dx));
        const raw = (x / tw) * (max - min) + min;
        const val = Math.min(max, Math.max(valueMinRef.current + step, Math.round(raw / step) * step));
        onChangeMax(val);
        maxAnim.setValue(((val - min) / (max - min)) * tw);
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <View
        style={styles.container}
        onLayout={e => {
          const tw = e.nativeEvent.layout.width;
          trackWRef.current = tw;
          syncAnims(tw, valueMinRef.current, valueMaxRef.current);
        }}
      >
        <View style={styles.track} />
        <Animated.View
          style={[styles.activeTrack, {
            left:  minAnim,
            width: Animated.subtract(maxAnim, minAnim),
          }]}
        />
        <Animated.View
          style={[styles.handle, { transform: [{ translateX: Animated.subtract(minAnim, HALF) }] }]}
          {...minPan.panHandlers}
        />
        <Animated.View
          style={[styles.handle, { transform: [{ translateX: Animated.subtract(maxAnim, HALF) }] }]}
          {...maxPan.panHandlers}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    paddingHorizontal: HANDLE_D / 2,
  },
  container: {
    height: SLIDER_H,
    position: 'relative',
  },
  track: {
    position: 'absolute',
    top:    TRACK_TOP,
    left:   0,
    right:  0,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: COLORS.softGray,
  },
  activeTrack: {
    position: 'absolute',
    top:    TRACK_TOP,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: COLORS.amber,
  },
  handle: {
    position: 'absolute',
    top:          HANDLE_TOP,
    width:        HANDLE_D,
    height:       HANDLE_D,
    borderRadius: HANDLE_D / 2,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.carbon,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
