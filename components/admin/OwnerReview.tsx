import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { serverTimestamp, deleteField } from 'firebase/firestore';
import { Text, TextInput } from '@/components/AppText';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import type { RentalDoc } from '@/lib/firestore';
import { auditedReservationUpdate } from '@/lib/adminAudit';
import { refusePickup, resolveOwnerAlert, myAdminName } from '@/lib/staffOps';

// Owner decisions after a staff action (admin roles, phase 2):
//   • <DamageReviewCard> — a staff return with damage: the deposit is held
//     (chargeReviewPending) until the owner confirms, reduces or waives the suggestion;
//     the usual settlement (SettlementActions) follows.
//   • <PickupRefusedCard> — staff refused a pick-up (reason); owners close it once handled.
// And the staff side: <RefusePickupBox> (reason + optional "flag the ID for review").

const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('en-US')} ${cur}`;

/** Deposit split after a change of the damage amount (late fee unchanged). */
function split(r: RentalDoc, damage: number) {
  const held = r.returnChecklist?.depositAmount ?? 0;
  const total = damage + (r.lateChargeAmount ?? 0);
  return { depositAppliedToCharge: Math.min(total, held), outstandingBalance: Math.max(0, total - held) };
}

export function DamageReviewCard({ reservation: r, onDone }: {
  reservation: RentalDoc;
  onDone: (fields: Partial<RentalDoc>) => void;
}) {
  const [mode, setMode] = useState<null | 'confirm' | 'reduce' | 'waive'>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!r.chargeReviewPending) return null;
  const cur = r.chargeCurrency ?? r.returnChecklist?.depositCurrency ?? 'LAK';
  const suggestion = r.chargeAmount ?? null;
  const held = r.returnChecklist?.depositAmount ?? 0;
  const by = myAdminName();
  const reviewed = { chargeReviewPending: false, chargeReviewedAt: serverTimestamp(), chargeReviewedBy: by };

  const run = async (fields: Record<string, unknown>, local: Partial<RentalDoc>, action: string, note: string) => {
    setBusy(true); setError(null);
    try {
      await auditedReservationUpdate(r, fields, action, note);
      onDone({ ...local, chargeReviewPending: false });
      setMode(null);
    } catch {
      setError('Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const typed = Math.ceil(Number(amount.replace(/[\s,]/g, '')));
  const typedOk = Number.isFinite(typed) && typed > 0 && (suggestion == null || typed < suggestion);

  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>Damage charge to review</Text>
      <Text style={UI.small}>
        {`Returned${r.returnedBy ? ` by ${r.returnedBy.name}` : ''} as ${r.chargeReason ?? 'damaged'}`}
        {r.chargeUnits ? ` · ${r.chargeUnits} unit${r.chargeUnits > 1 ? 's' : ''}` : ''}. The deposit ({fmt(held, cur)}) is held until you decide.
      </Text>
      <Text style={s.figure}>
        {suggestion != null ? `Suggested: ${fmt(suggestion, cur)}${r.chargePercent ? ` (${r.chargePercent}% of the replacement value)` : ''}` : 'No suggestion (replacement value or rate missing) — set the amount.'}
      </Text>
      {!!r.lateChargeAmount && <Text style={UI.small}>{`Late fee already applied: ${fmt(r.lateChargeAmount, cur)}`}</Text>}
      {!!error && <Text style={UI.errorText}>{error}</Text>}
      {busy ? <ActivityIndicator color={SHADES.amber} /> : mode === 'confirm' ? (
        <ConfirmBox text={`Charge ${fmt(suggestion ?? 0, cur)} for the damage?`} confirmLabel="Confirm charge"
          onCancel={() => setMode(null)}
          onConfirm={() => run(reviewed, {}, 'damage.confirmed', `${suggestion} ${cur}`)} />
      ) : mode === 'reduce' ? (
        <ConfirmBox text={suggestion != null ? `New damage charge (less than ${fmt(suggestion, cur)}):` : 'Damage charge:'}
          confirmLabel="Save amount" confirmDisabled={!typedOk}
          onCancel={() => setMode(null)}
          onConfirm={() => {
            const fields = {
              ...reviewed, chargeAmount: typed, ...split(r, typed),
              ...(suggestion != null ? { damageChargeSuggested: suggestion } : {}),
            };
            run(fields, { chargeAmount: typed, ...split(r, typed) }, 'damage.reduced', `${suggestion ?? '—'} → ${typed} ${cur}`);
          }}>
          <TextInput style={[UI.input, { marginTop: 8 }]} value={amount} onChangeText={setAmount}
            keyboardType="number-pad" placeholder={cur} placeholderTextColor={SHADES.carbonPlaceholder} />
        </ConfirmBox>
      ) : mode === 'waive' ? (
        <ConfirmBox text="Waive the damage charge? The renter sees “Damage charge · waived by our team”." confirmLabel="Waive"
          onCancel={() => setMode(null)}
          onConfirm={() => run({
            ...reviewed,
            damageChargeWaived: true,
            ...(suggestion != null ? { damageChargeWaivedAmount: suggestion } : {}),
            damageChargeWaivedReason: r.chargeReason ?? 'Item condition',
            ...(r.chargePercent != null ? { damageChargeWaivedPercent: r.chargePercent } : {}),
            damageChargeWaivedBy: by,
            damageChargeWaivedAt: serverTimestamp(),
            chargeAmount: deleteField(), chargeReason: deleteField(), chargePercent: deleteField(),
            ...split(r, 0),
          }, { chargeAmount: undefined, damageChargeWaived: true, ...split(r, 0) }, 'damage.waived', `${suggestion ?? '—'} ${cur}`)} />
      ) : (
        <View style={s.row}>
          {suggestion != null && (
            <TouchableOpacity style={[UI.btnPrimary, UI.btnCard, s.flex]} onPress={() => setMode('confirm')} activeOpacity={0.85}>
              <Text style={[UI.btnPrimaryText, UI.btnCardText]}>Confirm</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => { setAmount(''); setMode('reduce'); }} activeOpacity={0.85}>
            <Text style={[UI.btnSecondaryText, UI.btnCardText]}>{suggestion != null ? 'Reduce' : 'Set amount'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => setMode('waive')} activeOpacity={0.85}>
            <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Waive</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export function PickupRefusedCard({ reservation: r, owner, onDone }: {
  reservation: RentalDoc; owner: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!r.pickupRefusedOpen) return null;
  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>Pick-up refused</Text>
      <Text style={UI.small}>{`“${r.pickupRefusedReason ?? ''}” — ${r.pickupRefusedByName ?? 'staff'}`}</Text>
      {owner ? (
        <>
          <Text style={UI.small}>Cancel, mark as no-show or hand over later — then close this alert.</Text>
          {!!error && <Text style={UI.errorText}>{error}</Text>}
          <TouchableOpacity disabled={busy} style={[UI.btnSecondary, UI.btnCard, busy && UI.btnDisabled]} activeOpacity={0.85}
            onPress={async () => {
              setBusy(true); setError(null);
              try { await resolveOwnerAlert('pickup', r.id); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}>
            <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Mark as handled</Text>
          </TouchableOpacity>
        </>
      ) : <Text style={UI.small}>An owner has been told.</Text>}
    </View>
  );
}

export function RefusePickupBox({ reservationIds, onCancel, onDone }: {
  reservationIds: string[]; onCancel: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [flag, setFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmBox
      text="Don't hand the item over. Write why — the owners are told at once."
      confirmLabel={busy ? 'Saving…' : 'Refuse pick-up'}
      cancelLabel="Keep"
      confirmDisabled={busy || reason.trim().length < 3}
      onCancel={onCancel}
      onConfirm={async () => {
        setBusy(true); setError(null);
        try { await refusePickup(reservationIds, reason, flag); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
      <TextInput style={[UI.input, s.reason]} value={reason} onChangeText={setReason} multiline
        placeholder="Reason (e.g. the ID photo doesn't match)" placeholderTextColor={SHADES.carbonPlaceholder} />
      <View style={s.flagRow}>
        <Text style={[UI.body, s.flex]}>Flag the renter’s ID for an owner review</Text>
        <Switch value={flag} onValueChange={setFlag} trackColor={{ false: COLORS.softGray200, true: COLORS.amber }} thumbColor={COLORS.white} />
      </View>
      {!!error && <Text style={UI.errorText}>{error}</Text>}
    </ConfirmBox>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, marginBottom: 12, borderColor: SHADES.amber, borderWidth: 1 },
  figure: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  reason: { marginTop: 8, height: 80, paddingTop: 10, textAlignVertical: 'top' },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
});
