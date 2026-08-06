import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '@/constants/Colors';

interface Props {
  value: string;
  size?: number;
  /** 'item' = plain white card (per-reservation). 'order' = amber outer frame (order-level). */
  variant?: 'item' | 'order';
  onPress: () => void;
}

export function QRThumb({ value, size = 90, variant = 'item', onPress }: Props) {
  if (variant === 'order') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.amberFrame}>
        <View style={s.amberInner}>
          <QRCode value={value} size={size} color={COLORS.carbon} backgroundColor="white" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={s.itemWrap}>
      <QRCode value={value} size={size} color={COLORS.carbon} backgroundColor="white" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // Order variant — amber outer frame, white inner
  amberFrame: {
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    padding: 5,
  },
  amberInner: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 8,
  },

  // Item variant — plain white card with border
  itemWrap: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
});
