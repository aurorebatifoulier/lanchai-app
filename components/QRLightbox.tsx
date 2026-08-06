// Absolutely positioned overlay — no Modal, avoids Android SDK 54 Modal/Alert issues.
// Render this outside any ScrollView/FlatList so it covers the full screen.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

const QR_SIZE = 260;

interface Props {
  value: string;
  label: string;
  onClose: () => void;
}

export function QRLightbox({ value, label, onClose }: Props) {
  return (
    <View style={s.overlay}>
      {/* Tap outside the card to close */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Card — rendered after backdrop so it receives touch first */}
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.label} numberOfLines={2}>{label}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
            <Feather name="x" size={20} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>

        {/* Tap the QR itself to also close */}
        <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
          <View style={s.qrWrap}>
            <QRCode value={value} size={QR_SIZE} color={COLORS.carbon} backgroundColor="white" />
          </View>
        </TouchableOpacity>

        <Text style={s.hint}>Tap anywhere to close</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 300,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qrWrap: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  hint: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.fg3,
  },
});
