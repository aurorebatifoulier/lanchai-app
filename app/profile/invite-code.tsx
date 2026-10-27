import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, StatusBlock, StatusChip, useScreenInsets } from '@/components/account/ui';
import { applyInviteCode } from '@/lib/referral';
import { useLoyaltyConfig, DEFAULT_REFERRAL_REWARD_POINTS } from '@/lib/loyalty';

// "Have an invite code?" — new renters, before their first booking (any booking, even
// cancelled, closes the window — checked server-side by applyInviteCode).
export default function InviteCodeScreen() {
  const screen = useScreenInsets();
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
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Invite code</Text>
      </View>
      <View style={[UI.screenContent, { paddingTop: 16 }]}>
        {done ? (
          <View style={[UI.card, UI.cardPadded]}>
            <StatusBlock icon={{ name: 'gift' }} title="Code applied" chip={<StatusChip label="Applied" tone="success" />}>
              <Text style={UI.body}>You and your friend both get {pts} points after your first rental is returned.</Text>
            </StatusBlock>
          </View>
        ) : (
          <View style={[UI.card, UI.cardPadded]}>
            {/* Amber = an action from you (a code to enter). */}
            <StatusBlock icon={{ name: 'gift' }} tone="amber" title="Have an invite code?">
              <Text style={UI.body}>Got a code from a friend? Enter it before your first booking — you both get {pts} points after your first rental.</Text>
            </StatusBlock>
            <TextInput
              style={[UI.input, s.input]}
              value={code}
              onChangeText={t => { setCode(t.toUpperCase()); setError(null); }}
              placeholder="e.g. AURORE-7K2"
              placeholderTextColor={SHADES.carbonFaint}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {error && <Text style={[UI.errorText, { marginTop: 8 }]}>{error}</Text>}
            <TouchableOpacity style={[UI.btnPrimary, { marginTop: 14 }, (!code.trim() || busy) && UI.btnDisabled]} disabled={!code.trim() || busy} onPress={apply} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Apply code</Text>}
            </TouchableOpacity>
          </View>
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
  input: { marginTop: 16, fontWeight: '700', letterSpacing: 1 },
});
