import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import AdminCard from '@/components/admin/AdminCard';
import { useScreenInsets } from '@/components/account/ui';
import { COLORS } from '@/constants/Colors';
import { ADMIN_TOOLS } from '@/constants/adminSections';

// Admin → Tools: one-off utilities (product thumbnails backfill, search vocabulary).
export default function AdminToolsScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title} pointerEvents="none">Tools</Text>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: screen.contentBottom }]}>
        {ADMIN_TOOLS.map(t => (
          <AdminCard key={t.id} item={t} onPress={() => router.push(t.route as Href)} />
        ))}
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
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 20 },
});
