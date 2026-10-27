import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, RowGroup, Row, ToggleRow, useScreenInsets } from '@/components/account/ui';
import { auth } from '@/lib/auth';
import { getUserProfile, saveUserProfile, setMarketingOptIn } from '@/lib/firestore';
import { useFeatureFlags } from '@/lib/features';

// Email preferences. Reminders = the non-essential emails (pick-up/return reminders,
// review follow-up — emailRemindersOptOut, read by functions/src/email/triggers.ts).
// News & offers = explicit marketing consent, OFF by default, stored with server
// timestamps (marketingOptInAt / marketingOptOutAt) — not synced to Brevo yet.
export default function NotificationsScreen() {
  const screen = useScreenInsets();
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
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Notifications</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
        >
          <SectionTitle style={{ marginTop: 16 }}>Email</SectionTitle>
          <RowGroup>
            <ToggleRow
              icon={{ name: 'mail' }}
              title="Email reminders"
              sub="Pick-up and return reminders the day before, and a short follow-up after your rental."
              value={reminders}
              onValueChange={v => toggle(v, setReminders, uid => saveUserProfile(uid, { emailRemindersOptOut: !v }))}
            />
            {newsletter && (
              <ToggleRow
                icon={{ name: 'gift' }}
                title="News and offers"
                sub="Send me news, new items and offers by email. You can unsubscribe anytime."
                value={marketing}
                onValueChange={v => toggle(v, setMarketing, uid => setMarketingOptIn(uid, v))}
              />
            )}
          </RowGroup>
          {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}
          <Text style={[UI.small, { marginTop: 10 }]}>
            Booking confirmations, cancellations, late returns and receipts are always sent — they&apos;re about your rentals.
          </Text>

          <SectionTitle>Push notifications</SectionTitle>
          <RowGroup>
            <Row icon={{ name: 'bell' }} title="Push notifications" sub="Available in the app version." soon />
          </RowGroup>
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
});
