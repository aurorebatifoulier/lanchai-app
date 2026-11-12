import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import { UI, useScreenInsets } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';

// Admin hub with tabs (Rentals, App content): each tab renders an EXISTING screen in its
// `embedded` mode. Initial tab from `?tab=`. A tab is mounted on its first visit, then
// kept mounted (hidden) so switching tabs doesn't restart its listeners or lose its
// search / filters. Fabric rule: ONE fixed sibling (header + tabs) above the content.

export interface AdminTab { key: string; label: string; render: () => React.ReactNode }

export default function AdminTabsScreen({ title, tabs, right }: {
  title: string;
  tabs: AdminTab[];
  /** Optional header action (right side). */
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const screen = useScreenInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = tabs.some(t => t.key === params.tab) ? params.tab! : tabs[0].key;
  const [tab, setTab] = useState(initial);
  const [visited, setVisited] = useState<Set<string>>(() => new Set([initial]));

  const select = (key: string) => {
    setTab(key);
    setVisited(v => (v.has(key) ? v : new Set(v).add(key)));
  };

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.fixed}>
        <View style={s.header}>
          <Text style={s.title} pointerEvents="none">{title}</Text>
          <BackButton onPress={() => router.back()} />
          <View style={s.right}>{right}</View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {tabs.map(t => {
            const on = t.key === tab;
            return (
              <TouchableOpacity key={t.key} onPress={() => select(t.key)} activeOpacity={0.8}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[UI.tabChip, on ? s.tabOn : s.tabOff]}>
                <Text style={[UI.tabChipText, { color: on ? SHADES.cream : SHADES.carbon }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={s.content}>
        {tabs.map(t => (visited.has(t.key) ? (
          <View key={t.key} style={[s.pane, t.key !== tab && s.hidden]}>{t.render()}</View>
        ) : null))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  fixed: { flexShrink: 0, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.3 },
  right: { minWidth: 40, alignItems: 'flex-end' },
  tabs: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tabOn: { backgroundColor: SHADES.carbon },
  tabOff: { backgroundColor: SHADES.carbonLight },
  content: { flex: 1 },
  pane: { flex: 1 },
  hidden: { display: 'none' },
});
