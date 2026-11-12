import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { countNewItemRequests } from '@/lib/itemRequests';
import { fetchAdminToday, type TodayCounts } from '@/lib/adminToday';
import TodayPanel from '@/components/admin/TodayPanel';
import AdminCard from '@/components/admin/AdminCard';
import { ADMIN_GROUPS, ADMIN_SECTIONS, type AdminBadge } from '@/constants/adminSections';

// Admin dashboard: "Today" panel, then the entries of constants/adminSections.ts group
// by group (the ONE list — phase 2 will filter it on minRole).

export default function AdminHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [today, setToday] = useState<TodayCounts | null>(null);
  const [badges, setBadges] = useState<Partial<Record<AdminBadge, number>>>({});

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const setBadge = (k: AdminBadge, n: number) => { if (alive) setBadges(b => ({ ...b, [k]: n })); };

      fetchAdminToday()
        .then(c => {
          if (!alive) return;
          setToday(c);
          if (c.late != null) setBadge('late', c.late);
          if (c.claims != null) setBadge('claims', c.claims);
        })
        .catch(() => {});

      // Verifications badge: pending business accounts + pending residency requests.
      Promise.all([
        getDocs(query(collection(db, 'users'), where('btobStatus', '==', 'pending_approval'))).then(x => x.size).catch(() => 0),
        getDocs(query(collection(db, 'residencyRequests'), where('status', '==', 'pending'))).then(x => x.size).catch(() => 0),
      ]).then(([btob, residency]) => setBadge('verifications', btob + residency));

      countNewItemRequests().then(n => setBadge('requests', n)).catch(() => {});
      return () => { alive = false; };
    }, []),
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Lanchai admin dashboard</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <TodayPanel counts={today} />

        {ADMIN_GROUPS.map(g => {
          const items = ADMIN_SECTIONS.filter(x => x.group === g.id);
          if (items.length === 0) return null;
          return (
            <View key={g.id}>
              <Text style={s.groupTitle}>{g.title}</Text>
              {items.map(item => (
                <AdminCard
                  key={item.id}
                  item={item}
                  badge={item.badge ? badges[item.badge] : undefined}
                  onPress={() => router.push(item.route as Href)}
                />
              ))}
            </View>
          );
        })}
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
  content: { paddingHorizontal: 16, paddingTop: 20 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: COLORS.fg3, marginTop: 20, marginBottom: 8, marginLeft: 4 },
});
