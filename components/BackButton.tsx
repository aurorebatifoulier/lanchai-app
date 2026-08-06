import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

export interface BackButtonProps {
  onPress: () => void;
  // 'default' = the standard rounded warmBeige square used on most screen headers.
  // 'bare' = icon only, no visible container (minimal chat-style headers).
  variant?: 'default' | 'bare';
  size?: number;      // icon size
  boxSize?: number;   // container width/height — also the tappable area before hitSlop
  color?: string;      // icon color — defaults to carbon
  style?: StyleProp<ViewStyle>;
}

// Shared header back button. The rounded container itself — not just the arrow icon —
// is the tap target, since `style` (size + shape) is applied directly to the
// TouchableOpacity rather than to a nested child, plus a hitSlop to grow the effective
// tap area a bit further beyond the visual bounds.
export default function BackButton({
  onPress, variant = 'default', size = 18, boxSize = 40, color = COLORS.carbon, style,
}: BackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        { width: boxSize, height: boxSize, alignItems: 'center', justifyContent: 'center' },
        variant === 'default' && [styles.default, { borderRadius: boxSize * 0.3 }],
        style,
      ]}
    >
      <Feather name="arrow-left" size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  default: {
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
});
