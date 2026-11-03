import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { phoneOnVientianeTime } from '@/lib/vteTime';

export const VTE_TIME_NOTE = 'Times are Vientiane time';

// Every booking time is Vientiane time. When the phone is on another timezone (a tourist
// planning from abroad), say so next to the times. Renders nothing on a Vientiane phone.
export default function VteTimeNote({ style, light }: { style?: StyleProp<ViewStyle>; light?: boolean }) {
  if (phoneOnVientianeTime()) return null;
  return (
    <View style={[s.row, style]}>
      <Feather name="clock" size={12} color={light ? SHADES.carbonFaint : SHADES.carbonMuted} />
      <Text style={[s.text, light && { color: SHADES.carbonFaint }]}>{VTE_TIME_NOTE}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  text: { ...TYPE.small, fontWeight: '500', color: SHADES.carbonMuted },
});
