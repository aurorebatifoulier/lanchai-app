import React from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { useCameraOff } from '@/lib/mediaPermissions';

// "Camera access is off · Open settings" — shown only once the camera was refused for good
// (lib/mediaPermissions.ts). Inline on purpose: these screens are often already inside a
// modal, and iOS can't stack a second one.
export default function CameraOffHint() {
  const off = useCameraOff();
  if (!off) return null;
  return (
    <View style={s.row}>
      <Feather name="camera-off" size={15} color={SHADES.carbonMuted} />
      <Text style={[UI.subtitle, { flex: 1 }]}>
        Camera access is off for LANCHAI.{' '}
        <Text style={UI.link} onPress={() => Linking.openSettings()} accessibilityRole="link">Open settings</Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
