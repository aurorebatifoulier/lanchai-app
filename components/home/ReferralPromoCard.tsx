import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';

// Home bottom card for returning renters (validated mockup) → Loyalty, referral section.
export default function ReferralPromoCard({ points }: { points: number }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={[UI.card, s.card]}
      onPress={() => router.push({ pathname: '/profile/loyalty', params: { section: 'referral' } } as never)}
      activeOpacity={0.85}
    >
      <IconCircle icon={{ name: 'users' }} tone="amber" size={52} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{HOME_COPY.referralTitle}</Text>
        <Text style={UI.subtitle}>{HOME_COPY.referralSub(points)}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={SHADES.amberText} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, lineHeight: 21 },
});
