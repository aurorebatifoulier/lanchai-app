import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming, ReduceMotion,
} from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION, useReducedMotion } from '@/constants/motion';

// The ONE favourite heart (every product card + product detail): carbon outline, filled
// amber when liked — never red (red is reserved for small stock / error signals).
// Liking: small bounce (1.25 → spring 1) + the amber fill fades in; unliking: a lighter
// dip (0.9 → 1) + fade out. Only on a CHANGE after mount — never when a list loads.
export default function FavoriteHeart({ liked, size = 15 }: { liked: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const fill = useSharedValue(liked ? 1 : 0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const rm = { reduceMotion: ReduceMotion.System };
    if (reduce) { fill.value = liked ? 1 : 0; scale.value = 1; return; }
    fill.value = withTiming(liked ? 1 : 0, { duration: MOTION.duration.fast, ...rm });
    scale.value = liked
      ? withSequence(withTiming(1.25, { duration: MOTION.duration.fast, ...rm }), withSpring(1, { ...MOTION.spring.bounce, ...rm }))
      : withSequence(withTiming(0.9, { duration: MOTION.duration.fast, ...rm }), withTiming(1, { duration: MOTION.duration.fast, ...rm }));
  }, [liked, reduce, fill, scale]);

  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const filled = useAnimatedStyle(() => ({ opacity: fill.value }));
  return (
    <Animated.View style={[{ width: size, height: size }, wrap]}>
      <MaterialCommunityIcons name="heart-outline" size={size} color={SHADES.carbon} />
      <Animated.View style={[StyleSheet.absoluteFill, filled]}>
        <View style={{ width: size, height: size }}>
          <MaterialCommunityIcons name="heart" size={size} color={SHADES.amber} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The heart button used on every product card: small white circle (above the photo —
 * zIndex/elevation so an expo-image never covers it on Android) + FavoriteHeart.
 * Position it with `style` (e.g. top/right); diameter `diameter`.
 */
export function FavoriteButton({
  liked, onPress, diameter = 30, iconSize, style,
}: {
  liked: boolean;
  onPress: () => void;
  diameter?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[s.btn, { width: diameter, height: diameter, borderRadius: diameter / 2 }, style]}
      onPress={e => { e.stopPropagation(); onPress(); }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      activeOpacity={0.8}
    >
      <FavoriteHeart liked={liked} size={iconSize ?? Math.round(diameter * 0.55)} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    position: 'absolute', top: 8, right: 8, zIndex: 2, elevation: 2,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
  },
});
