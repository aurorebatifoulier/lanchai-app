import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle } from '@/components/account/ui';
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
          <IconCircle icon={{ name: 'clock' }} tone="amber" size={64} />
        </View>
        <Text style={s.title}>Your account is pending approval</Text>
        <Text style={s.msg}>
          Thanks for signing up as a business account. Our team is reviewing your
          application — this usually takes 1–2 business days. You&apos;ll be able to use
          the app as soon as it&apos;s approved.
        </Text>

        {!loading && profile && !profile.btobDocumentUrl && (
          <View style={[UI.card, s.docReminderBox]}>
            <IconCircle icon={{ name: 'upload' }} tone="amber" />
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

        {!loading && profile && !profile.idOnFile && (
          <View style={[UI.card, s.docReminderBox]}>
            <IconCircle icon={{ set: 'mci', name: 'card-account-details-outline' }} tone="amber" />
            <View style={{ flex: 1 }}>
              <Text style={s.docReminderText}>
                We also need the ID (passport or ID card) of the responsible person before we can approve your account.
              </Text>
              <TouchableOpacity onPress={() => router.push('/profile/id-residency')} activeOpacity={0.7} style={{ marginTop: 6 }}>
                <Text style={s.docReminderLink}>Add the ID</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 20 }} />
        ) : profile ? (
          <View style={[UI.card, UI.cardPadded, s.infoBox]}>
            <Text style={s.infoBoxLabel}>Submitted information</Text>
            <InfoRow label="Company" value={profile.btobCompanyName} />
            <InfoRow label="License / registration number" value={profile.btobLicenseNumber} />
            <InfoRow label="Responsible person" value={profile.btobResponsibleName} />
          </View>
        ) : null}

        <TouchableOpacity
          style={[UI.btnSecondary, s.fullBtn]}
          onPress={() => router.push('/')}
          activeOpacity={0.85}
        >
          <Feather name="grid" size={16} color={SHADES.carbon} />
          <Text style={UI.btnSecondaryText}>Browse catalogue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[UI.btnPrimary, s.fullBtn, { marginBottom: 16 }]} onPress={() => router.push('/chat')} activeOpacity={0.85}>
          <Feather name="message-circle" size={16} color={SHADES.carbon} />
          <Text style={UI.btnPrimaryText}>Contact us</Text>
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
  // White card, amber icon circle (action needed) — no yellow banner.
  docReminderBox: {
    width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, marginBottom: 12,
  },
  docReminderText: { fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },
  docReminderLink: { fontSize: 14, fontWeight: '700', color: SHADES.carbon, textDecorationLine: 'underline' },
  infoBox: { width: '100%', marginTop: 12, marginBottom: 24 },
  infoBoxLabel: { fontSize: 15, fontWeight: '700', color: SHADES.carbon, marginBottom: 6 },
  infoRow: { paddingVertical: 7, gap: 2 },
  infoRowLabel: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted },
  infoRowValue: { fontSize: 15, fontWeight: '600', color: SHADES.carbon },
  fullBtn: { alignSelf: 'stretch', height: 50, marginBottom: 12 },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 14, fontWeight: '600', color: SHADES.carbonMuted },
});
