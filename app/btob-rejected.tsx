import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
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
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 40 }} />
        ) : fixable ? (
          <>
            <View style={[s.iconBox, s.iconBoxAmber]}>
              <Feather name="edit-3" size={26} color={COLORS.carbon} />
            </View>
            <Text style={s.title}>Almost there — we just need one more thing</Text>
            <Text style={s.msg}>{btobNeedLine(key)}.</Text>
            <View style={[s.reasonBox, s.needBox]}>
              <Text style={[s.reasonBoxLabel, s.needLabel]}>What we need</Text>
              {preset?.need && <Text style={[s.reasonText, s.needText]}>{preset.need}</Text>}
              {preset?.needBullets?.map(b => (
                <View key={b.text} style={s.bulletRow}>
                  <Feather name={b.icon === 'camera' ? 'camera' : 'file-text'} size={14} color={COLORS.fg2} />
                  <Text style={s.bulletText}>{b.text}</Text>
                </View>
              ))}
              {!!detail && <Text style={[s.reasonText, s.needText, s.detailText]}>{detail}</Text>}
              {!!BTOB_REVIEW_TIME_NOTE && <Text style={s.noteText}>{BTOB_REVIEW_TIME_NOTE}</Text>}
            </View>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => router.push('/profile/business-document')}
              activeOpacity={0.85}
            >
              <Feather name="upload" size={16} color={COLORS.carbon} />
              <Text style={s.chatBtnText}>Update my application</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.iconBox}>
              <Feather name="x-circle" size={26} color={COLORS.danger} />
            </View>
            <Text style={s.title}>We couldn&apos;t approve your application</Text>
            {(preset?.reason || detail) ? (
              <View style={s.reasonBox}>
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
          style={s.browseBtn}
          onPress={() => router.push('/')}
          activeOpacity={0.85}
        >
          <Feather name="grid" size={16} color={COLORS.carbon} />
          <Text style={s.browseBtnText}>Browse catalogue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.chatBtn, fixable && s.chatBtnOutline]} onPress={() => router.push('/chat')} activeOpacity={0.85}>
          <Feather name="message-circle" size={16} color={COLORS.carbon} />
          <Text style={s.chatBtnText}>Contact us</Text>
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
  content: { paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' },
  iconBox: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20, fontWeight: '800', color: COLORS.carbon,
    letterSpacing: -0.3, textAlign: 'center', marginBottom: 10,
  },
  msg: {
    fontSize: 14, fontWeight: '400', color: COLORS.fg2,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  reasonBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    padding: 16, marginBottom: 24,
  },
  reasonBoxLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: '#991B1B', marginBottom: 8,
  },
  reasonText: { fontSize: 14, fontWeight: '500', color: '#991B1B', lineHeight: 20 },
  iconBoxAmber: { backgroundColor: '#FDF3D6' },
  needBox: { backgroundColor: COLORS.white, borderColor: COLORS.softGray200, gap: 6 },
  needLabel: { color: COLORS.fg3 },
  needText: { color: COLORS.carbon, fontWeight: '600' },
  detailText: { marginTop: 4, fontWeight: '500' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 18 },
  noteText: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginTop: 6 },
  primaryBtn: {
    width: '100%', height: 50,
    backgroundColor: COLORS.amber, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 12,
  },
  browseBtn: {
    width: '100%', height: 50,
    backgroundColor: COLORS.white, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.carbon,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 12,
  },
  browseBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  chatBtn: {
    width: '100%', height: 50,
    backgroundColor: COLORS.amber, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 16,
  },
  chatBtnOutline: { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.carbon },
  chatBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 13, fontWeight: '600', color: COLORS.fg3 },
});
