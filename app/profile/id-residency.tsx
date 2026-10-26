import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { IdentitySection } from '@/components/profile/IdentitySection';
import { ResidencySection } from '@/components/profile/ResidencySection';
import { UI } from '@/components/account/ui';

// ID & residency — ONE screen (Account → ID & residency, the header badge, emails,
// notifications): the ID document required to rent (status, planned deletion, upload /
// replace / delete) and the optional resident status (status, valid-until, request
// flow). Old routes /profile/identity and /profile/residency redirect here.
export default function IdResidencyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>ID &amp; residency</Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[UI.screenContent, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Each section renders its own section title + card (My Account style). */}
        <IdentitySection />
        <ResidencySection />
      </ScrollView>
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
});
