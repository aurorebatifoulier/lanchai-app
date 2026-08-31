import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import type { RentalDoc } from '@/lib/firestore';
import { sendNotif } from '@/lib/notifications';
import { ConfirmBox } from './ConfirmBox';

// Single source of truth for closing out a returned reservation's finances —
// refund the deposit, collect an outstanding balance, or write it off. Reused by
// app/admin/reservations/[id].tsx and the post-checklist return-confirmation screen
// (app/admin/reservations/[id]/checklist.tsx) so the two entry points can never
// diverge. Each write here also sets returnFinalizedAt, which is what gates stock
// release (pendingSettlementUnits / releaseSettledStock / the 12h handoff buffer) —
// this component doesn't touch that machinery directly, it only triggers it exactly
// as the original reservation-detail actions already did.
export type SettlementConfirmAction = 'deposit' | 'settle_outstanding' | 'write_off_outstanding';

export interface SettlementActionsProps {
  reservation: RentalDoc;
  confirmAction: SettlementConfirmAction | null;
  setConfirmAction: (a: SettlementConfirmAction | null) => void;
  actioning: boolean;
  setActioning: (v: boolean) => void;
  setActionError: (e: string | null) => void;
  // Mirrors the localUpdates contract of the reservation-detail screen's own
  // runAction — the caller merges this into whichever `reservation` state it owns.
  onSettled: (localUpdates: Partial<RentalDoc>) => void;
}

