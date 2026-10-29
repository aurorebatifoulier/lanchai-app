import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { PROMO_COPY } from '@/constants/promoCopy';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { UI, StatusChip, useScreenInsets } from '@/components/account/ui';
import { listPromoCodes, type PromoDoc } from '@/lib/promoCodes';
import { promoStatus, type PromoStatus } from '@/functions/src/shared/promo';

// Admin → Promo codes: list (code, description, type/value, status, uses / max, total
// discount given) → promo-code-form.tsx (?code=) to create / edit. Flat routes.

const STATUS_ORDER: PromoStatus[] = ['active', 'scheduled', 'exhausted', 'expired', 'inactive'];
const TONE: Record<PromoStatus, 'success' | 'grey' | 'amber'> = {
  active: 'success', scheduled: 'amber', exhausted: 'grey', expired: 'grey', inactive: 'grey',
};

export default function PromoCodesScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const c = PROMO_COPY.admin;
  const [codes, setCodes] = useState<PromoDoc[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(useCallback(() => {
    listPromoCodes().then(setCodes).catch(() => setError(true));
  }, []));

  const now = Date.now();
  const sorted = (codes ?? []).map(p => ({ p, status: promoStatus(p, now) }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.p.code.localeCompare(b.p.code));

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{c.title}</Text>
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom, gap: 10 }]}>
        <PressScale style={[UI.btnPrimary, { marginTop: 16 }]} onPress={() => router.push('/admin/promo-code-form' as never)}>
          <Feather name="plus" size={17} color={SHADES.carbon} />
          <Text style={UI.btnPrimaryText}>{c.new}</Text>
        </PressScale>
        {codes == null && !error && <ActivityIndicator color={SHADES.amber} style={{ marginTop: 24 }} />}
        {error && <Text style={UI.errorText}>{c.errors.save}</Text>}
        {codes?.length === 0 && <Text style={[UI.body, { textAlign: 'center', marginTop: 20 }]}>{c.empty}</Text>}
        {sorted.map(({ p, status }) => (
          <PressScale key={p.code} style={[UI.card, s.row]} onPress={() => router.push(`/admin/promo-code-form?code=${p.code}` as never)}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={s.top}>
                <Text style={s.code}>{p.code}</Text>
                <StatusChip label={c.status[status]} tone={TONE[status]} />
              </View>
              {!!p.description && <Text style={UI.subtitle} numberOfLines={1}>{p.description}</Text>}
              <Text style={s.meta}>
                {p.type === 'percent' ? c.valuePercent(p.value) : c.valueFixed(p.value.toLocaleString('en-US'))}
                {' · '}{c.uses(p.usedCount ?? 0, p.maxUses ?? null)}
                {' · '}{c.given((p.discountGivenLak ?? 0).toLocaleString('en-US'))}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={SHADES.carbonMuted} />
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 16, fontWeight: '800', color: SHADES.carbon, letterSpacing: 0.5 },
  meta: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
});
