import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { AUTH_COPY } from '@/constants/authCopy';
import { UI } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { useLoyaltyConfig, referralWelcomePercent } from '@/lib/loyalty';

const KEY = 'home.guestInviteBannerDismissed';

// Home, guests only: "Sign up with an invite code and get X% off your first rental."
// Tap → sign-up with the invite-code field open. Dismissal per device (AsyncStorage).
export default function GuestInviteBanner() {
  const router = useRouter();
  const config = useLoyaltyConfig();
  const pct = referralWelcomePercent(config);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => setHidden(v === '1')).catch(() => setHidden(false));
  }, []);
  if (hidden || pct <= 0) return null;
  const dismiss = () => { setHidden(true); AsyncStorage.setItem(KEY, '1').catch(() => {}); };
  return (
    <PressScale
      style={[UI.card, s.card]}
      onPress={() => router.push({ pathname: '/login', params: { mode: 'signup', invite: '1' } } as never)}
    >
      <View style={s.icon}><Feather name="gift" size={16} color={SHADES.amberDeep} /></View>
      <Text style={s.text}>
        {AUTH_COPY.inviteBanner(pct)} <Text style={s.cta}>{AUTH_COPY.inviteBannerCta}</Text>
      </Text>
      <TouchableOpacity onPress={dismiss} hitSlop={10} style={s.close} accessibilityLabel="Dismiss">
        <Feather name="x" size={15} color={SHADES.carbonMuted} />
      </TouchableOpacity>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: SHADES.amberPale, borderColor: SHADES.amberLight },
  icon: { width: 30, height: 30, borderRadius: 15, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center' },
  text: { ...TYPE.secondary, flex: 1, color: SHADES.carbon },
  cta: { fontWeight: '700', color: SHADES.amberText },
  close: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
