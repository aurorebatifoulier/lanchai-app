import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, type UserProfile } from '@/lib/firestore';

export default function BtobPendingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.iconBox}>
          <Feather name="clock" size={26} color="#7A5F00" />
        </View>
        <Text style={s.title}>Your account is pending approval</Text>
        <Text style={s.msg}>
          Thanks for signing up as a business account. Our team is reviewing your
          application — this usually takes 1–2 business days. You&apos;ll be able to use
          the app as soon as it&apos;s approved.
        </Text>

        {!loading && profile && !profile.btobDocumentUrl && (
          <View style={s.docReminderBox}>
            <Feather name="alert-circle" size={14} color="#854F0B" />
            <View style={{ flex: 1 }}>
              <Text style={s.docReminderText}>
                Don&apos;t forget to upload your business registration document to speed
                up your approval.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/profile/business-document')}
                activeOpacity={0.7}
                style={{ marginTop: 6 }}
              >
                <Text style={s.docReminderLink}>Upload document</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
        ) : profile ? (
          <View style={s.infoBox}>
            <Text style={s.infoBoxLabel}>Submitted information</Text>
            <InfoRow label="Company" value={profile.btobCompanyName} />
            <InfoRow label="License / registration number" value={profile.btobLicenseNumber} />
            <InfoRow label="Responsible person" value={profile.btobResponsibleName} />
          </View>
        ) : null}

        <TouchableOpacity
          style={s.browseBtn}
          onPress={() => router.push('/')}
          activeOpacity={0.85}
        >
          <Feather name="grid" size={16} color={COLORS.carbon} />
          <Text style={s.browseBtnText}>Browse catalogue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.chatBtn} onPress={() => router.push('/chat')} activeOpacity={0.85}>
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

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <Text style={s.infoRowLabel}>{label}</Text>
      <Text style={s.infoRowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  content: { paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' },
  iconBox: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: '#FEF9E5',
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
  docReminderBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  docReminderText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#92400E',
    lineHeight: 18,
  },
  docReminderLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },
  infoBox: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 16, marginBottom: 24,
  },
  infoBoxLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: COLORS.fg3, marginBottom: 10,
  },
  infoRow: { paddingVertical: 7, gap: 2 },
  infoRowLabel: { fontSize: 11, fontWeight: '600', color: COLORS.fg3 },
  infoRowValue: { fontSize: 14, fontWeight: '600', color: COLORS.carbon },
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
  chatBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 13, fontWeight: '600', color: COLORS.fg3 },
});
