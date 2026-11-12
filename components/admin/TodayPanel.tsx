import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import PressScale from '@/components/PressScale';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import type { TodayCounts } from '@/lib/adminToday';

// Admin dashboard "Today": 4 tappable counters + "Scan a booking QR".
// `counts` null = still loading / unavailable → "—" (never a fake 0).

function Counter({ label, value, detail, danger, onPress }: {
  label: string; value: number | null; detail?: string; danger?: boolean; onPress: () => void;
}) {
  const red = danger && value != null && value > 0;
  return (
    <PressScale style={[UI.card, s.tile]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? 'loading'}`}>
      <Text style={[s.value, red && s.valueDanger]}>{value == null ? '—' : value}</Text>
      <Text style={s.label} numberOfLines={1}>{label}</Text>
      {!!detail && <Text style={s.detail} numberOfLines={1}>{detail}</Text>}
    </PressScale>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function TodayPanel({ counts }: { counts: TodayCounts | null }) {
  const router = useRouter();
  const today = () => router.push('/admin/rentals?tab=today');
  const ids = counts?.idChecks ?? 0;
  const claims = counts?.claims ?? 0;
  const toCheckDetail = [ids > 0 && plural(ids, 'ID', 'IDs'), claims > 0 && plural(claims, 'claim', 'claims')]
    .filter(Boolean).join(' · ') || undefined;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Today</Text>
      <View style={s.grid}>
        <Counter label="Pick-ups today" value={counts?.pickups ?? null} onPress={today} />
        <Counter label="Returns today" value={counts?.returns ?? null} onPress={today} />
      </View>
      <View style={s.grid}>
        <Counter label="Late returns" value={counts?.late ?? null} danger onPress={today} />
        <Counter label="To check" value={counts?.toCheck ?? null} detail={toCheckDetail}
          onPress={() => router.push(ids === 0 && claims > 0
            ? '/admin/claims'
            : '/admin/verifications?tab=identity')} />
      </View>
      <PressScale style={[UI.btnPrimary, s.scan]} onPress={() => router.push('/admin/scan')}
        accessibilityRole="button" accessibilityLabel="Scan a booking QR">
        <Feather name="maximize" size={18} color={SHADES.carbon} />
        <Text style={UI.btnPrimaryText}>Scan a booking QR</Text>
      </PressScale>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: SHADES.carbon },
  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, minHeight: 92 },
  value: { fontSize: 22, fontWeight: '800', color: SHADES.carbon },
  valueDanger: { color: COLORS.danger },
  label: { fontSize: 13, fontWeight: '600', color: SHADES.carbon, marginTop: 2 },
  detail: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  scan: { marginTop: 4 },
});
