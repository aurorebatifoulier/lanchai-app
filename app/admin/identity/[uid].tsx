import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { RenterIdCard } from '@/components/admin/RenterIdCard';

// Admin → Verifications → Identity → one renter: name + contact, ID photos, add/replace
// a counter photo, decline (RenterIdCard). The in-person check itself happens in the
// pick-up checklist.
export default function AdminIdentityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>ID document</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        {uid ? <RenterIdCard renterId={uid} /> : null}
        <Text style={s.note}>The in-person check (two confirmations) happens in the pick-up checklist of the renter&apos;s next rental.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  content: { padding: 20 },
  note: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17 },
});
