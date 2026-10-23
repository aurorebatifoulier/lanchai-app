import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { getUserProfile, saveUserProfile, setMarketingOptIn } from '@/lib/firestore';
import { useFeatureFlags } from '@/lib/features';

// Email preferences. Reminders = the non-essential emails (pick-up/return reminders,
// review follow-up — emailRemindersOptOut, read by functions/src/email/triggers.ts).
// News & offers = explicit marketing consent, OFF by default, stored with server
// timestamps (marketingOptInAt / marketingOptOutAt) — not synced to Brevo yet.
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // News & offers is hidden until the newsletter is decided (config/features.newsletter).
  // The stored consent fields and their rules stay as they are.
  const { newsletter } = useFeatureFlags();

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getUserProfile(cu.uid)
      .then(p => {
        setReminders(p?.emailRemindersOptOut !== true);
        setMarketing(p?.marketingOptIn === true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Saved on toggle; reverted with a message if the write fails.
  const toggle = (value: boolean, set: (v: boolean) => void, save: (uid: string) => Promise<void>) => {
    const cu = auth.currentUser;
    if (!cu) return;
    set(value);
    setError(null);
    save(cu.uid).catch(() => {
      set(!value);
      setError('Could not update your preference. Please try again.');
    });
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Notifications</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        >
          <Text style={s.sectionTitle}>Email</Text>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleTitle}>Email reminders</Text>
              <Text style={s.toggleSub}>
                Pick-up and return reminders the day before, and a short follow-up after your rental.
              </Text>
            </View>
            <Switch
              value={reminders}
              onValueChange={v => toggle(v, setReminders, uid => saveUserProfile(uid, { emailRemindersOptOut: !v }))}
              trackColor={{ false: COLORS.softGray200, true: COLORS.amber }}
              thumbColor={COLORS.white}
            />
          </View>
          <Text style={s.info}>
            Booking confirmations, cancellations, late returns and receipts are always sent — they&apos;re about your rentals.
          </Text>

          {newsletter && (
            <>
              <Text style={s.sectionTitle}>News and offers</Text>
              <View style={s.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleTitle}>News and offers</Text>
                  <Text style={s.toggleSub}>
                    Send me news, new items and offers by email. You can unsubscribe anytime.
                  </Text>
                </View>
                <Switch
                  value={marketing}
                  onValueChange={v => toggle(v, setMarketing, uid => setMarketingOptIn(uid, v))}
                  trackColor={{ false: COLORS.softGray200, true: COLORS.amber }}
                  thumbColor={COLORS.white}
                />
              </View>
            </>
          )}

          {error && <Text style={s.error}>{error}</Text>}

          <Text style={s.sectionTitle}>Push notifications</Text>
          <Text style={s.info}>Push notifications will be available in the app version.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginBottom: 10, marginTop: 8 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  toggleSub: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2, lineHeight: 17 },
  info: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginBottom: 20 },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginBottom: 16 },
});
