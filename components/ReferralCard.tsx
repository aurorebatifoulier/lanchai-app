import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle } from '@/components/account/ui';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { getMyInviteCode, shareInvite } from '@/lib/referral';
import PressScale from '@/components/PressScale';

// Referral card (validated mockup): users icon, headline, "You both get N points…",
// amber "Share my invite link" (native share sheet with the code), "Your code: …".
// The code is created server-side on first view (getMyInviteCode).
export function ReferralCard({ points }: { points: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyInviteCode().then(setCode).catch(e => setError((e as Error).message));
  }, []);

  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <IconCircle icon={{ name: 'users' }} tone="amber" size={48} />
      <Text style={s.title}>{LOYALTY_COPY.referralTitle}</Text>
      <Text style={[UI.body, s.sub]}>{LOYALTY_COPY.referralSub(points)}</Text>
      <PressScale
        style={[UI.btnPrimary, s.btn, !code && { opacity: 0.6 }]}
        disabled={!code}
        onPress={() => code && shareInvite(code, points).catch(() => {})}
        activeOpacity={0.85}
      >
        {code ? (
          <>
            <Feather name="share-2" size={17} color={SHADES.carbon} />
            <Text style={UI.btnPrimaryText}>{LOYALTY_COPY.referralShare}</Text>
          </>
        ) : error ? <Text style={UI.btnPrimaryText}>{LOYALTY_COPY.referralShare}</Text> : <ActivityIndicator color={SHADES.carbon} />}
      </PressScale>
      {code ? <Text style={[UI.small, s.code]} selectable>{LOYALTY_COPY.referralYourCode(code)}</Text> : null}
      {error ? <Text style={[UI.errorText, { marginTop: 8 }]}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center', marginTop: 24, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, textAlign: 'center', marginTop: 12, lineHeight: 24 },
  sub: { textAlign: 'center', marginTop: 6 },
  btn: { alignSelf: 'stretch', marginTop: 16 },
  code: { fontWeight: '600', marginTop: 12 },
});
