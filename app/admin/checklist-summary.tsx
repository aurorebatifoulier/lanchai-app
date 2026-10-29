import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import {
  getReservationById,
  getUserProfile,
  submitChecklistBatch,
  type RentalDoc,
  type ChecklistData,
} from '@/lib/firestore';
import { sendNotif } from '@/lib/notifications';
import { MultiCurrencyAmount } from '@/components/MultiCurrencyAmount';
import { useExchangeRate, useThbRate } from '@/lib/exchangeRate';
import { lakToUsd, lakToThb } from '@/utils/currency';
import { getChainItemDraft, clearChainDrafts } from '@/lib/checklistChainDraft';
import { useIdCheck, IdCheckSection } from '@/components/admin/IdCheckSection';
import { AgreementSection, initialAgreementState, type AgreementState } from '@/components/admin/AgreementSection';
import { conditionLines, type HandoverInfo } from '@/lib/rentalAgreement';
import { PaymentMethodChips } from '@/components/admin/PaymentMethodChips';
import type { RentalPaymentMethod } from '@/functions/src/shared/rentalAgreement';

type ChecklistType = 'handover' | 'return';
type DepositCurrency = 'LAK' | 'USD' | 'THB';

// Proportional-share allocation with the remainder dumped on the last item so shares
// always sum exactly to totalAmount — same shape as app/bag/checkout.tsx's
// prorateDiscount, generalized with a `decimals` param (0 for LAK, 2 for USD/THB).
function prorateDeposit(items: { deposit: number }[], totalAmount: number, decimals: number): number[] {
  const scale = 10 ** decimals;
  const totalDeposit = items.reduce((s, i) => s + i.deposit, 0);
  if (totalDeposit <= 0) return items.map(() => 0);
  const totalScaled = Math.round(totalAmount * scale);
  const sharesScaled = items.map(i => Math.round((totalScaled * i.deposit) / totalDeposit));
  const allocatedScaled = sharesScaled.reduce((s, v) => s + v, 0);
  if (sharesScaled.length > 0) sharesScaled[sharesScaled.length - 1] += totalScaled - allocatedScaled;
  return sharesScaled.map(v => v / scale);
}

