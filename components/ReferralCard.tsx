import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { getMyInviteCode, shareInvite } from '@/lib/referral';

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
    <View style={s.card}>
      <Feather name="users" size={30} color="#B07A12" />
      <Text style={s.title}>{LOYALTY_COPY.referralTitle}</Text>
      <Text style={s.sub}>{LOYALTY_COPY.referralSub(points)}</Text>
      <TouchableOpacity
        style={[s.btn, !code && { opacity: 0.6 }]}
        disabled={!code}
        onPress={() => code && shareInvite(code, points).catch(() => {})}
        activeOpacity={0.85}
      >
        {code ? (
          <>
            <Feather name="share-2" size={17} color={COLORS.carbon} />
            <Text style={s.btnText}>{LOYALTY_COPY.referralShare}</Text>
          </>
        ) : error ? <Text style={s.btnText}>{LOYALTY_COPY.referralShare}</Text> : <ActivityIndicator color={COLORS.carbon} />}
      </TouchableOpacity>
      {code ? <Text style={s.code} selectable>{LOYALTY_COPY.referralYourCode(code)}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white, borderRadius: 20, borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 20, alignItems: 'center', marginTop: 22,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.carbon, textAlign: 'center', marginTop: 12, letterSpacing: -0.3, lineHeight: 26 },
  sub: { fontSize: 14, fontWeight: '500', color: COLORS.fg2, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  btn: {
    alignSelf: 'stretch', height: 52, borderRadius: 14, backgroundColor: '#E9B83E',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
  },
  btnText: { fontSize: 16, fontWeight: '800', color: COLORS.carbon },
  code: { fontSize: 13, fontWeight: '600', color: COLORS.fg3, marginTop: 12 },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 8 },
});
