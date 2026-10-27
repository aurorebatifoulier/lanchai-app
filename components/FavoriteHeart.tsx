import React from 'react';
import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';

// The ONE favourite heart (every product card + product detail): carbon outline, filled
// amber when liked — never red (red is reserved for small stock / error signals).
export default function FavoriteHeart({ liked, size = 15 }: { liked: boolean; size?: number }) {
  return <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? SHADES.amber : SHADES.carbon} />;
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
