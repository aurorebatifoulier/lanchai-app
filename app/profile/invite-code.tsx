import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { applyInviteCode } from '@/lib/referral';
import { useLoyaltyConfig, DEFAULT_REFERRAL_REWARD_POINTS } from '@/lib/loyalty';

// "Have an invite code?" — new renters, before their first booking (any booking, even
// cancelled, closes the window — checked server-side by applyInviteCode).
export default function InviteCodeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const config = useLoyaltyConfig();
  const pts = config?.referralRewardPoints ?? DEFAULT_REFERRAL_REWARD_POINTS;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyInviteCode(code);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Invite code</Text>
      </View>
      <View style={s.content}>
        {done ? (
          <View style={s.card}>
            <Feather name="check-circle" size={22} color={COLORS.success} />
            <Text style={s.title}>Code applied</Text>
            <Text style={s.body}>You and your friend both get {pts} points after your first rental is returned.</Text>
          </View>
        ) : (
          <>
            <Text style={s.body}>Got a code from a friend? Enter it before your first booking — you both get {pts} points after your first rental.</Text>
            <TextInput
              style={s.input}
              value={code}
              onChangeText={t => { setCode(t.toUpperCase()); setError(null); }}
              placeholder="e.g. AURORE-7K2"
              placeholderTextColor={COLORS.fg3}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {error && <Text style={s.error}>{error}</Text>}
            <TouchableOpacity style={[s.btn, (!code.trim() || busy) && { opacity: 0.45 }]} disabled={!code.trim() || busy} onPress={apply} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={s.btnText}>Apply code</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },
  content: { padding: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.softGray200, padding: 16, gap: 6 },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.carbon },
  body: { fontSize: 14, fontWeight: '500', color: COLORS.fg2, lineHeight: 20 },
  input: {
    height: 48, borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    paddingHorizontal: 14, fontSize: 16, fontWeight: '700', color: COLORS.carbon, marginTop: 16, letterSpacing: 1,
  },
  error: { fontSize: 13, fontWeight: '500', color: COLORS.danger, marginTop: 8 },
  btn: { height: 50, borderRadius: 12, backgroundColor: COLORS.amber, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
});
