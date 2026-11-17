import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { adjustProductStockCondition } from '@/lib/firestore';
import { myAdminName } from '@/lib/staffOps';

// Stock → "In repair" (staff + owner): move ONE unit into repair / back from repair, with
// a reason, through the audited stock adjustment (products/{id}/stockAdjustments). The
// only product change staff may make (firestore.rules). Lost units / stock counts stay
// on the owner's product form.
export function RepairStockCard({ productId, inRepair, bookable, onChanged }: {
  productId: string; inRepair: number; bookable: number; onChanged: (inRepair: number) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<null | 'in' | 'out'>(null);
  const [error, setError] = useState<string | null>(null);

  const move = async (delta: 1 | -1) => {
    setBusy(delta > 0 ? 'in' : 'out'); setError(null);
    try {
      await adjustProductStockCondition(productId, 'inRepairUnits', delta,
        reason.trim() || (delta > 0 ? 'Marked in repair' : 'Back from repair'), myAdminName());
      onChanged(inRepair + delta);
      setReason('');
    } catch {
      setError('Couldn’t update. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>{`In repair: ${inRepair}`}</Text>
      <TextInput style={UI.input} value={reason} onChangeText={setReason} editable={!busy}
        placeholder="Reason (e.g. broken zip)" placeholderTextColor={SHADES.carbonPlaceholder} />
      {!!error && <Text style={UI.errorText}>{error}</Text>}
      <View style={s.row}>
        <TouchableOpacity disabled={!!busy || bookable < 1 || reason.trim().length < 3}
          style={[UI.btnSecondary, UI.btnCard, s.flex, (!!busy || bookable < 1 || reason.trim().length < 3) && UI.btnDisabled]}
          onPress={() => move(1)} activeOpacity={0.85}>
          {busy === 'in' ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Mark 1 in repair</Text>}
        </TouchableOpacity>
        <TouchableOpacity disabled={!!busy || inRepair < 1}
          style={[UI.btnSecondary, UI.btnCard, s.flex, (!!busy || inRepair < 1) && UI.btnDisabled]}
          onPress={() => move(-1)} activeOpacity={0.85}>
          {busy === 'out' ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={[UI.btnSecondaryText, UI.btnCardText]}>1 back from repair</Text>}
        </TouchableOpacity>
      </View>
      <Text style={UI.small}>A reason is needed to put a unit in repair.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