export function SettlementActions({
  reservation,
  confirmAction,
  setConfirmAction,
  actioning,
  setActioning,
  setActionError,
  onSettled,
}: SettlementActionsProps) {
  const [depositStaffName,     setDepositStaffName]     = useState('');
  const [stockReleaseHandling, setStockReleaseHandling]  = useState<'release' | 'repair' | null>(null);
  const [settleStaffName,      setSettleStaffName]      = useState('');
  const [writeOffStaffName,    setWriteOffStaffName]    = useState('');
  const [writeOffNotes,        setWriteOffNotes]        = useState('');

  const runAction = useCallback(async (
    firestoreUpdates: Record<string, unknown>,
    localUpdates: Partial<RentalDoc>,
    onSuccess?: () => void,
  ) => {
    if (actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      await updateDoc(doc(db, 'reservations', reservation.id), {
        ...firestoreUpdates,
        updatedAt: serverTimestamp(),
      });
      onSettled(localUpdates);
      onSuccess?.();
    } catch (err: any) {
      console.error('[SettlementActions] action error:', err?.code, err?.message);
      setActionError('Failed to update. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [reservation.id, actioning, onSettled, setActioning, setActionError, setConfirmAction]);

  if (reservation.status !== 'returned') return null;

  const depositReturned      = reservation.depositReturned ?? false;
  const outstandingBalance   = reservation.outstandingBalance ?? 0;
  const outstandingSettled   = reservation.outstandingSettled ?? false;
  const outstandingWrittenOff = reservation.outstandingWrittenOff ?? false;
  const depositHeldAmount    = reservation.handoverChecklist?.depositAmount ?? reservation.deposit;
  const depositAppliedToCharge = reservation.depositAppliedToCharge ?? 0;
  const hasCharge = (reservation.chargeAmount != null || reservation.lateChargeAmount != null)
    && reservation.chargeCurrency != null;
  const currency = reservation.chargeCurrency ?? reservation.handoverChecklist?.depositCurrency ?? 'LAK';
  const refundAmount = Math.max(0, depositHeldAmount - depositAppliedToCharge);
  const fmt = (n: number) => `${n.toLocaleString('en-US')} ${currency}`;

  // ── Client-owes track — takes priority: a charge that meets/exceeds the deposit
  // leaves nothing to give back, so this and the deposit track below are mutually
  // exclusive, exactly like the original reservation-detail gating. ────────────────
  if (outstandingBalance > 0) {
    if (outstandingSettled || outstandingWrittenOff) return null; // already resolved

    if (confirmAction === 'settle_outstanding') {
      return (
        <ConfirmBox
          text={`Confirm the ${fmt(outstandingBalance)} outstanding balance has been collected from the renter?`}
          confirmLabel="Mark as settled"
          confirmDisabled={settleStaffName.trim().length === 0}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => runAction(
            {
              outstandingSettled: true,
              outstandingSettledAt: serverTimestamp(),
              outstandingSettledBy: settleStaffName.trim(),
              returnFinalizedAt: serverTimestamp(),
            },
            { outstandingSettled: true, outstandingSettledBy: settleStaffName.trim() },
          )}
        >
          <TextInput
            style={s.nameInput}
            placeholder="Staff member name"
            placeholderTextColor={COLORS.fg3}
            value={settleStaffName}
            onChangeText={setSettleStaffName}
          />
        </ConfirmBox>
      );
    }

    if (confirmAction === 'write_off_outstanding') {
      return (
        <ConfirmBox
          text={`Confirm the ${fmt(outstandingBalance)} outstanding balance cannot be collected and should be written off? This does not record it as paid.`}
          confirmLabel="Write off balance"
          confirmDisabled={writeOffStaffName.trim().length === 0}
          muted
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => runAction(
            {
              outstandingWrittenOff: true,
              outstandingWrittenOffAt: serverTimestamp(),
              outstandingWrittenOffBy: writeOffStaffName.trim(),
              ...(writeOffNotes.trim() ? { outstandingWrittenOffNotes: writeOffNotes.trim() } : {}),
              returnFinalizedAt: serverTimestamp(),
            },
            {
              outstandingWrittenOff: true,
              outstandingWrittenOffBy: writeOffStaffName.trim(),
              ...(writeOffNotes.trim() ? { outstandingWrittenOffNotes: writeOffNotes.trim() } : {}),
            },
          )}
        >
          <TextInput
            style={s.nameInput}
            placeholder="Staff member name"
            placeholderTextColor={COLORS.fg3}
            value={writeOffStaffName}
            onChangeText={setWriteOffStaffName}
          />
          <TextInput
            style={s.nameInput}
            placeholder="Notes (optional) — e.g. unreachable, police report filed"
            placeholderTextColor={COLORS.fg3}
            value={writeOffNotes}
            onChangeText={setWriteOffNotes}
          />
        </ConfirmBox>
      );
    }

    return (
      <>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => setConfirmAction('settle_outstanding')}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>Collect {fmt(outstandingBalance)} from client</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => setConfirmAction('write_off_outstanding')}
          activeOpacity={0.85}
        >
          <Text style={s.secondaryBtnText}>Write off {fmt(outstandingBalance)}</Text>
        </TouchableOpacity>
      </>
    );
  }

  // ── Deposit track — clean, refund-due, or even. ─────────────────────────────────
  if (depositReturned) return null; // already resolved

  const depositLabel = refundAmount === 0
    ? 'Mark settled — deposit fully applied'
    : !hasCharge
    ? `Refund full deposit — ${fmt(refundAmount)}`
    : `Refund ${fmt(refundAmount)} to client`;
  const depositConfirmText = refundAmount === 0
    ? `Confirm this reservation is settled — the ${fmt(depositHeldAmount)} deposit was fully applied to charges, nothing to refund?`
    : `Confirm ${fmt(refundAmount)} has been refunded to the renter?`;

  if (confirmAction === 'deposit') {
    return (
      <ConfirmBox
        text={depositConfirmText}
        confirmLabel="Confirm"
        confirmDisabled={depositStaffName.trim().length === 0 || (reservation.chargeSeverity === 'damaged' && stockReleaseHandling === null)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction(
          {
            depositReturned: true,
            depositReturnedBy: depositStaffName.trim(),
            returnFinalizedAt: serverTimestamp(),
            ...(reservation.chargeSeverity === 'damaged' ? { stockReleaseHandling } : {}),
          },
          { depositReturned: true, depositReturnedBy: depositStaffName.trim() },
          () => sendNotif(reservation.renterId, {
            type: 'rental',
            icon: 'check',
            iconColor: 'green',
            title: 'Deposit returned',
            body: `Your ${fmt(refundAmount)} deposit for ${reservation.productName} has been returned.`,
            deepLink: `/rentals/${reservation.id}`,
          }),
        )}
      >
        <TextInput
          style={s.nameInput}
          placeholder="Staff member name"
          placeholderTextColor={COLORS.fg3}
          value={depositStaffName}
          onChangeText={setDepositStaffName}
        />
        {reservation.chargeSeverity === 'damaged' && (
          <View style={s.releaseChoiceRow}>
            <TouchableOpacity
              style={[s.releaseChoiceBtn, stockReleaseHandling === 'release' && s.releaseChoiceBtnActive]}
              onPress={() => setStockReleaseHandling('release')}
              activeOpacity={0.8}
            >
              <Text style={[s.releaseChoiceText, stockReleaseHandling === 'release' && s.releaseChoiceTextActive]}>
                Back to stock
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.releaseChoiceBtn, stockReleaseHandling === 'repair' && s.releaseChoiceBtnActive]}
              onPress={() => setStockReleaseHandling('repair')}
              activeOpacity={0.8}
            >
              <Text style={[s.releaseChoiceText, stockReleaseHandling === 'repair' && s.releaseChoiceTextActive]}>
                Needs repair
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ConfirmBox>
    );
  }

  return (
    <TouchableOpacity
      style={s.primaryBtn}
      onPress={() => { setStockReleaseHandling(null); setConfirmAction('deposit'); }}
      activeOpacity={0.85}
    >
      <Text style={s.primaryBtnText}>{depositLabel}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  nameInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.carbon, marginBottom: 8,
  },
  releaseChoiceRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  releaseChoiceBtn: {
    flex: 1,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', backgroundColor: COLORS.white,
  },
  releaseChoiceBtnActive: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  releaseChoiceText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  releaseChoiceTextActive: { color: COLORS.carbon },
  primaryBtn: {
    height: 52, borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.1 },
  secondaryBtn: {
    height: 52, borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.fg2, letterSpacing: -0.1 },
});
