import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useGraceHours } from '@/lib/latePolicy';
import { computeLatePenalty, formatPenaltyDays } from '@/functions/src/shared/latePenalty';
import {
  getReservationById,
  getUserProfile,
  getProduct,
  addStockAdjustmentToBatch,
  CHECKLIST_CATEGORIES,
  type RentalDoc,
  type ChecklistCategoryId,
  type ChecklistRating,
  type ChecklistData,
  type StockConditionField,
} from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import { sendNotif } from '@/lib/notifications';
import { ChecklistSummary, RATING_STYLE, RATING_LABELS } from '@/components/ChecklistSummary';
import { MultiCurrencyAmount } from '@/components/MultiCurrencyAmount';
import { useExchangeRate, useThbRate } from '@/lib/exchangeRate';
import { lakToUsd, lakToThb, convertLakTo } from '@/utils/currency';
import { useLoyaltyConfig } from '@/lib/loyalty';
import { worstRating, chargePercentFor, convertUsdTo } from '@/utils/damageCharge';
import { setChainItemDraft } from '@/lib/checklistChainDraft';
import { SettlementSummary } from '@/components/SettlementSummary';
import { SettlementActions, type SettlementConfirmAction } from '@/components/SettlementActions';
import { ConfirmBox } from '@/components/ConfirmBox';
import { useIdCheck, IdCheckSection } from '@/components/admin/IdCheckSection';
import { auth } from '@/lib/auth';

type ChecklistType = 'handover' | 'return';
type DepositCurrency = 'LAK' | 'USD' | 'THB';

type CategoryState = Record<ChecklistCategoryId, { rating: ChecklistRating | null; note: string }>;

function initialCategoryState(): CategoryState {
  return CHECKLIST_CATEGORIES.reduce((acc, c) => {
    acc[c.id] = { rating: null, note: '' };
    return acc;
  }, {} as CategoryState);
}

const RATING_OPTIONS: { id: ChecklistRating; label: string }[] = [
  { id: 'good',     label: 'Good' },
  { id: 'fair',     label: 'Fair' },
  { id: 'damaged',  label: 'Damaged' },
  { id: 'unusable', label: 'Unusable' },
];

