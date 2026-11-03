import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUnreadInboxCount } from '@/lib/chat';
import { TierUpCelebration } from '@/components/TierUpCelebration';
import { AccountBannersProvider } from '@/components/auth/AccountBanners';


function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={name as never} size={20} color={focused ? COLORS.amber : COLORS.fg3} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isAdmin, user, hasAccount } = useAuth();
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);


  // ── Admin inbox badge ──────────────────────────────────────────────────────
  // Live badge count — only admins can read this query (firestore.rules).
  useEffect(() => {
    if (!isAdmin) {
      setUnreadInboxCount(0);
      return;
    }
    return subscribeToUnreadInboxCount(setUnreadInboxCount, () => setUnreadInboxCount(0));
  }, [isAdmin]);

  return (
    <AccountBannersProvider>
    <View style={styles.root}>
      {/* Tier-up celebration — once per tier reached (loyalty) */}
      <TierUpCelebration />
      {/* Remounted when the session changes (guest → account, sign-out): every tab re-reads
          its data for the new account. Screens stacked above (product…) stay as they are. */}
      <Tabs
        key={`${user?.uid ?? 'none'}:${hasAccount ? 'account' : 'guest'}`}
        // Android back returns to the previously visited tab (e.g. Home after a category
        // bubble opened Explore), then exits from the first tab as before.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarStyle: [styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }],
          tabBarActiveTintColor: COLORS.amber,
          tabBarInactiveTintColor: COLORS.fg3,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          tabBarBackground: () => <View style={styles.tabBarBg} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => <TabIcon name="home" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ focused }) => <TabIcon name="grid" color={COLORS.amber} focused={focused} />,
          }}
        />
        {/* Renters never see this tab — href: null unlinks it from the bar
            entirely while isAdmin is false. The inbox screen itself also
            guards against direct navigation. */}
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            href: isAdmin ? undefined : null,
            tabBarBadge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
            tabBarBadgeStyle: styles.tabBarBadge,
            tabBarIcon: ({ focused }) => <TabIcon name="message-circle" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'Reservations',
            tabBarIcon: ({ focused }) => <TabIcon name="file-text" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: 'My Account',
            tabBarIcon: ({ focused }) => <TabIcon name="user" color={COLORS.amber} focused={focused} />,
          }}
        />
      </Tabs>
    </View>
    </AccountBannersProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarBg: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  tabItem: {
    paddingTop: 0,
  },
  tabIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    // The active icon stays transparent — color change handled by Feather icon color
  },
  tabBarBadge: {
    backgroundColor: COLORS.amber,
    color: COLORS.carbon,
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Email verified success banner ─────────────────────────────────────────
});