export default function ChecklistSummaryScreen() {
  const { ids, type } = useLocalSearchParams<{ ids?: string; type: ChecklistType }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const exchangeRate = useExchangeRate();
  const thbRate = useThbRate();

  const idList = useMemo(() => (ids ? ids.split(',').filter(Boolean) : []), [ids]);

  const [reservations,      setReservations]      = useState<RentalDoc[] | null>(null);
  const [phoneVerifiedList, setPhoneVerifiedList]  = useState<boolean[]>([]);
  const [loading,           setLoading]            = useState(true);
  const [loadError,         setLoadError]          = useState(false);

  const [selectedCurrency, setSelectedCurrency] = useState<DepositCurrency | null>(null);
  const [confirmedByName,        setConfirmedByName]        = useState('');
  const [clientConfirmedByName,  setClientConfirmedByName]  = useState('');
  const [clientConfirmed,        setClientConfirmed]        = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const title = type === 'handover' ? 'Handover — deposit & confirmation' : 'Return — deposit & confirmation';

  useEffect(() => {
    if (idList.length === 0) { setLoadError(true); setLoading(false); return; }
    Promise.all(idList.map(id => getReservationById(id)))
      .then(async results => {
        if (results.some(r => r === null)) { setLoadError(true); return; }
        const resList = results as RentalDoc[];
        setReservations(resList);
        const profiles = await Promise.all(
          resList.map(r => getUserProfile(r.renterId).catch(() => null)),
        );
        setPhoneVerifiedList(profiles.map(p => p?.phoneVerified ?? false));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [idList]);

  // Every item's condition checklist must already be saved in memory (from the per-item
  // condition screens) before this screen can submit anything.
  const draftList = useMemo(() => idList.map(id => getChainItemDraft(id)), [idList]);
  const missingDraftIds = idList.filter((_, i) => !draftList[i]);

  // On return, the currency is locked to whatever was chosen at handover — the deposit
  // must be refunded in the same currency it was received in.
  const handoverCurrencies = reservations?.map(r => r.handoverChecklist?.depositCurrency ?? null) ?? [];
  const currencyMismatch = type === 'return' && handoverCurrencies.some(c => c !== handoverCurrencies[0]);
  const depositCurrency: DepositCurrency | null =
    type === 'return'
      ? (currencyMismatch ? null : handoverCurrencies[0] ?? null)
      : selectedCurrency;

  const totalDepositLak = reservations?.reduce((s, r) => s + r.deposit, 0) ?? 0;

  const calculatedTotalDepositAmount: number | null = !reservations ? null :
    depositCurrency === 'LAK' ? totalDepositLak :
    depositCurrency === 'USD' ? (exchangeRate != null ? lakToUsd(totalDepositLak, exchangeRate) : null) :
    depositCurrency === 'THB' ? (thbRate != null ? lakToThb(totalDepositLak, thbRate) : null) :
    null;

  // First-pick-up ID double check — once for the whole handover chain (same renter).
  const idCheck = useIdCheck(type === 'handover' ? reservations?.[0]?.renterId : null);

  // Rental agreement signed at pick-up — ONE for this handover session (every item of
  // the chain). BLOCKING like the ID check.
  const needsAgreement = type === 'handover';
  const [agreement, setAgreement] = useState<AgreementState>({ signed: false, label: null });
  const agreementSeeded = useRef(false);
  useEffect(() => {
    if (!reservations || agreementSeeded.current) return;
    agreementSeeded.current = true;
    setAgreement(initialAgreementState(reservations));
  }, [reservations]);
  // Handover: how the rental was paid (required) — on the agreement + every handoverChecklist.
  const [rentalPaymentMethod, setRentalPaymentMethod] = useState<RentalPaymentMethod | null>(null);
  // Deposit actually collected per item = the same proration as the submit below.
  const agreementHandover = useMemo<HandoverInfo>(() => {
    const shares = reservations && depositCurrency && calculatedTotalDepositAmount != null
      ? prorateDeposit(reservations, calculatedTotalDepositAmount, depositCurrency === 'LAK' ? 0 : 2)
      : null;
    return {
      items: Object.fromEntries((reservations ?? []).map((r, i) => {
        const draft = draftList[idList.indexOf(r.id)];
        return [r.id, {
          condition: conditionLines(draft?.categories),
          photoCount: draft?.photos.length ?? 0,
          depositReceived: shares && depositCurrency ? { amount: shares[i], currency: depositCurrency } : null,
        }];
      })),
      paymentMethod: rentalPaymentMethod,
    };
  }, [reservations, depositCurrency, calculatedTotalDepositAmount, draftList, idList, rentalPaymentMethod]);
  const agreementReady = needsAgreement && !!reservations && idCheck.ready && missingDraftIds.length === 0
    && depositCurrency !== null && !currencyMismatch && calculatedTotalDepositAmount !== null
    && rentalPaymentMethod !== null;

  const canSubmit =
    !!reservations &&
    (type !== 'handover' || idCheck.ready) &&
    (!needsAgreement || (agreement.signed && rentalPaymentMethod !== null)) &&
    missingDraftIds.length === 0 &&
    depositCurrency !== null &&
    !currencyMismatch &&
    calculatedTotalDepositAmount !== null &&
    confirmedByName.trim().length > 0 &&
    clientConfirmedByName.trim().length > 0 &&
    clientConfirmed &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!reservations || !canSubmit || depositCurrency === null || calculatedTotalDepositAmount === null) return;
    setSubmitting(true);
    setSubmitError(null);
    // Record the ID check first — if it fails, nothing else is written.
    if (type === 'handover') {
      try {
        await idCheck.perform();
      } catch (e) {
        setSubmitError((e as Error).message);
        setSubmitting(false);
        return;
      }
    }
    try {
      const decimals = depositCurrency === 'LAK' ? 0 : 2;
      const proratedAmounts = prorateDeposit(reservations, calculatedTotalDepositAmount, decimals);
      const confirmedAt = serverTimestamp();
      const isHandover = type === 'handover';

      const items = reservations.map((r, i) => {
        const draft = getChainItemDraft(r.id)!;
        // `serverTimestamp()` resolves to a real Timestamp once Firestore writes it —
        // the mismatch here is purely TypeScript's static view of the sentinel value.
        const checklistData = {
          categories: draft.categories,
          photos: draft.photos,
          depositCurrency,
          depositAmount: proratedAmounts[i],
          confirmedByName: confirmedByName.trim(),
          confirmedAt,
          clientConfirmedByName: clientConfirmedByName.trim(),
          clientConfirmed,
          ...(isHandover && rentalPaymentMethod ? { rentalPaymentMethod } : {}),
        } as ChecklistData;
        // Damage charge and late-return penalty (if either) were already decided and
        // shown on this item's own condition screen, before this consolidated screen
        // ever ran — just pass whichever apply through, independently, never merged.
        const hasDamage = draft.chargeAmount != null && draft.chargeSeverity != null
          && draft.chargePercent != null && draft.chargeReason != null;
        const hasLate = draft.lateChargeAmount != null && draft.lateChargeReason != null;
        const waived = !!draft.lateChargeWaived || !!draft.damageChargeWaived;
        const charge = (hasDamage || hasLate || waived) && draft.chargeCurrency != null
          && draft.depositAppliedToCharge != null && draft.outstandingBalance != null
          ? {
              ...(hasDamage ? {
                chargeAmount: draft.chargeAmount,
                chargeReason: draft.chargeReason,
                chargeSeverity: draft.chargeSeverity,
                chargePercent: draft.chargePercent,
                ...(draft.chargeUnits != null ? { chargeUnits: draft.chargeUnits } : {}),
              } : {}),
              ...(hasLate ? {
                lateChargeAmount: draft.lateChargeAmount,
                lateChargeReason: draft.lateChargeReason,
              } : {}),
              // Explicit waivers — forwarded as decided on the item screen.
              ...(draft.lateChargeWaived ? {
                lateChargeWaived: true,
                lateChargeWaivedAmount: draft.lateChargeWaivedAmount,
                lateChargeWaivedReason: draft.lateChargeWaivedReason,
                lateChargeWaivedBy: draft.lateChargeWaivedBy,
              } : {}),
              ...(draft.damageChargeWaived ? {
                damageChargeWaived: true,
                damageChargeWaivedAmount: draft.damageChargeWaivedAmount,
                damageChargeWaivedReason: draft.damageChargeWaivedReason,
                damageChargeWaivedPercent: draft.damageChargeWaivedPercent,
                damageChargeWaivedBy: draft.damageChargeWaivedBy,
                ...(draft.chargeSeverity ? { chargeSeverity: draft.chargeSeverity } : {}),
                ...(draft.chargeUnits != null ? { chargeUnits: draft.chargeUnits } : {}),
              } : {}),
              chargeCurrency: draft.chargeCurrency,
              depositAppliedToCharge: draft.depositAppliedToCharge,
              outstandingBalance: draft.outstandingBalance,
            }
          : undefined;
        return {
          id: r.id,
          type,
          checklistData,
          charge,
          productId: r.productId,
          quantity: r.quantity,
          adminName: confirmedByName.trim(),
          pickupAt: r.pickupAt,
        };
      });

      await submitChecklistBatch(items);

      reservations.forEach((r, i) => {
        if (isHandover) {
          sendNotif(r.renterId, {
            type: 'rental',
            icon: 'box',
            iconColor: 'carbon',
            title: 'Rental started',
            body: `You've picked up the ${r.productName}. Return by ${r.returnLabel}.`,
            deepLink: `/rentals/${r.id}`,
          });
          if (!phoneVerifiedList[i]) {
            updateDoc(doc(db, 'users', r.renterId), { phoneVerified: true }).catch(err =>
              console.warn('[ChecklistSummary] phoneVerified update failed:', err),
            );
          }
        } else {
          sendNotif(r.renterId, {
            type: 'rental',
            icon: 'check',
            iconColor: 'green',
            title: 'Rental completed',
            body: `Thanks for returning the ${r.productName}.`,
            deepLink: `/rentals/${r.id}`,
          });
          setTimeout(() => {
            sendNotif(r.renterId, {
              type: 'system',
              icon: 'star',
              iconColor: 'coral',
              title: 'How was your rental?',
              body: `Leave a review for ${r.productName} and help others.`,
              deepLink: `/review/${r.productId}?reservationId=${r.id}`,
            });
          }, 3000);
        }
      });

      clearChainDrafts(idList);
      setSubmitted(true);
    } catch (err) {
      console.error('[ChecklistSummary] submit error:', err);
      setSubmitError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    reservations, canSubmit, depositCurrency, calculatedTotalDepositAmount, type, idCheck,
    confirmedByName, clientConfirmedByName, clientConfirmed, phoneVerifiedList, idList, rentalPaymentMethod,
  ]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={COLORS.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !reservations) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.replace('/admin/reservations')} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={styles.stateTitle}>Couldn&apos;t load this checklist chain</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (missingDraftIds.length > 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.replace('/admin/reservations')} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={styles.stateTitle}>Some item data was lost</Text>
          <Text style={styles.stateSubtitle}>
            Please restart this checklist chain from the reservations list.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, { paddingHorizontal: 28, alignSelf: 'center' }]}
            onPress={() => router.replace('/admin/reservations')}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>Back to reservations</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Submitted — confirmation view ─────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Feather name="check-circle" size={48} color={COLORS.success} />
          <Text style={styles.stateTitle}>
            {type === 'handover'
              ? `${reservations.length} items validated — pickup confirmed`
              : `${reservations.length} items validated — return confirmed`}
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, { paddingHorizontal: 28, alignSelf: 'center' }]}
            onPress={() => router.replace('/admin/reservations')}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>Back to reservations</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => router.replace('/admin/reservations')} variant="bare" size={20} boxSize={44} />
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {type === 'handover' && (
          <IdCheckSection check={idCheck} />
        )}

        <Text style={styles.fieldLabel}>Items in this group</Text>
        <View style={styles.itemsList}>
          {reservations.map(r => (
            <Text key={r.id} style={styles.itemsListText}>· {r.productName}</Text>
          ))}
        </View>

        {/* Deposit */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
          {type === 'handover' ? 'Total deposit received' : 'Total deposit returned'}
        </Text>
        <MultiCurrencyAmount
          lakAmount={totalDepositLak}
          exchangeRate={exchangeRate}
          thbRate={thbRate}
        />
        {type === 'handover' ? (
          <View style={styles.optionRow}>
            {(['LAK', 'USD', 'THB'] as DepositCurrency[]).map(cur => {
              const selected = depositCurrency === cur;
              return (
                <TouchableOpacity
                  key={cur}
                  style={[styles.optChip, selected && styles.optChipActive]}
                  onPress={() => setSelectedCurrency(cur)}
                >
                  <Text style={[styles.optChipText, selected && styles.optChipTextActive]}>
                    {cur}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : currencyMismatch ? (
          <Text style={styles.depositWarningText}>
            Items in this group don&apos;t share the same deposit currency — process them individually.
          </Text>
        ) : depositCurrency ? (
          <Text style={styles.depositLockedText}>
            Currency: {depositCurrency} (same as received)
          </Text>
        ) : (
          <Text style={styles.depositWarningText}>
            No handover checklist found — can&apos;t determine the deposit currency.
          </Text>
        )}
        {depositCurrency && !currencyMismatch && (
          calculatedTotalDepositAmount != null ? (
            <Text style={styles.depositAmountText}>
              {calculatedTotalDepositAmount.toLocaleString('en-US')} {depositCurrency}
            </Text>
          ) : (
            <Text style={styles.depositWarningText}>
              Exchange rate not set for {depositCurrency} — set it in Admin → Exchange rate first.
            </Text>
          )
        )}

        {type === 'handover' && (
          <PaymentMethodChips value={rentalPaymentMethod} onChange={setRentalPaymentMethod} />
        )}

        {/* Confirmation name */}
        <Text style={styles.fieldLabel}>Confirmed by</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="Staff member name"
          placeholderTextColor={COLORS.fg3}
          value={confirmedByName}
          onChangeText={setConfirmedByName}
        />

        {/* Client confirmation */}
        <Text style={styles.fieldLabel}>Client confirmation</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="Client name"
          placeholderTextColor={COLORS.fg3}
          value={clientConfirmedByName}
          onChangeText={setClientConfirmedByName}
        />
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setClientConfirmed(v => !v)}
          activeOpacity={0.75}
        >
          <View style={[styles.checkbox, clientConfirmed && styles.checkboxChecked]}>
            {clientConfirmed && <Feather name="check" size={13} color={COLORS.porcelain} />}
          </View>
          <Text style={styles.checkboxLabel}>Client confirms the item condition as recorded above</Text>
        </TouchableOpacity>

        {needsAgreement && reservations && (
          <AgreementSection
            reservations={reservations}
            handover={agreementHandover}
            ready={agreementReady}
            beforeSign={idCheck.perform}
            staffName={confirmedByName.trim()}
            state={agreement}
            onState={setAgreement}
          />
        )}

        {submitError && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={COLORS.carbon} size="small" />
            : (
              <Text style={styles.submitBtnText}>
                {type === 'handover' ? 'Submit & mark all as picked up' : 'Submit & mark all as returned'}
              </Text>
            )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  itemsList: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    gap: 4,
  },
  itemsListText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
    marginBottom: 8,
    marginTop: 8,
  },

  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  optChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  optChipTextActive: {
    color: COLORS.porcelain,
  },
  depositAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 10,
    marginBottom: 8,
  },
  depositLockedText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  depositWarningText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
    marginTop: 10,
    marginBottom: 8,
  },

  nameInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.carbon,
    marginBottom: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  checkboxChecked: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.carbon,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '500',
  },

  submitBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    textAlign: 'center',
  },
});
