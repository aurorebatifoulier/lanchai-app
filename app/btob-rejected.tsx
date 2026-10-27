import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle, StatusChip } from '@/components/account/ui';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, type UserProfile } from '@/lib/firestore';
import {
  BTOB_REJECTION_REASONS, BTOB_REVIEW_TIME_NOTE, btobNeedLine, isBtobRejectionKey,
} from '@/functions/src/shared/btob';

export default function BtobRejectedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  // Fixable rejection → the renter can update and resubmit (app/profile/business-document.tsx).
  // Final → no resubmission from the app. Legacy rejections (free text only, no
  // btobRejectionFixable) are treated as final, as before.
  const key = isBtobRejectionKey(profile?.btobRejectionReason) ? profile.btobRejectionReason : null;
  const preset = key ? BTOB_REJECTION_REASONS[key] : null;
  const fixable = profile?.btobRejectionFixable === true;
  const legacyText = !key && profile?.btobRejectionReason ? profile.btobRejectionReason : '';
  const detail = profile?.btobRejectionText?.trim() || legacyText;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 40 }} />
        ) : fixable ? (
          <>
            <View style={s.iconBox}>
              <IconCircle icon={{ name: 'edit-3' }} tone="amber" size={64} />
            </View>
            <Text style={s.title}>Almost there — we just need one more thing</Text>
            <Text style={s.msg}>{btobNeedLine(key)}.</Text>
            <View style={[UI.card, UI.cardPadded, s.reasonBox]}>
              <Text style={s.reasonBoxLabel}>What we need</Text>
              {preset?.need && <Text style={[s.reasonText, s.needText]}>{preset.need}</Text>}
              {preset?.needBullets?.map(b => (
                <View key={b.text} style={s.bulletRow}>
                  <Feather name={b.icon === 'camera' ? 'camera' : 'file-text'} size={14} color={SHADES.carbonMuted} />
                  <Text style={s.bulletText}>{b.text}</Text>
                </View>
              ))}
              {!!detail && <Text style={[s.reasonText, s.needText, s.detailText]}>{detail}</Text>}
              {!!BTOB_REVIEW_TIME_NOTE && <Text style={s.noteText}>{BTOB_REVIEW_TIME_NOTE}</Text>}
            </View>
            <TouchableOpacity
              style={[UI.btnPrimary, s.fullBtn]}
              onPress={() => router.push('/profile/business-document')}
              activeOpacity={0.85}
            >
              <Feather name="upload" size={16} color={SHADES.carbon} />
              <Text style={UI.btnPrimaryText}>Update my application</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.iconBox}>
              <IconCircle icon={{ name: 'x-circle' }} size={64} />
            </View>
            <Text style={s.title}>We couldn&apos;t approve your application</Text>
            {/* Red only as a small status signal. */}
            <View style={{ marginBottom: 16 }}><StatusChip label="Declined" tone="danger" /></View>
            {(preset?.reason || detail) ? (
              <View style={[UI.card, UI.cardPadded, s.reasonBox]}>
                <Text style={s.reasonBoxLabel}>Reason</Text>
                {preset?.reason && <Text style={s.reasonText}>{preset.reason}</Text>}
                {!!detail && <Text style={[s.reasonText, preset?.reason ? s.detailText : null]}>{detail}</Text>}
              </View>
            ) : null}
            <Text style={s.msg}>
              Thank you for your interest in LANCHAI. If you think this is a mistake, just
              message us — we&apos;re happy to take another look.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[UI.btnSecondary, s.fullBtn]}
          onPress={() => router.push('/')}
          activeOpacity={0.85}
        >
          <Feather name="grid" size={16} color={SHADES.carbon} />
          <Text style={UI.btnSecondaryText}>Browse catalogue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[fixable ? UI.btnSecondary : UI.btnPrimary, s.fullBtn, { marginBottom: 16 }]} onPress={() => router.push('/chat')} activeOpacity={0.85}>
          <Feather name="message-circle" size={16} color={SHADES.carbon} />
          <Text style={fixable ? UI.btnSecondaryText : UI.btnPrimaryText}>Contact us</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => signOut()} activeOpacity={0.7} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  content: { paddingHorizontal: 16, paddingTop: 40, alignItems: 'center' },
  iconBox: { marginBottom: 18 },
  title: {
    fontSize: 22, fontWeight: '800', color: SHADES.carbon,
    letterSpacing: -0.3, textAlign: 'center', marginBottom: 10,
  },
  msg: {
    fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  // White card (no red / yellow background).
  reasonBox: { width: '100%', gap: 6, marginBottom: 24 },
  reasonBoxLabel: { fontSize: 15, fontWeight: '700', color: SHADES.carbon, marginBottom: 2 },
  reasonText: { fontSize: 14, fontWeight: '500', color: SHADES.carbon, lineHeight: 20 },
  needText: { fontWeight: '600' },
  detailText: { marginTop: 4, fontWeight: '500' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 18 },
  noteText: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 17, marginTop: 6 },
  fullBtn: { alignSelf: 'stretch', height: 50, marginBottom: 12 },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 14, fontWeight: '600', color: SHADES.carbonMuted },
});
