import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import AdminTabsScreen from '@/components/admin/AdminTabsScreen';
import AdminCalendarDayScreen from './calendar/[date]';
import AdminCalendarScreen from './calendar';
import AdminReservationsScreen from './reservations';

// Admin → Rentals: Today (calendar day screen for today) · Calendar · All (reservations
// list) — the existing screens in their `embedded` mode. `?tab=today|calendar|all`.
// /admin/calendar, /admin/calendar/[date] and /admin/reservations still work on their own.

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminRentalsScreen() {
  const router = useRouter();
  return (
    <AdminTabsScreen
      title="Rentals"
      right={(
        <TouchableOpacity hitSlop={8} accessibilityRole="button" accessibilityLabel="Scan a booking QR"
          onPress={() => router.push('/admin/scan')} activeOpacity={0.7}
          style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.warmBeige }}>
          <Feather name="maximize" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
      )}
      tabs={[
        { key: 'today', label: 'Today', render: () => <AdminCalendarDayScreen embedded date={todayKey()} /> },
        { key: 'calendar', label: 'Calendar', render: () => <AdminCalendarScreen embedded /> },
        { key: 'all', label: 'All', render: () => <AdminReservationsScreen embedded /> },
      ]}
    />
  );
}