export default function ChecklistScreen() {
  const { id, type, mode, queue, chainIds } = useLocalSearchParams<{
    id: string; type: ChecklistType; mode?: 'view'; queue?: string; chainIds?: string;
  }>();

  // Presence of `queue` (even as an empty string) marks this submit as part of a bulk
  // chain started from admin/reservations.tsx's grouped "Mark all as..." action — its
  // absence preserves the normal single-item flow exactly. `chainIds` is the full,
  // never-shrinking id list for the whole chain (unlike `queue`, which only holds
  // upcoming ids) — needed once the last item is done, to load everything on the
  // consolidated summary screen.
  const inChain = queue !== undefined;
  const remainingQueue = queue ? queue.split(',').filter(Boolean) : [];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const exchangeRate = useExchangeRate();
  const thbRate = useThbRate();
  const graceHours = useGraceHours();

  const [reservation,    setReservation]    = useState<RentalDoc | null>(null);
  const [product,        setProduct]        = useState<Product | null>(null);
  const [phoneVerified,  setPhoneVerified]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState(false);
  const loyaltyConfig = useLoyaltyConfig();

  const [categories,       setCategories]       = useState<CategoryState>(initialCategoryState);
  const [openNotes,        setOpenNotes]        = useState<Partial<Record<ChecklistCategoryId, boolean>>>({});
  const [photos,           setPhotos]           = useState<{ uri: string }[]>([]);
  const [selectedDepositCurrency, setSelectedDepositCurrency] = useState<DepositCurrency | null>(null);
  const [confirmedByName,  setConfirmedByName]  = useState('');
  const [clientConfirmedByName, setClientConfirmedByName] = useState('');
  const [clientConfirmed,       setClientConfirmed]       = useState(false);
  const [chargeAmountInput,   setChargeAmountInput]   = useState('');
  const [chargeAmountTouched, setChargeAmountTouched]  = useState(false);
  const [lateChargeAmountInput,   setLateChargeAmountInput]   = useState('');
  const [lateChargeAmountTouched, setLateChargeAmountTouched]  = useState(false);
  // Explicit waivers ("Waive" + inline confirmation). Undo here until submit; after
  // submit, from the reservation detail until the settlement is finalised.
  const [lateWaived,   setLateWaived]   = useState(false);
  const [damageWaived, setDamageWaived] = useState(false);
  const [confirmWaive, setConfirmWaive] = useState<'late' | 'damage' | null>(null);
  const [submitting,       setSubmitting]       = useState(false);
  const [submitError,      setSubmitError]      = useState<string | null>(null);
  const [submitted,        setSubmitted]        = useState(false);

  // ── Inline settlement (post-checklist return-confirmation screen) ────────────
  const [settled,             setSettled]             = useState(false);
  const [settleConfirmAction, setSettleConfirmAction]  = useState<SettlementConfirmAction | null>(null);
  const [settleActioning,     setSettleActioning]      = useState(false);
  const [settleActionError,   setSettleActionError]    = useState<string | null>(null);

  const title = type === 'handover' ? 'Handover checklist' : 'Return checklist';

  useEffect(() => {
    if (!id) return;
    getReservationById(id)
      .then(r => {
        if (!r) { setLoadError(true); return null; }
        setReservation(r);
        getProduct(r.productId).then(setProduct).catch(() => setProduct(null));
        return getUserProfile(r.renterId);
      })
      .then(p => { if (p) setPhoneVerified(p.phoneVerified ?? false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const allRated = useMemo(
    () => CHECKLIST_CATEGORIES.every(c => categories[c.id].rating !== null),
    [categories],
  );

  // On return, the currency is locked to whatever was chosen at handover — the deposit
  // must be refunded in the same currency it was received in, so it's not re-selectable.
  const depositCurrency: DepositCurrency | null =
    type === 'return'
      ? (reservation?.handoverChecklist?.depositCurrency ?? null)
      : selectedDepositCurrency;

  const calculatedDepositAmount: number | null = !reservation ? null :
    depositCurrency === 'LAK' ? reservation.deposit :
    depositCurrency === 'USD' ? (exchangeRate != null ? lakToUsd(reservation.deposit, exchangeRate) : null) :
    depositCurrency === 'THB' ? (thbRate != null ? lakToThb(reservation.deposit, thbRate) : null) :
    null;

  // ── Damage/loss charge — return checklists only, driven by the single most severe
  // category rating. Handover never charges (nothing to compare condition against yet).
  const worst: ChecklistRating | null = (type === 'return' && allRated)
    ? worstRating(
        Object.fromEntries(
          CHECKLIST_CATEGORIES.map(c => [c.id, { rating: categories[c.id].rating! }]),
        ) as ChecklistData['categories'],
      )
    : null;
  const damagedChargePercent = loyaltyConfig?.damagedChargePercent ?? 60;
  const chargePercent = worst != null ? chargePercentFor(worst, damagedChargePercent) : null;
  const worstCategoryLabel = worst
    ? CHECKLIST_CATEGORIES.find(c => categories[c.id].rating === worst)?.label ?? 'Item condition'
    : null;
  const defaultChargeAmount: number | null =
    chargePercent != null && product?.retailPrice != null && depositCurrency != null
      ? convertUsdTo(product.retailPrice * chargePercent / 100, depositCurrency, exchangeRate, thbRate)
      : null;

  // Pre-fills the editable amount with the computed default; stops overwriting once
  // staff types their own override.
  useEffect(() => {
    if (!chargeAmountTouched && defaultChargeAmount != null) {
      setChargeAmountInput(String(defaultChargeAmount));
    }
  }, [defaultChargeAmount, chargeAmountTouched]);

  // Resets the override flag whenever the worst rating itself changes (not on every
  // render) — otherwise a staff override made while the item was "Damaged" would
  // silently survive a later flip to "Unusable" and keep showing the stale amount,
  // since the prefill effect above never overwrites a touched field.
  const prevWorstRef = useRef(worst);
  useEffect(() => {
    if (prevWorstRef.current !== worst) {
      prevWorstRef.current = worst;
      setChargeAmountTouched(false);
    }
  }, [worst]);

  // Whole units only, rounded up — matches the app's currency convention everywhere else
  // (no decimals for LAK/USD/THB). Math.ceil defensively covers pasted/decimal input even
  // though the field itself is a whole-number keypad.
  const parsedChargeAmount = parseFloat(chargeAmountInput);
  const chargeAmount = chargePercent != null && !damageWaived && !isNaN(parsedChargeAmount) && parsedChargeAmount > 0
    ? Math.ceil(parsedChargeAmount)
    : null;
  // true whenever a charge is due but not yet resolvable (missing replacementValue,
  // missing exchange rate, or no valid override entered) and not waived — blocks submit.
  const chargeUnresolved = chargePercent != null && !damageWaived && chargeAmount === null;

  // ── Late-return penalty — fully independent line item. The suggestion is computed
  // live here with the shared computeLatePenalty (same function as the Cloud Function),
  // so it's exact at the moment of return rather than up to 15 min stale. Staff confirm,
  // lower, or waive it (0) here, freezing it into its own separate field — never merged
  // with the damage charge above, never applied without this confirmation.
  const latePenalty = type === 'return' && reservation
    ? computeLatePenalty({
        returnAtMs:  reservation.returnAt.toMillis(),
        nowMs:       Date.now(),
        pricePerDay: reservation.pricePerDay,
        quantity:    reservation.quantity,
        graceHours,
      })
    : null;
  const hasLatePenalty = latePenalty != null && latePenalty.stage !== 'onTime';
  const withinGrace    = latePenalty?.stage === 'grace';
  const defaultLateChargeAmount: number | null =
    hasLatePenalty && depositCurrency != null
      ? (latePenalty!.amountLak > 0
          ? convertLakTo(latePenalty!.amountLak, depositCurrency, exchangeRate, thbRate)
          : 0)
      : null;

  useEffect(() => {
    if (!lateChargeAmountTouched && defaultLateChargeAmount != null) {
      setLateChargeAmountInput(String(defaultLateChargeAmount));
    }
  }, [defaultLateChargeAmount, lateChargeAmountTouched]);

  // Dropping a suggested penalty is an explicit "Waive" (stored as lateChargeWaived, so
  // the receipt can say "waived by our team") — typing 0 no longer waives silently.
  // 0 stays valid only within the grace period, where nothing is suggested.
  const parsedLateChargeAmount = lateChargeAmountInput.trim() === '' ? NaN : parseFloat(lateChargeAmountInput);
  const lateChargeValid = hasLatePenalty && (
    lateWaived ||
    (!isNaN(parsedLateChargeAmount) && (parsedLateChargeAmount > 0 || (withinGrace && parsedLateChargeAmount === 0)))
  );
  const lateChargeAmount = lateChargeValid && !lateWaived && parsedLateChargeAmount > 0
    ? Math.ceil(parsedLateChargeAmount)
    : null;
  const lateChargeUnresolved = hasLatePenalty && !lateChargeValid;

  // Reason text + combined totals — derived once here so both the Firestore write
  // (handleSubmit) and the post-submit confirmation screen read the exact same values,
  // rather than each recomputing them independently.
  const chargeReason = (chargeAmount != null && worst != null)
    ? `${worstCategoryLabel} — ${RATING_LABELS[worst]}`
    : null;
  const lateChargeReason = (lateChargeAmount != null && reservation)
    ? (() => {
        const hoursLate = Math.floor(latePenalty?.hoursLate ?? 0);
        return hoursLate > 0 ? `Returned ${hoursLate}h late` : 'Late return penalty';
      })()
    : null;
  const lateWaivedReason = hasLatePenalty && latePenalty
    ? (Math.floor(latePenalty.hoursLate) > 0 ? `Returned ${Math.floor(latePenalty.hoursLate)}h late` : 'Late return penalty')
    : null;
  const staffWaiverName = auth.currentUser?.displayName || auth.currentUser?.email || 'staff';
  const waiverFields = useMemo(() => ({
    ...(lateWaived && hasLatePenalty ? {
      lateChargeWaived: true,
      ...(defaultLateChargeAmount != null ? { lateChargeWaivedAmount: defaultLateChargeAmount } : {}),
      ...(lateWaivedReason ? { lateChargeWaivedReason: lateWaivedReason } : {}),
      lateChargeWaivedBy: staffWaiverName,
    } : {}),
    ...(damageWaived && chargePercent != null && worst != null ? {
      damageChargeWaived: true,
      ...(defaultChargeAmount != null ? { damageChargeWaivedAmount: defaultChargeAmount } : {}),
      damageChargeWaivedReason: `${worstCategoryLabel} — ${RATING_LABELS[worst]}`,
      damageChargeWaivedPercent: chargePercent,
      damageChargeWaivedBy: staffWaiverName,
      // Still recorded: drives the release/repair choice at settlement.
      chargeSeverity: worst as 'damaged' | 'unusable',
    } : {}),
  }), [
    lateWaived, hasLatePenalty, defaultLateChargeAmount, lateWaivedReason, staffWaiverName,
    damageWaived, chargePercent, worst, defaultChargeAmount, worstCategoryLabel,
  ]);
  const hasWaiver = Object.keys(waiverFields).length > 0;
  const totalCharge = (chargeAmount ?? 0) + (lateChargeAmount ?? 0);
  const depositAppliedToCharge = Math.min(totalCharge, calculatedDepositAmount ?? 0);
  const outstandingBalanceCalc = Math.max(0, totalCharge - (calculatedDepositAmount ?? 0));

  // First-pick-up ID double check — single handover only (a chain does it once, on the
  // consolidated summary screen). Blocking until both confirmations (+ counter photo).
  const idCheck = useIdCheck(type === 'handover' && !inChain ? reservation?.renterId : null);

  // In a chain, this screen only collects condition ratings + photos — deposit and
  // confirmation are entered once, on the consolidated summary screen after the last item.
  const canSubmit = inChain
    ? allRated && !submitting && !chargeUnresolved && !lateChargeUnresolved
    : allRated &&
      depositCurrency !== null &&
      calculatedDepositAmount !== null &&
      confirmedByName.trim().length > 0 &&
      clientConfirmedByName.trim().length > 0 &&
      clientConfirmed &&
      !chargeUnresolved &&
      !lateChargeUnresolved &&
      (type !== 'handover' || idCheck.ready) &&
      !submitting;

  const setRating = useCallback((catId: ChecklistCategoryId, rating: ChecklistRating) => {
    setCategories(prev => ({ ...prev, [catId]: { ...prev[catId], rating } }));
  }, []);

  const setNote = useCallback((catId: ChecklistCategoryId, note: string) => {
    setCategories(prev => ({ ...prev, [catId]: { ...prev[catId], note } }));
  }, []);

  const revealNote = useCallback((catId: ChecklistCategoryId) => {
    setOpenNotes(prev => ({ ...prev, [catId]: true }));
  }, []);

  // ── Photos ─────────────────────────────────────────────────────────────────
  const handleAddPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;
    setPhotos(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri }))]);
  }, []);

  const handleRemovePhoto = useCallback((uri: string) => {
    setPhotos(prev => prev.filter(p => p.uri !== uri));
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!reservation || !id || !type || !canSubmit) return;
    if (!inChain && (depositCurrency === null || calculatedDepositAmount === null)) return;
    setSubmitting(true);
    setSubmitError(null);
    // Record the ID check first — if it fails, nothing else is written.
    if (type === 'handover' && !inChain) {
      try {
        await idCheck.perform();
      } catch (e) {
        setSubmitError((e as Error).message);
        setSubmitting(false);
        return;
      }
    }
    try {
      const photoUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const compressed = await manipulateAsync(
          photos[i].uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.7, format: SaveFormat.JPEG },
        );
        const blob: Blob = await (await fetch(compressed.uri)).blob();
        const sRef = storageRef(storage, `reservations/${id}/${type}/${Date.now()}_${i}.jpg`);
        await uploadBytes(sRef, blob);
        photoUrls.push(await getDownloadURL(sRef));
      }

      const categoriesData = Object.fromEntries(
        CHECKLIST_CATEGORIES.map(c => [
          c.id,
          {
            rating: categories[c.id].rating,
            ...(categories[c.id].note.trim() ? { note: categories[c.id].note.trim() } : {}),
          },
        ]),
      ) as ChecklistData['categories'];

      // Damage charge and late-return penalty, frozen at submit time as fully separate
      // fields — they only combine into depositAppliedToCharge/outstandingBalance below,
      // never into one "penalty" concept upstream of that.
      const chargeFields = ((totalCharge > 0 || hasWaiver) && depositCurrency != null)
        ? {
            ...waiverFields,
            ...(chargeAmount != null && worst != null ? {
              chargeAmount,
              chargeReason: chargeReason!,
              chargeSeverity: worst as 'damaged' | 'unusable',
              chargePercent: chargePercent!,
            } : {}),
            ...(lateChargeAmount != null ? {
              lateChargeAmount,
              lateChargeReason: lateChargeReason!,
            } : {}),
            chargeCurrency: depositCurrency,
            depositAppliedToCharge,
            outstandingBalance: outstandingBalanceCalc,
          }
        : null;

      if (inChain) {
        // Deposit + confirmation are entered once on the consolidated summary screen —
        // this item's condition data is just cached in memory until then, no Firestore
        // write and no status transition yet.
        setChainItemDraft(id, { categories: categoriesData, photos: photoUrls, ...(chargeFields ?? {}) });
        setSubmitted(true);
        return;
      }

      const checklistData = {
        categories: categoriesData,
        photos: photoUrls,
        depositCurrency: depositCurrency!,
        depositAmount: calculatedDepositAmount!,
        confirmedByName: confirmedByName.trim(),
        confirmedAt: serverTimestamp(),
        clientConfirmedByName: clientConfirmedByName.trim(),
        clientConfirmed,
      };

      const isHandover = type === 'handover';
      if (isHandover) {
        await updateDoc(doc(db, 'reservations', id), {
          handoverChecklist: checklistData,
          status: 'active',
          updatedAt: serverTimestamp(),
        });
      } else {
        // Batched with the product's stock-condition adjustment so the two can never
        // partially succeed — the item is excluded from available stock the instant
        // it's marked returned, released only by releaseSettledStock once the deposit/
        // charges are closed out and the 12h handoff buffer has elapsed. A checklist
        // rated 'unusable' is a true write-off, so it goes straight to lostUnits
        // instead, mirroring "Report lost/stolen".
        const batch = writeBatch(db);
        batch.update(doc(db, 'reservations', id), {
          returnChecklist: checklistData,
          status: 'returned',
          returnedAt: serverTimestamp(),
          stockReleasedAt: null,
          ...(chargeFields ?? {}),
          updatedAt: serverTimestamp(),
        });
        const field: StockConditionField = chargeFields?.chargeSeverity === 'unusable' ? 'lostUnits' : 'pendingSettlementUnits';
        const reason = chargeFields?.chargeSeverity === 'unusable'
          ? 'Return checklist rated item unusable'
          : 'Returned — pending deposit settlement';
        addStockAdjustmentToBatch(batch, reservation.productId, field, reservation.quantity, reason, confirmedByName.trim(), id);
        await batch.commit();
        // Mirrors the runAction pattern used everywhere else in this app — without this,
        // local `reservation` state stays stale (still 'active', no charge fields) right
        // after submit, which would make the inline settlement UI below gate on the wrong
        // case. `returnChecklist`/`returnedAt` are deliberately left out of this merge —
        // nothing downstream reads them, and their FieldValue sentinels don't match
        // RentalDoc's real Timestamp type until Firestore actually resolves the write.
        setReservation(prev => prev ? { ...prev, status: 'returned', ...(chargeFields ?? {}) } : prev);
      }

      if (isHandover) {
        sendNotif(reservation.renterId, {
          type: 'rental',
          icon: 'box',
          iconColor: 'carbon',
          title: 'Rental started',
          body: `You've picked up the ${reservation.productName}. Return by ${reservation.returnLabel}.`,
          deepLink: `/rentals/${id}`,
        });
        if (!phoneVerified) {
          updateDoc(doc(db, 'users', reservation.renterId), { phoneVerified: true }).catch(err =>
            console.warn('[Checklist] phoneVerified update failed:', err),
          );
        }
      } else {
        sendNotif(reservation.renterId, {
          type: 'rental',
          icon: 'check',
          iconColor: 'green',
          title: 'Rental completed',
          body: `Thanks for returning the ${reservation.productName}.`,
          deepLink: `/rentals/${id}`,
        });
        setTimeout(() => {
          sendNotif(reservation.renterId, {
            type: 'system',
            icon: 'star',
            iconColor: 'coral',
            title: 'How was your rental?',
            body: `Leave a review for ${reservation.productName} and help others.`,
            deepLink: `/review/${reservation.productId}?reservationId=${id}`,
          });
        }, 3000);
      }

      setSubmitted(true);
    } catch (err) {
      console.error('[Checklist] submit error:', err);
      setSubmitError('Failed to submit checklist. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    reservation, id, type, canSubmit, inChain, categories, photos,
    depositCurrency, calculatedDepositAmount,
    chargeAmount, worst, chargePercent, chargeReason,
    lateChargeAmount, lateChargeReason, waiverFields, hasWaiver,
    totalCharge, depositAppliedToCharge, outstandingBalanceCalc,
    confirmedByName, clientConfirmedByName, clientConfirmed, phoneVerified, idCheck,
  ]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={COLORS.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !reservation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={styles.stateTitle}>Couldn&apos;t load this reservation</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── View mode — read-only summary of an already-submitted checklist ──────────

  if (mode === 'view') {
    const savedChecklist = type === 'handover' ? reservation.handoverChecklist : reservation.returnChecklist;
    if (!savedChecklist) {
      return (
        <SafeAreaView style={styles.container} edges={['top']}>
          <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color={COLORS.fg3} />
            <Text style={styles.stateTitle}>Couldn&apos;t load this checklist</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.productName}>{reservation.productName}</Text>
          <ChecklistSummary
            checklist={savedChecklist}
            title={title}
            showStaffName
          />
          {type === 'return' && (reservation.chargeAmount != null || reservation.lateChargeAmount != null) && reservation.chargeCurrency != null && (
            <View style={{ marginTop: 12 }}>
              <SettlementSummary
                chargeAmount={reservation.chargeAmount}
                chargeReason={reservation.chargeReason}
                lateChargeAmount={reservation.lateChargeAmount}
                lateChargeReason={reservation.lateChargeReason}
                depositAmount={savedChecklist.depositAmount ?? 0}
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
      </SafeAreaView>
    );
  }

  // ── Submitted — confirmation view, replaces the form after a successful submit ──
  // For a single-item return that resulted in a charge, the full settlement breakdown
  // is shown right here so staff can confirm/collect with the client immediately —
  // no extra navigation to the reservation detail screen. Chain items skip this: their
  // charge (if any) isn't actually written to Firestore yet at this point, it's just
  // cached in the in-memory draft until the consolidated summary screen submits.

  if (submitted) {
    const isReturn = !inChain && type === 'return';
    const showSettlement = isReturn;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: 24, paddingBottom: Math.max(insets.bottom, 24) },
            !showSettlement && { flexGrow: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[{ alignItems: 'center', gap: 12 }, showSettlement ? { marginBottom: 20 } : { paddingHorizontal: 32 }]}>
            <Feather name="check-circle" size={showSettlement ? 36 : 48} color={COLORS.success} />
            <Text style={styles.stateTitle}>
              {inChain
                ? 'Item condition saved'
                : type === 'handover' ? 'Checklist validated — pickup confirmed' : 'Return complete'}
            </Text>
            {isReturn && (
              <Text style={styles.stateSubtitle}>The item has been checked in and inspected.</Text>
            )}
          </View>

          {showSettlement && (
            <View style={{ marginBottom: 20 }}>
              <SettlementSummary
                chargeAmount={chargeAmount ?? undefined}
                chargeReason={chargeReason ?? undefined}
                lateChargeAmount={lateChargeAmount ?? undefined}
                lateChargeReason={lateChargeReason ?? undefined}
                depositAmount={calculatedDepositAmount ?? 0}
                depositCurrency={depositCurrency!}
                depositAppliedToCharge={depositAppliedToCharge}
                outstandingBalance={outstandingBalanceCalc}
              />
            </View>
          )}

          {showSettlement && !settled && reservation && (
            <View style={{ marginBottom: 20, gap: 8 }}>
              {settleActionError && (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={14} color={COLORS.danger} />
                  <Text style={styles.errorText}>{settleActionError}</Text>
                </View>
              )}
              {settleActioning ? (
                <ActivityIndicator color={COLORS.amber} />
              ) : (
                <SettlementActions
                  reservation={reservation}
                  confirmAction={settleConfirmAction}
                  setConfirmAction={setSettleConfirmAction}
                  actioning={settleActioning}
                  setActioning={setSettleActioning}
                  setActionError={setSettleActionError}
                  onSettled={u => {
                    setReservation(prev => prev ? { ...prev, ...u } : prev);
                    setSettled(true);
                  }}
                />
              )}
            </View>
          )}

          {settled && (
            <TouchableOpacity
              style={[styles.submitBtn, { paddingHorizontal: 28, alignSelf: 'center', marginBottom: 10 }]}
              onPress={() => router.push(`/rentals/${id}/receipt`)}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>View receipt</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { paddingHorizontal: 28, alignSelf: 'center' },
              showSettlement && styles.submitBtnSecondary,
            ]}
            onPress={() => {
              if (inChain && remainingQueue.length > 0) {
                const [nextId, ...restIds] = remainingQueue;
                router.replace(`/admin/reservations/${nextId}/checklist?type=${type}&queue=${restIds.join(',')}&chainIds=${chainIds ?? ''}`);
              } else if (inChain) {
                router.replace(`/admin/checklist-summary?ids=${chainIds ?? ''}&type=${type}`);
              } else {
                router.replace(`/admin/reservations/${id}`);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.submitBtnText, showSettlement && styles.submitBtnSecondaryText]}>
              {inChain && remainingQueue.length > 0
                ? `Continue to next item (${remainingQueue.length} left)`
                : inChain
                ? 'Continue to deposit & confirmation'
                : 'Back to reservation'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.productName}>{reservation.productName}</Text>

        {type === 'handover' && !inChain && (
          <IdCheckSection check={idCheck} renterName={reservation.renterName} />
        )}

        {CHECKLIST_CATEGORIES.map(cat => {
          const entry = categories[cat.id];
          const showNote = openNotes[cat.id] || entry.note.trim().length > 0;
          // Read-only reference to what was recorded at pickup — never affects
          // selection, submission, or charge computation, purely a comparison aid so
          // staff can tell pre-existing wear from new damage. Return checklists only;
          // gracefully absent when there's no handover checklist (older rental, or
          // pickup was skipped) or this category wasn't rated at pickup.
          const pickupEntry = type === 'return' ? reservation.handoverChecklist?.categories[cat.id] : undefined;
          return (
            <View key={cat.id} style={styles.accordion}>
              <View style={styles.accordionHeader}>
                <View style={styles.accordionHeaderLeft}>
                  <Text style={styles.accordionHeaderText}>{cat.label}</Text>
                  {entry.rating && (
                    <Feather name="check-circle" size={14} color={COLORS.success} />
                  )}
                </View>
              </View>
              {pickupEntry && (
                <Text style={styles.pickupReference}>
                  At pickup: {RATING_LABELS[pickupEntry.rating]}
                  {pickupEntry.note ? ` — ${pickupEntry.note}` : ''}
                </Text>
              )}
              <View style={styles.accordionBody}>
                <View style={styles.optionRow}>
                  {RATING_OPTIONS.map(opt => {
                    const selected = entry.rating === opt.id;
                    const ratingStyle = RATING_STYLE[opt.id];
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optChip,
                          selected && { backgroundColor: ratingStyle.bg, borderColor: ratingStyle.bg },
                        ]}
                        onPress={() => setRating(cat.id, opt.id)}
                      >
                        <Text style={[styles.optChipText, selected && { color: ratingStyle.text }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {showNote ? (
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Optional note…"
                    placeholderTextColor={COLORS.fg3}
                    value={entry.note}
                    onChangeText={t => setNote(cat.id, t)}
                    multiline
                  />
                ) : (
                  <TouchableOpacity onPress={() => revealNote(cat.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.addNoteLink}>+ Add note</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Photos */}
        <Text style={styles.fieldLabel}>Photos</Text>
        <View style={styles.photoRow}>
          {photos.map(p => (
            <View key={p.uri} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(p.uri)}>
                <Feather name="x" size={12} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhotos}>
            <Feather name="camera" size={20} color={COLORS.fg3} />
          </TouchableOpacity>
        </View>

        {/* Charge assessment — return checklists only. Damage/condition charge and
            late-return penalty are independent line items, shown separately whenever
            either applies; they're never merged into one field or one number here. */}
        {type === 'return' && allRated && (chargePercent != null || hasLatePenalty) && (
          <>
            <Text style={styles.fieldLabel}>Charge assessment</Text>

            {chargePercent != null && (
              product?.retailPrice == null ? (
                <Text style={styles.depositWarningText}>
                  Replacement value not set for this product — damage charge can&apos;t be calculated.
                  Set it on the product&apos;s admin page first.
                </Text>
              ) : depositCurrency == null ? (
                <Text style={styles.depositWarningText}>
                  Currency not resolved yet — no handover checklist found.
                </Text>
              ) : defaultChargeAmount == null ? (
                <Text style={styles.depositWarningText}>
                  Exchange rate not set for {depositCurrency} — set it in Admin → Exchange rate first.
                </Text>
              ) : (
                <>
                  <Text style={styles.chargeHintText}>
                    Damage/condition charge — {worstCategoryLabel} — {RATING_LABELS[worst!]} · {chargePercent}% of replacement value
                  </Text>
                  {damageWaived ? (
                    <WaivedRow
                      text={`Waived — suggested ${defaultChargeAmount.toLocaleString('en-US')} ${depositCurrency}. The renter sees "waived by our team".`}
                      onUndo={() => setDamageWaived(false)}
                    />
                  ) : (
                    <View style={styles.numRow}>
                      <TextInput
                        style={[styles.nameInput, { flex: 1, marginBottom: 0 }]}
                        keyboardType="number-pad"
                        value={chargeAmountInput}
                        onChangeText={t => { setChargeAmountInput(t); setChargeAmountTouched(true); }}
                        placeholder="0"
                        placeholderTextColor={COLORS.fg3}
                      />
                      <Text style={styles.currencyUnit}>{depositCurrency}</Text>
                      <WaiveButton onPress={() => setConfirmWaive('damage')} />
                    </View>
                  )}
                  {confirmWaive === 'damage' && (
                    <ConfirmBox
                      text={`Waive the damage charge (suggested ${defaultChargeAmount.toLocaleString('en-US')} ${depositCurrency})? The renter will see "Damage charge · waived by our team".`}
                      confirmLabel="Waive"
                      cancelLabel="Keep"
                      onCancel={() => setConfirmWaive(null)}
                      onConfirm={() => { setDamageWaived(true); setConfirmWaive(null); }}
                    />
                  )}
                </>
              )
            )}

            {hasLatePenalty && (
              depositCurrency == null ? (
                <Text style={styles.depositWarningText}>
                  Currency not resolved yet — no handover checklist found.
                </Text>
              ) : defaultLateChargeAmount == null ? (
                <Text style={styles.depositWarningText}>
                  Exchange rate not set for {depositCurrency} — set it in Admin → Exchange rate first.
                </Text>
              ) : (
                <>
                  <Text style={styles.chargeHintText}>
                    {withinGrace
                      ? `Late return — ${Math.floor(latePenalty!.hoursLate * 60)} min late, within grace period · no penalty suggested`
                      : `Late return penalty — ${Math.floor(latePenalty!.hoursLate)}h late · ${formatPenaltyDays(latePenalty!.days)} × ${reservation!.pricePerDay.toLocaleString('en-US')} LAK × ${reservation!.quantity} = ${latePenalty!.amountLak.toLocaleString('en-US')} LAK suggested. Lower it, or waive it.`}
                  </Text>
                  {lateWaived ? (
                    <WaivedRow
                      text={`Waived — suggested ${defaultLateChargeAmount.toLocaleString('en-US')} ${depositCurrency}. The renter sees "waived by our team".`}
                      onUndo={() => setLateWaived(false)}
                    />
                  ) : (
                    <View style={styles.numRow}>
                      <TextInput
                        style={[styles.nameInput, { flex: 1, marginBottom: 0 }]}
                        keyboardType="number-pad"
                        value={lateChargeAmountInput}
                        onChangeText={t => { setLateChargeAmountInput(t); setLateChargeAmountTouched(true); }}
                        placeholder="0"
                        placeholderTextColor={COLORS.fg3}
                      />
                      <Text style={styles.currencyUnit}>{depositCurrency}</Text>
                      {!withinGrace && <WaiveButton onPress={() => setConfirmWaive('late')} />}
                    </View>
                  )}
                  {!withinGrace && !lateWaived && !isNaN(parsedLateChargeAmount) && parsedLateChargeAmount === 0 && (
                    <Text style={styles.depositWarningText}>Use “Waive” to drop the late fee.</Text>
                  )}
                  {confirmWaive === 'late' && (
                    <ConfirmBox
                      text={`Waive the late fee (suggested ${defaultLateChargeAmount.toLocaleString('en-US')} ${depositCurrency})? The renter will see "Late return fee · waived by our team".`}
                      confirmLabel="Waive"
                      cancelLabel="Keep"
                      onCancel={() => setConfirmWaive(null)}
                      onConfirm={() => { setLateWaived(true); setConfirmWaive(null); }}
                    />
                  )}
                </>
              )
            )}
          </>
        )}

        {/* Deposit + confirmation — collected once on the consolidated summary screen
            at the end of a chain, so these sections don't repeat per item there. */}
        {!inChain && (
          <>
            <Text style={styles.fieldLabel}>
              {type === 'handover' ? 'Deposit received' : 'Deposit returned'}
            </Text>
            <MultiCurrencyAmount
              lakAmount={reservation.deposit}
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
                      onPress={() => setSelectedDepositCurrency(cur)}
                    >
                      <Text style={[styles.optChipText, selected && styles.optChipTextActive]}>
                        {cur}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : depositCurrency ? (
              <Text style={styles.depositLockedText}>
                Currency: {depositCurrency} (same as received)
              </Text>
            ) : (
              <Text style={styles.depositWarningText}>
                No handover checklist found — can&apos;t determine the deposit currency.
              </Text>
            )}
            {depositCurrency && (
              calculatedDepositAmount != null ? (
                <Text style={styles.depositAmountText}>
                  {calculatedDepositAmount.toLocaleString('en-US')} {depositCurrency}
                </Text>
              ) : (
                <Text style={styles.depositWarningText}>
                  Exchange rate not set for {depositCurrency} — set it in Admin → Exchange rate first.
                </Text>
              )
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
          </>
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
                {inChain
                  ? 'Save condition & continue'
                  : type === 'handover' ? 'Submit & mark as picked up' : 'Submit & mark as returned'}
              </Text>
            )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// "Waive" (outline) next to a suggested charge, and the waived state with an undo link.
function WaiveButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.waiveBtn} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.waiveBtnText}>Waive</Text>
    </TouchableOpacity>
  );
}

function WaivedRow({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View style={styles.waivedRow}>
      <Feather name="slash" size={14} color={COLORS.fg2} />
      <Text style={styles.waivedText}>{text}</Text>
      <TouchableOpacity onPress={onUndo} hitSlop={8}>
        <Text style={styles.waivedUndo}>Undo</Text>
      </TouchableOpacity>
    </View>
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
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 16,
  },

  // ── Accordion ──────────────────────────────────────────────────────────────
  accordion: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
    marginBottom: 10,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  pickupReference: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    paddingHorizontal: 14,
    paddingBottom: 10,
    marginTop: -4,
  },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },

  // ── Rating pills (same shape as FilterSheet's optChip) ───────────────────────
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
  waiveBtn: {
    height: 40, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.carbon,
    alignItems: 'center', justifyContent: 'center',
  },
  waiveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
  waivedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.softGray200, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  waivedText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.fg2, lineHeight: 17 },
  waivedUndo: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
  chargeHintText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 8,
  },
  numRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  currencyUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  noteInput: {
    backgroundColor: COLORS.porcelain,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.carbon,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  addNoteLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
  },

  // ── Photos ─────────────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
    marginBottom: 8,
    marginTop: 8,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  photoThumbWrap: {
    width: 72,
    height: 72,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: COLORS.softGray200,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Confirmation ───────────────────────────────────────────────────────────
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
  // Secondary/muted variant — used for "Back to reservation" once the inline
  // settlement actions (or the post-settlement "View receipt" button) are the
  // primary call to action on screen, so it doesn't visually compete with them.
  submitBtnSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  submitBtnSecondaryText: {
    color: COLORS.fg2,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg3,
    lineHeight: 20,
    textAlign: 'center',
  },
});
