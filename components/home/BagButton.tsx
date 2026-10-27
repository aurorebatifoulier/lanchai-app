import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming, FadeInDown, ReduceMotion,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/Colors';
import { MOTION, useReducedMotion } from '@/constants/motion';

// Home header bag: when the item count goes UP (an item was added), the icon bounces and
// the badge pops with the new number sliding in. Nothing on the first load (`count` null
// until the bag listener answers) nor when it goes down. Reduce motion → static.
export default function BagButton({ count, onPress }: { count: number | null; onPress: () => void }) {
  const reduce = useReducedMotion();
  const icon = useSharedValue(1);
  const badge = useSharedValue(1);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = count;
    if (count == null || before == null || count <= before || reduce) return;
    const rm = { reduceMotion: ReduceMotion.System };
    icon.value = withSequence(withTiming(1.2, { duration: MOTION.duration.fast, ...rm }), withSpring(1, { ...MOTION.spring.bounce, ...rm }));
    badge.value = withSequence(withTiming(1.35, { duration: MOTION.duration.fast, ...rm }), withSpring(1, { ...MOTION.spring.bounce, ...rm }));
  }, [count, reduce, icon, badge]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: icon.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));
  const n = count ?? 0;
  return (
    <TouchableOpacity style={s.btn} onPress={onPress}>
      <Animated.View style={iconStyle}>
        <Feather name="shopping-bag" size={22} color={COLORS.carbon} />
      </Animated.View>
      {n > 0 && (
        <Animated.View style={[s.badge, badgeStyle]}>
          <Animated.Text
            key={n}
            entering={reduce || prev.current == null ? undefined : FadeInDown.duration(MOTION.duration.base).reduceMotion(ReduceMotion.System)}
            style={s.badgeText}
          >
            {n > 9 ? '9+' : n}
          </Animated.Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, backgroundColor: COLORS.amber, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: COLORS.porcelain,
    overflow: 'hidden',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: COLORS.carbon },
});
