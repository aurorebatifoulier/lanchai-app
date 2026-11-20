import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle, useScreenInsets } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { phaseOf, PHASE_LABELS, canDo } from '@/functions/src/shared/reservationMachine';
import {
  loadReservationsForCheck, previewRelease, applyRelease, fmtDay,
  type Violation, type ProductRelease,
} from '@/lib/dataCheck';
import { myAdminName } from '@/lib/staffOps';

// Admin → Tools → Data check (owner): every reservation whose data contradicts the state
// machine (open it, settle it the normal way, or archive it from its detail — closed
// bookings only, reason required), and the units ARCHIVED bookings still hold out of
// stock: "Release units" shows the change per product BEFORE applying it.

export default function AdminDataCheckScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [plan, setPlan] = useState<ProductRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadReservationsForCheck()
      .then(async ({ violations: v, archived }) => {
        setViolations(v);
        setPlan(await previewRelease(archived));
      })
      .catch(() => setError('Couldn’t load the bookings. Please try again.'));
  }, []);
  useFocusEffect(load);

  const total = plan?.reduce((s, p) => s + p.release, 0) ?? 0;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title} pointerEvents="none">Data check</Text>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}>
        {!!error && <Text style={UI.errorText}>{error}</Text>}

        <SectionTitle>Bookings that break the rules</SectionTitle>
        {violations == null ? <ActivityIndicator color={SHADES.amber} /> : violations.length === 0 ? (
          <Text style={UI.small}>Nothing to fix.</Text>
        ) : violations.map(({ reservation: r, issues }) => {
          const phase = phaseOf(r);
          return (
            <TouchableOpacity key={r.id} style={[UI.card, UI.cardPadded, s.row]} activeOpacity={0.85}
              onPress={() => router.push(`/admin/reservations/${r.id}`)}>
              <Text style={UI.title} numberOfLines={1}>{`${r.productName} · ${r.renterName ?? '—'}`}</Text>
              <Text style={UI.small}>{`${phase ? PHASE_LABELS[phase] : r.status} · created ${fmtDay(r.createdAt)}`}</Text>
              {issues.map(i => <Text key={i} style={s.issue}>{`• ${i}`}</Text>)}
              <Text style={UI.small}>
                {canDo(r, 'archive', 'owner') ? 'Open → settle it, or “Archive (test / data fix)”.' : 'Open → finish it first (cancel or return), then archive if it was a test.'}
              </Text>
            </TouchableOpacity>
          );
        })}

        <SectionTitle>Units held by archived bookings</SectionTitle>
        {plan == null ? <ActivityIndicator color={SHADES.amber} /> : plan.length === 0 ? (
          <Text style={UI.small}>No archived booking holds units out of stock.</Text>
        ) : (
          <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
            <Text style={UI.small}>Pending-settlement units, per product — before → after:</Text>
            {plan.map(p => (
              <View key={p.productId} style={s.planRow}>
                <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>{p.productName}</Text>
                <Text style={s.figure}>{`${p.current} → ${p.after}`}</Text>
              </View>
            ))}
            {plan.some(p => p.release < p.lines.reduce((x, l) => x + l.units, 0)) && (
              <Text style={UI.small}>Some products hold fewer units than the log says — never below 0.</Text>
            )}
            {!!done && <Text style={UI.small}>{done}</Text>}
            {confirm ? (
              <ConfirmBox text={`Release ${total} unit(s) back into bookable stock? Recorded in each product’s stock log and the bookings’ history.`}
                confirmLabel={busy ? 'Releasing…' : 'Release units'} confirmDisabled={busy || total === 0}
                onCancel={() => setConfirm(false)}
                onConfirm={async () => {
                  setBusy(true); setError(null);
                  try {
                    await applyRelease(plan, myAdminName());
                    setDone(`${total} unit(s) released.`);
                    setConfirm(false);
                    load();
                  } catch {
                    setError('Couldn’t release the units. Nothing was changed.');
                  } finally {
                    setBusy(false);
                  }
                }} />
            ) : (
              <TouchableOpacity disabled={total === 0} style={[UI.btnPrimary, total === 0 && UI.btnDisabled]}
                onPress={() => setConfirm(true)} activeOpacity={0.85}>
                <Text style={UI.btnPrimaryText}>{`Release units (${total})`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
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
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.3 },
  row: { gap: 4, marginBottom: 10 },
  issue: { fontSize: 13, fontWeight: '600', color: COLORS.danger },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  figure: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
});
