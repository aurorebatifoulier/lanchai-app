import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { Text } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import { ChecklistSummary } from '@/components/ChecklistSummary';
import { SettlementSummary } from '@/components/SettlementSummary';
import { useScreenInsets, UI } from '@/components/account/ui';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { db } from '@/lib/firebase';
import type { RentalDoc } from '@/lib/firestore';

// Read-only view of a recorded handover / return checklist (?mode=view). Doing a
// pick-up or a return is a flow of its own now: app/admin/pickup.tsx (4 steps) and
// app/admin/return.tsx (3 steps) — the old links redirect there.
type ChecklistType = 'handover' | 'return';

export default function ChecklistRoute() {
  const { id, type, mode } = useLocalSearchParams<{ id: string; type: ChecklistType; mode?: 'view' }>();
  if (mode !== 'view') {
    return <Redirect href={type === 'return' ? `/admin/return?ids=${id}` : `/admin/pickup?ids=${id}`} />;
  }
  return <ChecklistView id={id} type={type} />;
}

function ChecklistView({ id, type }: { id: string; type: ChecklistType }) {
  const router = useRouter();
  const screen = useScreenInsets();
  const [reservation, setReservation] = useState<RentalDoc | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'reservations', id), snap => {
      if (!snap.exists()) { setState('error'); return; }
      setReservation({ id, ...snap.data() } as RentalDoc);
      setState('ready');
    }, () => setState('error'));
  }, [id]);

  const title = type === 'handover' ? 'Pick-up checklist' : 'Return checklist';
  const saved = type === 'handover' ? reservation?.handoverChecklist : reservation?.returnChecklist;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={s.titleBlock} pointerEvents="none">
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {!!reservation?.productName && <Text style={s.subtitle} numberOfLines={1}>{reservation.productName}</Text>}
        </View>
        <BackButton onPress={() => router.back()} />
      </View>
      {state === 'loading' ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /> : !reservation || !saved ? (
        <View style={s.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={s.stateText}>Couldn’t load this checklist</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}>
          <ChecklistSummary checklist={saved} title={title} showStaffName />
          {type === 'return' && (reservation.chargeAmount != null || reservation.lateChargeAmount != null) && reservation.chargeCurrency != null && (
            <View style={{ marginTop: 12 }}>
              <SettlementSummary
                chargeAmount={reservation.chargeAmount}
                chargeReason={reservation.chargeReason}
                lateChargeAmount={reservation.lateChargeAmount}
                lateChargeReason={reservation.lateChargeReason}
                depositAmount={saved.depositAmount ?? 0}
                depositCurrency={reservation.chargeCurrency}
                depositAppliedToCharge={reservation.depositAppliedToCharge ?? 0}
                outstandingBalance={reservation.outstandingBalance ?? 0}
                outstandingSettled={reservation.outstandingSettled}
                outstandingSettledBy={reservation.outstandingSettledBy}
                outstandingWrittenOff={reservation.outstandingWrittenOff}
                outstandingWrittenOffBy={reservation.outstandingWrittenOffBy}
              />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, minHeight: 64 },
  titleBlock: { position: 'absolute', left: 76, right: 76, alignItems: 'center' },
  title: { ...TYPE.sectionTitle, color: SHADES.carbon },
  subtitle: { ...TYPE.secondary, color: SHADES.carbonMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  stateText: { ...TYPE.sectionTitle, color: SHADES.carbon, textAlign: 'center' },
});
