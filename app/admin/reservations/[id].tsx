import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, writeBatch, onSnapshot, query, where, type WriteBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { isPickupMissed, isBeforePickupDay, vteDay } from '@/functions/src/shared/dates';
import { ID_DOC_TYPES } from '@/functions/src/shared/identity';
import { productThumb } from '@/utils/productImage';
import { displayOrderId } from '@/utils/rentalDocs';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { useScreenInsets } from '@/components/account/ui';
import { RenterNameBlock } from '@/components/admin/RenterNameBlock';
import type { BookingHold } from '@/lib/bookingHold';
import {
  getUserProfile,
  getProduct,
  addStockAdjustmentToBatch,
  adminCancelReservations,
  adminMarkNoShow,
  adminLiftNoShowHold,
  getReservationsByOrderId,
  getReservationById,
  earlyHandoverPrompt,
  type RentalDoc,
  type ReservationStatus,
  type UserProfile,
} from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useGraceHours } from '@/lib/latePolicy';
import { computeLatePenalty, formatPenaltyDays } from '@/functions/src/shared/latePenalty';
import { overdueSeverity, overdueLabel, overdueChipColors } from '@/utils/overdue';
import { STATUS_CONFIG } from '../reservations';
import { useExchangeRate, useThbRate, useVatPercent } from '@/lib/exchangeRate';
import { convertUsdTo } from '@/utils/damageCharge';
import { convertLakTo } from '@/utils/currency';
import { SettlementSummary } from '@/components/SettlementSummary';
import { RentalReceipt } from '@/components/RentalReceipt';
import { SettlementActions } from '@/components/SettlementActions';
import { ConfirmBox } from '@/components/ConfirmBox';
import PackCancelNote from '@/components/packs/PackCancelNote';
import UnitsStepper from '@/components/UnitsStepper';
import { AgreementAdminCard } from '@/components/admin/AgreementAdminCard';
import { discountOf } from '@/functions/src/shared/promo';
import {
  CANCEL_REASONS,
  CANCEL_REASON_KEYS,
  ADMIN_CANCELLABLE_STATUSES,
  type CancelReason,
} from '@/functions/src/shared/cancellation';
import { FirstRentalIdChip, showsFirstRentalIdCheck } from '@/components/FirstRentalIdChip';
import { RenterIdCard } from '@/components/admin/RenterIdCard';
import { addAudit } from '@/lib/adminAudit';
import { canDo, phaseOf, PHASE_LABELS, type MachineAction } from '@/functions/src/shared/reservationMachine';
import { HistoryCard } from '@/components/admin/HistoryCard';
import { DamageReviewCard, PickupRefusedCard, RefusePickupBox } from '@/components/admin/OwnerReview';
import { useAuth } from '@/contexts/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtLak(n: number): string {
  return `${n.toLocaleString('en-US')} LAK`;
}

function fmtTimestamp(ts: any): string {
  if (!ts) return '—';
  try {
    const d: Date =
      typeof ts.toDate === 'function' ? ts.toDate() : new Date((ts as number) * 1000);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

// ── sendNotif ─────────────────────────────────────────────────────────────────
// Fire-and-forget: writes one notification doc for the renter.
// Wrapped in try/catch so a Firestore error never blocks the admin action.

async function sendNotif(
  renterId: string,
  payload: {
    type: string;
    title: string;
    body: string;
    icon: string;
    iconColor: string;
    deepLink: string;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'notifications', renterId, 'items'), {
      ...payload,
      createdAt: serverTimestamp(),
      readAt: null,
    });
  } catch (err) {
    console.warn('[sendNotif] Failed to write notification:', err);
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminReservationDetailScreen() {
  const insets = useSafeAreaInsets();
  const screen = useScreenInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Admin roles: staff never see fee waivers, settlement, lost/stolen or the no-show hold
  // lift (the server refuses those writes anyway — firestore.rules).
  const { isShopOwner, adminRole } = useAuth();
  const role = adminRole ?? 'staff';

  // ── Data state ────────────────────────────────────────────────────────────
  const [reservation,   setReservation]   = useState<RentalDoc | null>(null);
  const [renterProfile, setRenterProfile] = useState<UserProfile | null>(null);
  const [product,       setProduct]       = useState<Product | null>(null);
  const [loading,       setLoading]       = useState(true);
  const exchangeRate = useExchangeRate();
  const thbRate       = useThbRate();
  const graceHours    = useGraceHours();
  const vatPercent    = useVatPercent();

  // ── Action state ──────────────────────────────────────────────────────────
  const [actioning,     setActioning]     = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);
  // One confirm dialog at a time; null = buttons visible
  // Undo of a waiver made on the return checklist — allowed until returnFinalizedAt.
  const [confirmUnwaive, setConfirmUnwaive] = useState<'late' | 'damage' | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<
    'deposit' | 'cancel' | 'settle_outstanding' | 'write_off_outstanding' | 'lost'
    | 'no_show' | 'lift_hold' | 'refuse_pickup' | 'archive' | null
  >(null);
  // Admin cancellation — reason + scope (this line or the whole order)
  const [cancelReason,     setCancelReason]     = useState<CancelReason | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelScope,      setCancelScope]      = useState<'item' | 'order'>('item');
  const [orderSiblings,    setOrderSiblings]    = useState<RentalDoc[]>([]);
  // No-show (admin-marked) + the renter's booking hold (bookingHolds/{renterId})
  const [noShowScope,      setNoShowScope]      = useState<'item' | 'order'>('item');
  const [renterHold,       setRenterHold]       = useState<BookingHold | null>(null);
  const [lostStaffName,          setLostStaffName]          = useState('');
  const [lostNotes,              setLostNotes]              = useState('');
  const [lostChargeAmountInput,  setLostChargeAmountInput]  = useState('');
  const [lostChargeTouched,      setLostChargeTouched]      = useState(false);
  // How many of the reservation's units are lost (staff choice, default all) — the
  // charge and lostUnits cover those units only (chargeUnits).
  const [lostUnitsCount,         setLostUnitsCount]         = useState<number | null>(null);

  // ── Phone edit state ──────────────────────────────────────────────────────
  const [editingPhone,   setEditingPhone]   = useState(false);
  const [phoneInput,     setPhoneInput]     = useState('');
  const [savingPhone,    setSavingPhone]    = useState(false);
  const [phoneError,     setPhoneError]     = useState<string | null>(null);
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  // ── Load reservation ──────────────────────────────────────────────────────
  // LIVE: the reservation is the state-machine document — any copy of this screen (even
  // one left behind in the navigation stack) follows its real phase at once, so a stale
  // screen can never offer an action the current status doesn't allow (the rules refuse
  // it anyway).
  const loadedRefs = useRef<string | null>(null);
  const livePhase = reservation ? phaseOf(reservation) : null;
  useEffect(() => { setConfirmAction(null); }, [livePhase]);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'reservations', id), snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const r = { id: snap.id, ...snap.data() } as RentalDoc;
      setReservation(r);
      if (loadedRefs.current === r.id) return;
      loadedRefs.current = r.id;
      getProduct(r.productId).then(setProduct).catch(() => setProduct(null));
      getUserProfile(r.renterId)
        .then(p => { if (p) setRenterProfile(p); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, () => setLoading(false));
  }, [id]);

  // ── Layout state (2026-11-27 redesign — layout only) ─────────────────────────
  // One bottom sheet at a time (iOS shows ONE Modal): the "⋯" menu, a confirmation,
  // the settlement / damage review, the renter details or the agreement.
  const [sheet, setSheet] = useState<null | 'menu' | 'confirm' | 'settle' | 'damage' | 'renter' | 'agreement'>(null);
  // Collapsible sections — remembered while the screen is mounted.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((k: string) => setOpenSections(prev => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  }), []);
  const [barHeight, setBarHeight] = useState(0);
  const [historyLatest, setHistoryLatest] = useState<string | null>(null);
  const [identity, setIdentity] = useState<{ status?: string; docType?: string } | null>(null);
  // The order's other items, LIVE (their phase stays up to date).
  const [orderLines, setOrderLines] = useState<RentalDoc[]>([]);
  const orderIdLive = reservation?.orderId ?? null;
  useEffect(() => {
    if (!orderIdLive) { setOrderLines([]); return; }
    return onSnapshot(query(collection(db, 'reservations'), where('orderId', '==', orderIdLive)),
      snap => setOrderLines(snap.docs.map(x => ({ id: x.id, ...x.data() } as RentalDoc))), () => setOrderLines([]));
  }, [orderIdLive]);
  const renterIdLive = reservation?.renterId ?? null;
  useEffect(() => {
    if (!renterIdLive) return;
    getDoc(doc(db, 'identityChecks', renterIdLive))
      .then(x => setIdentity(x.exists() ? (x.data() as { status?: string; docType?: string }) : {}))
      .catch(() => setIdentity(null));
  }, [renterIdLive]);
  // A confirmation that finished (or the phase that moved) closes its sheet.
  useEffect(() => { if (sheet === 'confirm' && confirmAction === null && !actioning) setSheet(null); }, [sheet, confirmAction, actioning]);
  useEffect(() => { setSheet(null); }, [livePhase]);

  // ── Action executor ───────────────────────────────────────────────────────
  const runAction = useCallback(async (
    // State machine action (functions/src/shared/reservationMachine.ts) — written as
    // `lastAction`; firestore.rules allow it only from the CURRENT phase of the doc.
    action: MachineAction,
    firestoreUpdates: Record<string, unknown>,
    localUpdates: Partial<Omit<RentalDoc, 'id'>>,
    onSuccess?: () => void,
    // Optional — lets a caller fold ADDITIONAL writes into the SAME atomic batch as the
    // reservation update, instead of a separate non-atomic write after this one
    // resolves. Used by the "Report lost/stolen" action to also increment the product's
    // lostUnits count + write its audit log, so the two can never partially succeed.
    extraBatchWork?: (batch: WriteBatch, auditId: string) => void,
  ) => {
    if (!id || actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      // Every admin write carries its auditLog entry in the SAME batch (lastAuditId —
      // firestore.rules refuses it otherwise): who, role, when, what → History card.
      const batch = writeBatch(db);
      const auditId = await addAudit(batch, action,
        { reservationId: id, orderId: reservation?.orderId ?? null, productId: reservation?.productId, renterId: reservation?.renterId },
        Object.keys(firestoreUpdates).filter(k => k !== 'status').slice(0, 6).join(', '));
      batch.update(doc(db, 'reservations', id), { ...firestoreUpdates, lastAuditId: auditId, lastAction: action, updatedAt: serverTimestamp() });
      extraBatchWork?.(batch, auditId);
      await batch.commit();
      setReservation(prev => prev ? { ...prev, ...localUpdates } : prev);
      onSuccess?.();
    } catch (err: any) {
      console.error('[AdminReservationDetail] action error:', err?.code, err?.message);
      setActionError('Failed to update. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [id, actioning, reservation]);

  // ── Lost/stolen charge — always 100% of replacement value. Currency comes from the
  // reservation's already-locked deposit currency; 'LAK' is a defensive fallback only —
  // status === 'active' structurally guarantees a completed handover checklist already
  // exists, so this branch is effectively unreachable in practice. Declared here (not in
  // the "Derived" section below, which sits after early-return guards) since it drives a
  // hook and hooks can't be called conditionally. ─────────────────────────────────
  const lostChargeCurrency: 'LAK' | 'USD' | 'THB' = reservation?.handoverChecklist?.depositCurrency ?? 'LAK';
  const lostQty = Math.max(1, reservation?.quantity ?? 1);
  const lostUnits = Math.min(Math.max(1, lostUnitsCount ?? lostQty), lostQty);
  const lostDefaultChargeAmount: number | null = product?.retailPrice != null
    ? convertUsdTo(product.retailPrice * lostUnits, lostChargeCurrency, exchangeRate, thbRate)
    : null;
  useEffect(() => {
    if (!lostChargeTouched && lostDefaultChargeAmount != null) {
      setLostChargeAmountInput(String(lostDefaultChargeAmount));
    }
  }, [lostDefaultChargeAmount, lostChargeTouched]);
  // A new unit count re-suggests the amount (an override was for the old count).
  useEffect(() => { setLostChargeTouched(false); }, [lostUnits]);
  // Whole units only, rounded up — matches the app's currency convention everywhere else.
  const parsedLostCharge = parseFloat(lostChargeAmountInput);
  const lostChargeAmount = !isNaN(parsedLostCharge) && parsedLostCharge > 0 ? Math.ceil(parsedLostCharge) : null;

  // Late-return penalty suggestion, computed live with the shared computeLatePenalty
  // (same function as the Cloud Function). Only meaningful while the item is still out.
  const latePenalty = reservation && reservation.status === 'active'
    ? computeLatePenalty({
        returnAtMs:  reservation.returnAt.toMillis(),
        nowMs:       Date.now(),
        pricePerDay: reservation.pricePerDay,
        quantity:    reservation.quantity,
        graceHours,
      })
    : null;

  // Read-only here (no override — unlike the checklist flow, this one stays simple) —
  // an item can be both overdue and then reported lost, so it needs to fold into the
  // combined outstanding balance even though it's never editable in this flow.
  const lostLateChargeAmount: number | null = (latePenalty?.amountLak ?? 0) > 0
    ? convertLakTo(latePenalty!.amountLak, lostChargeCurrency, exchangeRate, thbRate)
    : null;

  // ── Admin cancellation ────────────────────────────────────────────────────
  const openCancel = useCallback(() => {
    setCancelReason(null);
    setCancelReasonText('');
    setCancelScope('item');
    setOrderSiblings([]);
    setConfirmAction('cancel');
    if (reservation?.orderId) {
      getReservationsByOrderId(reservation.orderId).then(setOrderSiblings).catch(() => setOrderSiblings([]));
    }
  }, [reservation?.orderId]);

  // One batch for every line (same cancelledAt) → the email trigger sends ONE email.
  const handleAdminCancel = useCallback(async (ids: string[]) => {
    if (!reservation || !cancelReason || actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      await adminCancelReservations(ids, cancelReason, cancelReasonText);
      setReservation(prev => prev ? { ...prev, status: 'cancelled', cancelledBy: 'admin', cancelReason, cancelReasonText } : prev);
      const names = ids.length > 1 ? `your order ${reservation.orderId}` : reservation.productName;
      await sendNotif(reservation.renterId, {
        type: 'rental',
        icon: 'alert',
        iconColor: 'coral',
        title: 'Reservation cancelled',
        body: `Your booking for ${names} was cancelled. Nothing to pay — check your email for details.`,
        deepLink: ids.length > 1 ? '/reservations' : `/rentals/${reservation.id}`,
      });
    } catch (err: any) {
      console.error('[AdminReservationDetail] cancel error:', err?.code, err?.message);
      setActionError('Failed to cancel. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [reservation, cancelReason, cancelReasonText, actioning]);

  // ── No-show ───────────────────────────────────────────────────────────────
  const adminIdentity = () => {
    const u = auth.currentUser;
    return { uid: u?.uid ?? 'unknown', name: u?.displayName || u?.email || 'Admin' };
  };

  // The renter's booking hold — admins can read bookingHolds/* (firestore.rules).
  const loadRenterHold = useCallback(() => {
    if (!reservation?.renterId) return;
    getDoc(doc(db, 'bookingHolds', reservation.renterId))
      .then(snap => setRenterHold(snap.exists() ? (snap.data() as BookingHold) : null))
      .catch(() => setRenterHold(null));
  }, [reservation?.renterId]);
  useEffect(() => { loadRenterHold(); }, [loadRenterHold, reservation?.status]);

  const openNoShow = useCallback(() => {
    setNoShowScope('item');
    setOrderSiblings([]);
    setConfirmAction('no_show');
    if (reservation?.orderId) {
      getReservationsByOrderId(reservation.orderId).then(setOrderSiblings).catch(() => setOrderSiblings([]));
    }
  }, [reservation?.orderId]);

  // One batch (same noShowAt) → one "We missed you" email. Final — mistakes are handled
  // by lifting the hold, not by reverting the status.
  const handleMarkNoShow = useCallback(async (ids: string[]) => {
    if (!reservation || actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      const me = adminIdentity();
      await adminMarkNoShow(ids, me.uid, me.name);
      setReservation(prev => prev ? { ...prev, status: 'no_show', noShowByName: me.name } : prev);
      await sendNotif(reservation.renterId, {
        type: 'rental',
        icon: 'calendar',
        iconColor: 'amber',
        title: 'We missed you',
        body: 'Your pick-up didn’t happen. Your booking was released. Message us to book again.',
        deepLink: ids.length > 1 ? '/reservations' : `/rentals/${reservation.id}`,
      });
    } catch (err: any) {
      console.error('[AdminReservationDetail] no-show error:', err?.code, err?.message);
      setActionError('Failed to mark as no-show. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [reservation, actioning]);

  const handleLiftHold = useCallback(async () => {
    if (!reservation || actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      const me = adminIdentity();
      await adminLiftNoShowHold(reservation.renterId, me.uid, me.name);
      setReservation(prev => prev ? { ...prev, noShowHoldLiftedByName: me.name } : prev);
      // syncBookingHold recomputes the hold server-side; refresh after a short delay.
      setTimeout(loadRenterHold, 2500);
    } catch (err: any) {
      console.error('[AdminReservationDetail] lift hold error:', err?.code, err?.message);
      setActionError('Failed to lift the hold. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [reservation, actioning, loadRenterHold]);

  // ── Phone handlers ────────────────────────────────────────────────────────
  const handleEditPhone = useCallback(() => {
    const current = renterProfile?.phoneNumber ?? renterProfile?.phone ?? '';
    setPhoneInput(current);
    setPhoneError(null);
    setEditingPhone(true);
  }, [renterProfile]);

  const handleSavePhone = useCallback(async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneError('Phone number cannot be empty.');
      return;
    }
    // Basic E.164 validation: +<country code><number>, 8–15 digits total
    if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
      setPhoneError('Enter a valid number in E.164 format, e.g. +8562012345678');
      return;
    }
    if (!reservation) return;
    setSavingPhone(true);
    setPhoneError(null);
    try {
      await updateDoc(doc(db, 'users', reservation.renterId), {
        phoneNumber: trimmed,
        phone: trimmed,
        phoneVerified: false,
      });
      setRenterProfile(p => p ? { ...p, phoneNumber: trimmed, phone: trimmed, phoneVerified: false } : p);
      setEditingPhone(false);
    } catch {
      setPhoneError('Failed to save. Please try again.');
    } finally {
      setSavingPhone(false);
    }
  }, [phoneInput, reservation]);

  const handleVerifyPhone = useCallback(async () => {
    if (!reservation) return;
    setVerifyingPhone(true);
    try {
      await updateDoc(doc(db, 'users', reservation.renterId), { phoneVerified: true });
      setRenterProfile(p => p ? { ...p, phoneVerified: true } : p);
    } catch {
      // Non-critical — show nothing, admin can retry
    } finally {
      setVerifyingPhone(false);
    }
  }, [reservation]);

  // ── Shared header ─────────────────────────────────────────────────────────
  const header = (
    <View style={d.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={d.headerTitle}>Reservation</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (loading) {
    return (
      <View style={[d.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        {header}
        <View style={d.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={[d.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        {header}
        <View style={d.centered}>
          <Text style={d.notFound}>Reservation not found.</Text>
        </View>
      </View>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const status          = reservation.status as ReservationStatus;
  // State machine: every action button below comes from the ONE table
  // (functions/src/shared/reservationMachine.ts) — the rules enforce the same.
  const can = (a: MachineAction) => canDo(reservation, a, role);
  const phase = phaseOf(reservation);
  const badge           = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  const isReturnOverdue = status === 'active' && reservation.returnAt.toMillis() < Date.now();

  // Once a handover checklist has been submitted, the deposit was actually received in
  // whatever currency the admin chose there — show that instead of the original LAK
  // figure. Before handover, no currency choice has been made yet, so show LAK as usual.
  const handoverDeposit = reservation.handoverChecklist;
  const depositDisplay = (handoverDeposit?.depositCurrency && handoverDeposit?.depositAmount != null)
    ? `${handoverDeposit.depositAmount.toLocaleString('en-US')} ${handoverDeposit.depositCurrency}`
    : fmtLak(reservation.deposit)
      // Per-unit deposit (frozen by createReservations): show how the total is made up.
      + (reservation.quantity > 1 && reservation.depositPerUnit ? ` (${reservation.quantity} × ${fmtLak(reservation.depositPerUnit)})` : '');

  // ── Damage/late charges — set by the return checklist or "Report lost/stolen".
  // Damage charge and late-return penalty stay separate fields throughout; only the
  // net-deposit/outstanding math below sums them. ─────────────────────────────────
  const hasCharge = (reservation.chargeAmount != null || reservation.lateChargeAmount != null)
    && reservation.chargeCurrency != null;
  const outstandingBalance = reservation.outstandingBalance ?? 0;
  const depositHeldAmount = handoverDeposit?.depositAmount ?? reservation.deposit;

  const identityPhone  = renterProfile?.phoneNumber ?? renterProfile?.phone ?? null;
  const renterPhotoURL = renterProfile?.photoURL ?? null;
  const phoneVerified = renterProfile?.phoneVerified ?? false;
  const phone    = renterProfile?.phone ?? null;
  const whatsapp = renterProfile?.whatsappSameAsPhone
    ? renterProfile?.phone
    : renterProfile?.whatsapp ?? null;

  const renterDisplayName =
    renterProfile
      ? [renterProfile.firstName, renterProfile.lastName].filter(Boolean).join(' ') ||
        renterProfile.displayName ||
        reservation.renterName
      : reservation.renterName;

  // ── Layout data (presentation only) ──────────────────────────────────────────
  const dueLine = (): { label: string; sub?: string; late?: boolean } | null => {
    const held = handoverDeposit?.depositCurrency && handoverDeposit.depositAmount != null
      ? `${handoverDeposit.depositAmount.toLocaleString('en-US')} ${handoverDeposit.depositCurrency}` : depositDisplay;
    const cur = reservation.chargeCurrency ?? handoverDeposit?.depositCurrency ?? 'LAK';
    const giveBack = Math.max(0, depositHeldAmount - (reservation.depositAppliedToCharge ?? 0));
    switch (phase) {
      case 'booked': {
        const booked = orderLines.length > 1 ? orderLines.filter(r => phaseOf(r) === 'booked') : [reservation];
        const rent = booked.reduce((t, r) => t + (r.total ?? 0), 0);
        const dep = booked.reduce((t, r) => t + (r.deposit ?? 0), 0);
        return { label: `To collect at pick-up: ${fmtLak(rent + dep)}`, sub: `rental ${fmtLak(rent)} + deposit ${fmtLak(dep)}${booked.length > 1 ? ` · ${booked.length} items` : ''}` };
      }
      case 'pickup_refused': return { label: 'Pick-up refused — nothing collected' };
      case 'out': {
        // Due back + how long from now (red once late).
        const ms = reservation.returnAt.toMillis() - Date.now();
        const h = Math.abs(ms) / 3_600_000;
        const span = h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} days`;
        return { label: `Deposit held: ${held}`, sub: `Due back ${reservation.returnLabel} · ${ms >= 0 ? `in ${span}` : `${span} late`}`, late: ms < 0 };
      }
      case 'return_review': return { label: `Deposit held: ${held}`, sub: 'Damage to review by an owner' };
      case 'to_settle_refund': return { label: `Give back: ${giveBack.toLocaleString('en-US')} ${cur}` };
      case 'to_settle_balance': return { label: `Balance due: ${outstandingBalance.toLocaleString('en-US')} ${cur}` };
      case 'lost_to_settle': return outstandingBalance > 0
        ? { label: `Balance due: ${outstandingBalance.toLocaleString('en-US')} ${cur}`, sub: 'Lost item' }
        : { label: `Give back: ${giveBack.toLocaleString('en-US')} ${cur}`, sub: 'Lost item' };
      case 'settled': case 'lost_settled': return { label: 'Settled' };
      case 'cancelled': case 'no_show_held': case 'no_show_lifted': return { label: 'Nothing charged' };
      default: return null;
    }
  };
  const money = dueLine();
  const idLabel = identity == null ? null
    : identity.status === 'on_file' ? `On file · ${ID_DOC_TYPES.find(t => t.key === identity.docType)?.label ?? 'ID document'}`
    : identity.status === 'rejected' ? 'Declined' : 'No ID on file';
  const checkNeeded = showsFirstRentalIdCheck(reservation);
  const toSettle = phase === 'to_settle_refund' || phase === 'to_settle_balance' || phase === 'lost_to_settle';
  const thumb = (product ? productThumb(product) : null) ?? reservation.productImage ?? null;
  const otherItems = orderLines.filter(r => r.id !== reservation.id);
  const agreementSummary = [
    reservation.agreementSignedAt?.toMillis ? `Signed ${vteDay(reservation.agreementSignedAt.toMillis())}` : 'Not signed',
    `pick-up ${reservation.handoverChecklist?.confirmedAt ? '✓' : '—'}`,
    `return ${reservation.returnChecklist?.confirmedAt ? '✓' : '—'}`,
  ].join(' · ');
  const showAgreement = !!reservation.agreementId || ['pending_payment', 'confirmed'].includes(reservation.status);

  // ONE primary action for the current phase (state machine), + the "⋯" menu.
  const earlyDay = isBeforePickupDay(reservation.pickupAt?.toMillis() ?? 0);
  const openConfirm = (fn: () => void) => { setActionError(null); fn(); setSheet('confirm'); };
  const primary: { label: string; disabled?: boolean; note?: string | null; onPress: () => void } | null =
    can('handover') ? {
      label: 'Start pick-up', disabled: earlyDay,
      note: earlyDay ? earlyHandoverPrompt(reservation.pickupAt?.toMillis() ?? 0) : null,
      onPress: () => router.push(`/admin/pickup?ids=${id}`),
    }
    : can('return') ? { label: 'Start return', onPress: () => router.push(`/admin/return?ids=${id}`) }
    : can('refund_deposit') ? { label: 'Settle deposit', onPress: () => setSheet('settle') }
    : can('record_balance_paid') ? { label: 'Record payment', onPress: () => setSheet('settle') }
    : can('settle_lost') ? { label: 'Settle lost item', onPress: () => setSheet('settle') }
    : isShopOwner && phase === 'return_review' && reservation.chargeReviewPending ? { label: 'Review damage', onPress: () => setSheet('damage') }
    : null;
  const menu: { label: string; icon: React.ComponentProps<typeof Feather>['name']; danger?: boolean; onPress: () => void }[] = [
    ...(can('refuse_pickup') ? [{ label: 'Refuse pick-up', icon: 'slash' as const, danger: true, onPress: () => openConfirm(() => setConfirmAction('refuse_pickup')) }] : []),
    ...(can('no_show') && isPickupMissed(reservation.pickupAt.toMillis()) ? [{ label: 'Mark as no-show', icon: 'user-x' as const, danger: true, onPress: () => openConfirm(openNoShow) }] : []),
    ...(can('lift_no_show') && renterHold?.reasons.includes('noShow') ? [{ label: 'Lift no-show hold', icon: 'unlock' as const, onPress: () => openConfirm(() => setConfirmAction('lift_hold')) }] : []),
    ...(can('report_lost') ? [{ label: 'Report lost/stolen', icon: 'alert-triangle' as const, danger: true, onPress: () => openConfirm(() => setConfirmAction('lost')) }] : []),
    ...(can('cancel') ? [{ label: 'Cancel reservation', icon: 'x-circle' as const, danger: true, onPress: () => openConfirm(openCancel) }] : []),
    ...(showAgreement ? [{ label: 'Agreement · open or print', icon: 'printer' as const, onPress: () => setSheet('agreement') }] : []),
    ...(can('report_incident') ? [{ label: 'Report an incident', icon: 'flag' as const, onPress: () => { setSheet(null); router.push(`/admin/incident?reservationId=${id}`); } }] : []),
    { label: isShopOwner ? 'Renter details · phone · give a code' : 'Renter details · phone', icon: 'user' as const, onPress: () => setSheet('renter') },
    ...(can('archive') ? [{ label: 'Archive (test / data fix)', icon: 'archive' as const, danger: true, onPress: () => openConfirm(() => { setArchiveReason(''); setConfirmAction('archive'); }) }] : []),
  ];
  const hasBar = !!primary || menu.some(m => m.icon !== 'user' && m.icon !== 'printer');
  const endState = phase === 'archived' ? `Archived${reservation.archivedReason ? ` — ${reservation.archivedReason}` : ''}. Read only.`
    : status === 'no_show' ? `No-show${reservation.noShowByName ? ` — marked by ${reservation.noShowByName}` : ''}${reservation.noShowHoldLiftedByName ? ` · hold lifted by ${reservation.noShowHoldLiftedByName}` : ''}`
    : status === 'cancelled' ? 'This reservation has been cancelled.'
    : status === 'returned' && reservation.returnFinalizedAt ? 'All done — item returned and deposit settled.'
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[d.root, hasBar ? { paddingTop: screen.top } : screen.root]}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[d.scroll, { paddingBottom: hasBar ? barHeight + 24 : screen.contentBottom }]}
      >
        {/* ── Alerts (only when present) ─────────────────────────────────── */}
        {/* Not picked up — an ALERT only: the normal pick-up flow below still works. */}
        {(status === 'pending_payment' || status === 'confirmed') && isPickupMissed(reservation.pickupAt.toMillis()) && (
          <View style={d.missedBanner}>
            <Feather name="alert-circle" size={14} color="#7A5500" />
            <Text style={d.missedBannerText}>
              Not picked up — the pick-up day is over. If the customer still comes, continue as usual; otherwise mark it as a no-show below.
            </Text>
          </View>
        )}

        {/* Renter's booking hold after a missed pick-up */}
        {renterHold?.reasons.includes('noShow') && (
          <View style={d.missedBanner}>
            <Feather name="pause-circle" size={14} color="#7A5500" />
            <Text style={d.missedBannerText}>
              On hold — missed pick-up. This customer can’t make new bookings until the hold is lifted.
            </Text>
          </View>
        )}

        {/* Late-return state — admin-only, so the internal grace period may be named here. */}
        {isReturnOverdue && latePenalty && (
          <View style={d.lateInfo}>
            {!!reservation.nonReturnAt && (
              <View style={d.nonReturnBadge}>
                <Text style={d.nonReturnBadgeText}>Non-return (72h+)</Text>
              </View>
            )}
            <Text style={d.lateInfoText}>
              {latePenalty.stage === 'grace'
                ? 'Within grace period — no penalty suggested yet.'
                : `Suggested late penalty: ${latePenalty.amountLak.toLocaleString('en-US')} LAK (${formatPenaltyDays(latePenalty.days)} × ${reservation.pricePerDay.toLocaleString('en-US')} LAK × ${reservation.quantity}). Confirmed at return — never applied automatically.`}
            </Text>
            {!!reservation.nonReturnAt && (
              <Text style={d.lateInfoText}>
                {'If the item comes back, use the normal return checklist. If not, use "Report lost/stolen".'}
              </Text>
            )}
          </View>
        )}

        {isShopOwner ? null : reservation.chargeReviewPending && (
          <Text style={d.endStateText}>Damage charge waiting for an owner — the deposit is held.</Text>
        )}
        <PickupRefusedCard reservation={reservation} owner={isShopOwner}
          onDone={() => setReservation(prev => prev ? { ...prev, pickupRefusedOpen: false } : prev)} />

        {/* ── SUMMARY ──────────────────────────────────────────────────────── */}
        <View style={d.card}>
          <View style={d.chipsWrap}>
            {!!phase && (
              <View style={[d.statusBadge, { backgroundColor: badge.bg }]}>
                <Text style={[d.statusBadgeText, { color: badge.fg }]}>{PHASE_LABELS[phase]}</Text>
              </View>
            )}
            {isReturnOverdue && (() => {
              const { bg, fg } = overdueChipColors(overdueSeverity(reservation.returnAt));
              return (
                <View style={[d.statusBadge, { backgroundColor: bg }]}>
                  <Text style={[d.statusBadgeText, { color: fg }]}>{overdueLabel(reservation.returnAt)}</Text>
                </View>
              );
            })()}
            {toSettle && (
              <View style={[d.statusBadge, { backgroundColor: SHADES.amberLight }]}>
                <Text style={[d.statusBadgeText, { color: SHADES.amberText }]}>Deposit to settle</Text>
              </View>
            )}
            {checkNeeded ? <FirstRentalIdChip atCounter={reservation.idCheckAtCounter} />
              : identity?.status === 'on_file' ? (
                <View style={[d.statusBadge, { backgroundColor: SHADES.carbonLight }]}>
                  <Text style={[d.statusBadgeText, { color: SHADES.carbon }]}>ID on file</Text>
                </View>
              ) : null}
          </View>

          <View style={d.productRow}>
            {thumb ? <ExpoImage source={{ uri: thumb }} style={d.productThumb} contentFit="cover" />
              : <View style={[d.productThumb, d.productThumbEmpty]}><Feather name="package" size={20} color={COLORS.fg3} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={d.productName} numberOfLines={2}>{`${reservation.productName}${reservation.quantity > 1 ? ` × ${reservation.quantity}` : ''}`}</Text>
              <Text style={d.productMeta}>{`${reservation.pickupLabel} → ${reservation.returnLabel}`}</Text>
              <Text style={d.productMeta}>{`${reservation.durationDays} day${reservation.durationDays !== 1 ? 's' : ''}${reservation.orderId ? ` · ${displayOrderId(reservation) ?? reservation.orderId}` : ''}`}</Text>
            </View>
          </View>

          {otherItems.length > 0 && (
            <View style={d.orderList}>
              <Text style={d.orderListTitle}>{`Same order · ${otherItems.length} other item${otherItems.length === 1 ? '' : 's'}`}</Text>
              {otherItems.map(r => {
                const ph = phaseOf(r);
                return (
                  <TouchableOpacity key={r.id} style={d.orderItem} activeOpacity={0.75}
                    onPress={() => router.push(`/admin/reservations/${r.id}`)}>
                    <Text style={d.orderItemName} numberOfLines={1}>{`${r.productName}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`}</Text>
                    <Text style={d.orderItemPhase} numberOfLines={1}>{ph ? PHASE_LABELS[ph] : r.status}</Text>
                    <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {money && (
            <View style={d.moneyBox}>
              <Text style={d.moneyLabel}>{money.label}</Text>
              {!!money.sub && <Text style={[d.moneySub, money.late && d.moneyLate]}>{money.sub}</Text>}
            </View>
          )}
          {!!reservation.notes && <Text style={d.notesText} numberOfLines={3}>{`Note: ${reservation.notes}`}</Text>}
          {!!endState && <Text style={d.endStateText}>{endState}</Text>}
        </View>

        {/* ── RENTER (one line) ────────────────────────────────────────────── */}
        <View style={[d.card, d.renterRow]}>
          <TouchableOpacity style={d.renterTap} onPress={() => setSheet('renter')} activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel="Renter details">
            <View style={d.renterAvatarCircle}>
              {renterPhotoURL
                ? <ExpoImage source={{ uri: renterPhotoURL }} style={d.renterAvatarCircleImg} contentFit="cover" />
                : <Text style={d.renterAvatarInitial}>{(renterDisplayName?.charAt(0) ?? '?').toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={d.renterAvatarName} numberOfLines={1}>{renterDisplayName ?? '—'}</Text>
              <View style={d.phoneLine}>
                <Text style={[d.productMeta, { marginTop: 0, flexShrink: 1 }]} numberOfLines={1}>
                  {identityPhone ? `${identityPhone}${phoneVerified ? '' : ' · not verified'}` : 'No phone on file'}
                </Text>
                {!!identityPhone && phoneVerified && (
                  <Feather name="check-circle" size={14} color={COLORS.success} accessibilityLabel="Phone verified" />
                )}
              </View>
            </View>
          </TouchableOpacity>
          {!!phone && (
            <TouchableOpacity style={d.iconBtn} onPress={() => Linking.openURL(`tel:${phone}`)}
              accessibilityRole="button" accessibilityLabel="Call the renter">
              <Feather name="phone" size={17} color={COLORS.carbon} />
            </TouchableOpacity>
          )}
          {!!whatsapp && (
            <TouchableOpacity style={d.iconBtn} onPress={() => Linking.openURL(`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`)}
              accessibilityRole="button" accessibilityLabel="WhatsApp the renter">
              <Feather name="message-circle" size={17} color={COLORS.carbon} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── COLLAPSIBLE SECTIONS (closed by default) ─────────────────────── */}
        <Section title="Price details" summary={`Total ${fmtLak(reservation.total)} · deposit ${depositDisplay}`}
          open={openSections.has('price')} onToggle={() => toggleSection('price')}>
          <InfoRow label="Rate"     value={`${fmtLak(reservation.pricePerDay)} / day`} />
          <InfoRow label="Subtotal" value={fmtLak(reservation.subtotal)} />
          {discountOf(reservation) && (
            <InfoRow label={discountOf(reservation)!.label} value={`−${fmtLak(discountOf(reservation)!.amount)}`} muted />
          )}
          <View style={d.divider} />
          <InfoRow label="Total to pay"         value={fmtLak(reservation.total)}   bold />
          <InfoRow label="Deposit (refundable)"  value={depositDisplay} muted />
          {!!reservation.handoverPayment && (
            <InfoRow label="Collected at pick-up" muted
              value={`${reservation.handoverPayment.rental.amount.toLocaleString('en-US')} ${reservation.handoverPayment.rental.currency} + ${reservation.handoverPayment.deposit.amount.toLocaleString('en-US')} ${reservation.handoverPayment.deposit.currency}`} />
          )}
          {hasCharge && (
            <View style={{ marginTop: 8 }}>
              <SettlementSummary
                chargeAmount={reservation.chargeAmount}
                chargeReason={reservation.chargeReason}
                lateChargeAmount={reservation.lateChargeAmount}
                lateChargeReason={reservation.lateChargeReason}
                depositAmount={depositHeldAmount}
                depositCurrency={reservation.chargeCurrency!}
                depositAppliedToCharge={reservation.depositAppliedToCharge ?? 0}
                outstandingBalance={outstandingBalance}
                outstandingSettled={reservation.outstandingSettled}
                outstandingSettledBy={reservation.outstandingSettledBy}
                outstandingWrittenOff={reservation.outstandingWrittenOff}
                outstandingWrittenOffBy={reservation.outstandingWrittenOffBy}
              />
            </View>
          )}
        {/* ── WAIVED CHARGES (internal) ─────────────────────────────────── */}
        {isShopOwner && (reservation.lateChargeWaived || reservation.damageChargeWaived) && (() => {
          const cur = reservation.chargeCurrency ?? handoverDeposit?.depositCurrency ?? 'LAK';
          const canUndo = !reservation.returnFinalizedAt;
          const entries = ([
            reservation.lateChargeWaived ? {
              key: 'late' as const, label: 'Late fee waived', amount: reservation.lateChargeWaivedAmount,
              reason: reservation.lateChargeWaivedReason, by: reservation.lateChargeWaivedBy,
            } : null,
            reservation.damageChargeWaived ? {
              key: 'damage' as const, label: 'Damage charge waived', amount: reservation.damageChargeWaivedAmount,
              reason: reservation.damageChargeWaivedReason, by: reservation.damageChargeWaivedBy,
            } : null,
          ]).filter((e): e is NonNullable<typeof e> => e != null);
          // Reinstates the suggested amount and recomputes the deposit split exactly like
          // the return checklist does (min/max against the deposit held).
          const undo = (key: 'late' | 'damage') => {
            const late = key === 'late' ? reservation.lateChargeWaivedAmount : reservation.lateChargeAmount;
            const damage = key === 'damage' ? reservation.damageChargeWaivedAmount : reservation.chargeAmount;
            const total = (late ?? 0) + (damage ?? 0);
            const split = {
              chargeCurrency: cur,
              depositAppliedToCharge: Math.min(total, depositHeldAmount),
              outstandingBalance: Math.max(0, total - depositHeldAmount),
            };
            const fields = key === 'late'
              ? {
                  lateChargeWaived: false,
                  lateChargeAmount: reservation.lateChargeWaivedAmount!,
                  lateChargeReason: reservation.lateChargeWaivedReason ?? 'Late return penalty',
                  ...split,
                }
              : {
                  damageChargeWaived: false,
                  chargeAmount: reservation.damageChargeWaivedAmount!,
                  chargeReason: reservation.damageChargeWaivedReason ?? 'Item condition',
                  ...(reservation.damageChargeWaivedPercent != null ? { chargePercent: reservation.damageChargeWaivedPercent } : {}),
                  ...split,
                };
            setConfirmUnwaive(null);
            runAction('undo_waiver', fields, fields);
          };
          return (
            <View style={[d.card, { marginBottom: 12 }]}>
              <Text style={d.cardLabel}>Waived charges</Text>
              {entries.map(e => (
                <View key={e.key} style={{ marginTop: 6 }}>
                  <InfoRow
                    label={e.label}
                    value={e.amount != null ? `${e.amount.toLocaleString('en-US')} ${cur} suggested` : '—'}
                    muted
                  />
                  {!!(e.reason || e.by) && (
                    <Text style={d.notesText}>{[e.reason, e.by ? `waived by ${e.by}` : null].filter(Boolean).join(' · ')}</Text>
                  )}
                  {canUndo && e.amount != null && confirmUnwaive !== e.key && (
                    <TouchableOpacity onPress={() => setConfirmUnwaive(e.key)} activeOpacity={0.7} style={{ marginTop: 6 }}>
                      <Text style={d.cancelLinkText}>Undo waiver</Text>
                    </TouchableOpacity>
                  )}
                  {confirmUnwaive === e.key && (
                    <ConfirmBox
                      text={`Charge the ${e.amount!.toLocaleString('en-US')} ${cur} again? The deposit refund will be recalculated.`}
                      confirmLabel="Undo waiver"
                      cancelLabel="Keep waived"
                      onCancel={() => setConfirmUnwaive(null)}
                      onConfirm={() => undo(e.key)}
                    />
                  )}
                </View>
              ))}
              {!canUndo && <Text style={d.notesText}>The settlement is finalised — waivers can no longer be undone.</Text>}
            </View>
          );
        })()}

          {status === 'returned' && reservation.returnFinalizedAt && (
            <View style={{ marginTop: 8 }}>
              <RentalReceipt rental={reservation} vatPercent={vatPercent} staffView />
            </View>
          )}
        </Section>

        <Section title="ID document" summary={checkNeeded ? 'First rental — check ID' : idLabel ?? '…'}
          open={openSections.has('id')} onToggle={() => toggleSection('id')}>
          <RenterIdCard renterId={reservation.renterId} hideName bare />
        </Section>

        {(showAgreement || reservation.handoverChecklist?.confirmedAt || reservation.returnChecklist?.confirmedAt) && (
          <Section title="Agreement & checklists" summary={agreementSummary}
            open={openSections.has('docs')} onToggle={() => toggleSection('docs')}>
            {showAgreement && <AgreementAdminCard reservation={reservation} />}
            {reservation.handoverChecklist?.confirmedAt && (
              <TouchableOpacity style={d.checklistLinkRow} activeOpacity={0.75}
                onPress={() => router.push(`/admin/reservations/${id}/checklist?type=handover&mode=view`)}>
                <Feather name="clipboard" size={14} color={COLORS.carbon} />
                <Text style={d.checklistLinkText}>View pick-up checklist</Text>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
            {reservation.returnChecklist?.confirmedAt && (
              <TouchableOpacity style={d.checklistLinkRow} activeOpacity={0.75}
                onPress={() => router.push(`/admin/reservations/${id}/checklist?type=return&mode=view`)}>
                <Feather name="clipboard" size={14} color={COLORS.carbon} />
                <Text style={d.checklistLinkText}>View return checklist</Text>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
          </Section>
        )}

        <Section title="History" summary={historyLatest ?? `Created ${fmtTimestamp(reservation.createdAt)}`}
          open={openSections.has('history')} onToggle={() => toggleSection('history')}>
          <HistoryCard reservationId={reservation.id} renterId={reservation.renterId} bare onLatest={setHistoryLatest} />
          <Text style={d.metaText}>{`Created: ${fmtTimestamp(reservation.createdAt)}`}</Text>
        </Section>
        {/* A closed History section still shows the latest entry (loaded, not rendered). */}
        {!openSections.has('history') && (
          <HistoryCard reservationId={reservation.id} renterId={reservation.renterId} hidden onLatest={setHistoryLatest} />
        )}
      </ScrollView>

      {/* ── STICKY ACTION BAR (above the Android nav bar) ──────────────────── */}
      {hasBar && (
        <View style={[d.bar, { paddingBottom: screen.bottom + 10 }]} onLayout={e => setBarHeight(e.nativeEvent.layout.height)}>
          {!!actionError && <Text style={d.barError} numberOfLines={2}>{actionError}</Text>}
          {!!primary?.note && <Text style={d.barNote} numberOfLines={2}>{primary.note}</Text>}
          <View style={d.barRow}>
            {primary ? (
              <TouchableOpacity style={[d.primaryBtn, d.barPrimary, (primary.disabled || actioning) && { opacity: 0.45 }]}
                disabled={primary.disabled || actioning} onPress={primary.onPress} activeOpacity={0.85}>
                {actioning ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={d.primaryBtnText}>{primary.label}</Text>}
              </TouchableOpacity>
            ) : <View style={{ flex: 1 }} />}
            <TouchableOpacity style={d.moreBtn} onPress={() => { setActionError(null); setSheet('menu'); }}
              accessibilityRole="button" accessibilityLabel="More actions">
              <Feather name="more-horizontal" size={20} color={COLORS.carbon} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* ── ONE bottom sheet: menu / confirmation / settlement / review / renter ── */}
      <Modal visible={sheet !== null} transparent animationType="fade" statusBarTranslucent
        onRequestClose={() => { if (!actioning) { setSheet(null); setConfirmAction(null); } }}>
        <KeyboardAvoidingView style={d.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} accessibilityLabel="Close"
            onPress={() => { if (!actioning) { setSheet(null); setConfirmAction(null); } }} />
          <View style={[d.sheet, { paddingBottom: screen.bottom + 12 }]}>
            <View style={d.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              {!!actionError && sheet !== 'menu' && (
                <View style={d.errorBanner}>
                  <Feather name="alert-circle" size={14} color={COLORS.danger} />
                  <Text style={d.errorBannerText}>{actionError}</Text>
                </View>
              )}
              {actioning && <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 8 }} />}
              {sheet === 'menu' && (
                <>
                  <Text style={d.sheetTitle}>{phase ? PHASE_LABELS[phase] : 'Actions'}</Text>
                  {menu.map(m => (
                    <TouchableOpacity key={m.label} style={d.menuRow} onPress={m.onPress} activeOpacity={0.75}>
                      <Feather name={m.icon} size={17} color={m.danger ? COLORS.danger : COLORS.carbon} />
                      <Text style={[d.menuText, m.danger && { color: COLORS.danger }]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {sheet === 'confirm' && (
                <>
          {/* D6: no return without a checklist — "Mark as returned" opens the checklist. */}
          {!actioning && confirmAction === 'lost' && (
            <ConfirmBox
              text={
                lostChargeAmount != null
                  ? `Report ${lostQty > 1 ? `${lostUnits} of ${lostQty} units` : 'this item'} lost/stolen? A charge of ${lostChargeAmount.toLocaleString('en-US')} ${lostChargeCurrency} (100% of replacement value${lostUnits > 1 ? ` × ${lostUnits} units` : ''})${lostLateChargeAmount != null ? `, plus a ${lostLateChargeAmount.toLocaleString('en-US')} ${lostChargeCurrency} late-return penalty already on this reservation,` : ''} will be recorded, and the reservation will be closed as lost.${lostQty > lostUnits ? ` The other ${lostQty - lostUnits} ${lostQty - lostUnits === 1 ? 'unit is' : 'units are'} back in stock.` : ''}`
                  : product?.retailPrice == null
                  ? "Replacement value not set for this product — charge can't be calculated. Set it on the product's admin page first."
                  : 'Enter a valid charge amount to continue.'
              }
              confirmLabel="Report lost/stolen"
              confirmDisabled={lostChargeAmount == null || lostStaffName.trim().length === 0}
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => {
                if (lostChargeAmount == null) return;
                const combinedCharge = lostChargeAmount + (lostLateChargeAmount ?? 0);
                const depositApplied = Math.min(combinedCharge, depositHeldAmount);
                const outstanding = Math.max(0, combinedCharge - depositHeldAmount);
                const lateFields = lostLateChargeAmount != null ? {
                  lateChargeAmount: lostLateChargeAmount,
                  lateChargeReason: reservation.lateChargeReason ?? 'Late return penalty',
                } : {};
                runAction(
                  'report_lost',
                  {
                    status: 'lost',
                    chargeAmount: lostChargeAmount,
                    chargeCurrency: lostChargeCurrency,
                    chargeReason: lostNotes.trim() ? `Reported lost/stolen — ${lostNotes.trim()}` : 'Reported lost/stolen',
                    chargeSeverity: 'lostStolen',
                    chargePercent: 100,
                    chargeUnits: lostUnits,
                    ...lateFields,
                    depositAppliedToCharge: depositApplied,
                    outstandingBalance: outstanding,
                  },
                  {
                    status: 'lost',
                    chargeAmount: lostChargeAmount,
                    chargeCurrency: lostChargeCurrency,
                    chargeReason: lostNotes.trim() ? `Reported lost/stolen — ${lostNotes.trim()}` : 'Reported lost/stolen',
                    chargeSeverity: 'lostStolen',
                    chargePercent: 100,
                    chargeUnits: lostUnits,
                    ...lateFields,
                    depositAppliedToCharge: depositApplied,
                    outstandingBalance: outstanding,
                  },
                  () => sendNotif(reservation.renterId, {
                    type: 'rental',
                    icon: 'alert',
                    iconColor: 'coral',
                    title: 'Item reported lost/stolen',
                    body: `Your ${reservation.productName} rental has been closed as lost/stolen. Contact us for details.`,
                    deepLink: `/rentals/${id}`,
                  }),
                  // Closes the gap this feature exists to fix: reporting a reservation
                  // lost now atomically increments the product's own lostUnits count
                  // (by this reservation's quantity) instead of leaving it to a
                  // separate, easily-forgotten manual edit on the product's own screen.
                  (batch, auditId) => addStockAdjustmentToBatch(
                    batch,
                    reservation.productId,
                    'lostUnits',
                    lostUnits,
                    lostNotes.trim() ? `Reported lost/stolen — ${lostNotes.trim()}` : 'Reported lost/stolen',
                    lostStaffName.trim(),
                    id,
                    auditId,
                  ),
                );
              }}
              destructive
            >
              {lostQty > 1 && (
                <UnitsStepper label="Units lost" value={lostUnits} max={lostQty} onChange={setLostUnitsCount} />
              )}
              {product?.retailPrice != null && (
                <View style={d.numRow}>
                  <TextInput
                    style={[d.nameInput, { flex: 1, marginBottom: 0 }]}
                    keyboardType="number-pad"
                    value={lostChargeAmountInput}
                    onChangeText={t => { setLostChargeAmountInput(t); setLostChargeTouched(true); }}
                    placeholder="0"
                    placeholderTextColor={COLORS.fg3}
                  />
                  <Text style={d.currencyUnit}>{lostChargeCurrency}</Text>
                </View>
              )}
              {lostLateChargeAmount != null && (
                <Text style={d.readOnlyLateChargeText}>
                  + {lostLateChargeAmount.toLocaleString('en-US')} {lostChargeCurrency} late-return penalty (already on this reservation, not editable here)
                </Text>
              )}
              <TextInput
                style={d.nameInput}
                placeholder="Staff member name"
                placeholderTextColor={COLORS.fg3}
                value={lostStaffName}
                onChangeText={setLostStaffName}
              />
              <TextInput
                style={d.nameInput}
                placeholder="Notes (optional)"
                placeholderTextColor={COLORS.fg3}
                value={lostNotes}
                onChangeText={setLostNotes}
              />
            </ConfirmBox>
          )}
          {!actioning && confirmAction === 'no_show' && (() => {
            const otherMissed = orderSiblings.filter(r =>
              r.id !== id && (r.status === 'pending_payment' || r.status === 'confirmed')
              && isPickupMissed(r.pickupAt.toMillis()));
            return (
              <ConfirmBox
                text={noShowScope === 'order'
                  ? `Mark the whole order (${otherMissed.length + 1} items) as a no-show? The items are released and new bookings are paused for this customer until you lift the hold. This is final.`
                  : 'Mark as a no-show? The item is released and new bookings are paused for this customer until you lift the hold. This is final.'}
                confirmLabel="Mark as no-show"
                cancelLabel="Keep"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => handleMarkNoShow(noShowScope === 'order' ? [id!, ...otherMissed.map(r => r.id)] : [id!])}
                destructive
              >
                {otherMissed.length > 0 && (
                  <View style={d.chipRow}>
                    {(['item', 'order'] as const).map(sc => (
                      <TouchableOpacity
                        key={sc}
                        style={[d.chip, noShowScope === sc && d.chipActive]}
                        onPress={() => setNoShowScope(sc)}
                        activeOpacity={0.8}
                      >
                        <Text style={[d.chipText, noShowScope === sc && d.chipTextActive]}>
                          {sc === 'item' ? 'This item only' : `Whole order (${otherMissed.length + 1} items)`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ConfirmBox>
            );
          })()}

          {!actioning && confirmAction === 'lift_hold' && (
            <ConfirmBox
              text="Lift the no-show hold? The customer can book again right away. The no-show stays in the history."
              confirmLabel="Lift hold"
              cancelLabel="Keep"
              onCancel={() => setConfirmAction(null)}
              onConfirm={handleLiftHold}
            />
          )}

          {!actioning && confirmAction === 'cancel' && (() => {
            const otherLines = orderSiblings.filter(r =>
              r.id !== id && (ADMIN_CANCELLABLE_STATUSES as readonly string[]).includes(r.status));
            return (
              <ConfirmBox
                text={cancelScope === 'order'
                  ? `Cancel the whole order (${otherLines.length + 1} items)? This cannot be undone. The customer will be notified in the app and by email.`
                  : 'Cancel this reservation? This cannot be undone. The customer will be notified in the app and by email.'}
                confirmLabel={cancelScope === 'order' ? 'Cancel order' : 'Cancel reservation'}
                cancelLabel="Keep"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => handleAdminCancel(cancelScope === 'order' ? [id!, ...otherLines.map(r => r.id)] : [id!])}
                confirmDisabled={!cancelReason || (cancelReason === 'other' && !cancelReasonText.trim())}
                destructive
              >
                {/* Cancelling one item of a pack removes the pack price on the others. */}
                {reservation && (
                  <PackCancelNote
                    staff
                    orderLines={[reservation, ...orderSiblings.filter(r => r.id !== reservation.id)]}
                    cancelIds={cancelScope === 'order' ? [id!, ...otherLines.map(r => r.id)] : [id!]}
                  />
                )}
                {otherLines.length > 0 && (
                  <View style={d.chipRow}>
                    {(['item', 'order'] as const).map(sc => (
                      <TouchableOpacity
                        key={sc}
                        style={[d.chip, cancelScope === sc && d.chipActive]}
                        onPress={() => setCancelScope(sc)}
                        activeOpacity={0.8}
                      >
                        <Text style={[d.chipText, cancelScope === sc && d.chipTextActive]}>
                          {sc === 'item' ? 'This item only' : `Whole order (${otherLines.length + 1} items)`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={d.cancelFieldLabel}>Reason</Text>
                <View style={d.chipRow}>
                  {CANCEL_REASON_KEYS.map(key => (
                    <TouchableOpacity
                      key={key}
                      style={[d.chip, cancelReason === key && d.chipActive]}
                      onPress={() => setCancelReason(key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[d.chipText, cancelReason === key && d.chipTextActive]}>{CANCEL_REASONS[key].label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={d.nameInput}
                  placeholder={cancelReason === 'other' ? 'Details (required)' : 'Details (optional)'}
                  placeholderTextColor={COLORS.fg3}
                  value={cancelReasonText}
                  onChangeText={setCancelReasonText}
                />
              </ConfirmBox>
            );
          })()}

          {!actioning && confirmAction === 'archive' && (
            <ConfirmBox
              text="Archive this booking? It leaves every list, counter and to-do (still visible under the Archived filter). Stock isn't moved — use Admin → Data check to release held units."
              confirmLabel="Archive"
              confirmDisabled={archiveReason.trim().length < 3}
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => runAction('archive', {
                archived: true,
                archivedAt: serverTimestamp(),
                archivedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Owner',
                archivedReason: archiveReason.trim().slice(0, 300),
                ...(reservation.returnFinalizedAt ? {} : { returnFinalizedAt: serverTimestamp() }),
                ...(status === 'returned' && reservation.stockReleasedAt == null ? { stockReleasedAt: serverTimestamp() } : {}),
              }, { archived: true, archivedReason: archiveReason.trim() })}
            >
              <TextInput style={d.input} value={archiveReason} onChangeText={setArchiveReason}
                placeholder="Reason (e.g. test booking)" placeholderTextColor={COLORS.fg3} />
            </ConfirmBox>
          )}

          {!actioning && confirmAction === 'refuse_pickup' && (
            <RefusePickupBox
              reservationIds={[reservation.id]}
              onCancel={() => setConfirmAction(null)}
              onDone={() => {
                setConfirmAction(null);
                getReservationById(reservation.id).then(r => r && setReservation(r)).catch(() => {});
              }}
            />
          )}

                </>
              )}
              {sheet === 'settle' && toSettle && (
                <>
                  <Text style={d.sheetTitle}>
                    {phase === 'to_settle_refund' ? 'Deposit to settle · Refund now'
                      : phase === 'to_settle_balance' ? 'Balance due · Record payment' : 'Lost item · to settle'}
                  </Text>
                  <SettlementActions
                    reservation={reservation}
                    confirmAction={confirmAction === 'deposit' || confirmAction === 'settle_outstanding' || confirmAction === 'write_off_outstanding' ? confirmAction : null}
                    setConfirmAction={setConfirmAction}
                    actioning={actioning}
                    setActioning={setActioning}
                    setActionError={setActionError}
                    onSettled={u => setReservation(prev => prev ? { ...prev, ...u } : prev)}
                  />
                </>
              )}
              {sheet === 'damage' && isShopOwner && (
                <DamageReviewCard reservation={reservation}
                  onDone={u => { setReservation(prev => prev ? { ...prev, ...u } : prev); setSheet(null); }} />
              )}
              {sheet === 'agreement' && <AgreementAdminCard reservation={reservation} />}
              {sheet === 'renter' && (
                <>
                  <Text style={d.sheetTitle}>Renter</Text>
                  <RenterNameBlock renterId={reservation.renterId} />
          {/* ── Phone identity & verification status ── */}
          {editingPhone ? (
            <View style={d.phoneEditSection}>
              <View style={d.phoneEditInputRow}>
                <TextInput
                  style={d.phoneEditInput}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  placeholder="+8562012345678"
                  placeholderTextColor={COLORS.fg3}
                  keyboardType="phone-pad"
                  autoFocus
                  editable={!savingPhone}
                />
              </View>
              {phoneError ? (
                <Text style={d.phoneEditError}>{phoneError}</Text>
              ) : null}
              <View style={d.phoneEditBtns}>
                <TouchableOpacity
                  style={d.phoneEditCancelBtn}
                  onPress={() => setEditingPhone(false)}
                  disabled={savingPhone}
                  activeOpacity={0.8}
                >
                  <Text style={d.phoneEditCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={d.phoneEditSaveBtn}
                  onPress={handleSavePhone}
                  disabled={savingPhone}
                  activeOpacity={0.8}
                >
                  {savingPhone ? (
                    <ActivityIndicator size="small" color={COLORS.carbon} />
                  ) : (
                    <Text style={d.phoneEditSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={d.phoneVerifyRow}>
              <View style={d.phoneVerifyLeft}>
                <Feather name="phone" size={14} color={COLORS.fg3} />
                <Text style={d.phoneVerifyNumber}>
                  {identityPhone ?? 'No phone on file'}
                </Text>
              </View>
              <View style={d.phoneVerifyRight}>
                {identityPhone ? (
                  phoneVerified ? (
                    <View style={d.verifiedBadge}>
                      <Feather name="check-circle" size={12} color="#065F46" />
                      <Text style={d.verifiedBadgeText}>Verified</Text>
                    </View>
                  ) : (
                    <>
                      <View style={d.unverifiedBadge}>
                        <Feather name="clock" size={12} color="#92400E" />
                        <Text style={d.unverifiedBadgeText}>Not verified</Text>
                      </View>
                      <TouchableOpacity
                        style={d.verifyBtn}
                        onPress={handleVerifyPhone}
                        disabled={verifyingPhone}
                        activeOpacity={0.8}
                      >
                        {verifyingPhone ? (
                          <ActivityIndicator size="small" color={COLORS.carbon} />
                        ) : (
                          <Text style={d.verifyBtnText}>Mark verified</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )
                ) : (
                  <View style={d.unverifiedBadge}>
                    <Feather name="alert-circle" size={12} color="#92400E" />
                    <Text style={d.unverifiedBadgeText}>Missing</Text>
                  </View>
                )}
                <TouchableOpacity hitSlop={6} accessibilityRole="button" accessibilityLabel="Edit"
                  style={d.editPhoneBtn}
                  onPress={handleEditPhone}
                  activeOpacity={0.8}
                >
                  <Feather name="edit-2" size={13} color={COLORS.fg3} />
                </TouchableOpacity>
              </View>
            </View>
          )}

                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Section (collapsible; the key info stays visible when closed) ─────────────
function Section({ title, summary, open, onToggle, children }: {
  title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <View style={d.card}>
      <TouchableOpacity style={d.sectionHead} onPress={onToggle} activeOpacity={0.75}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Text style={d.sectionTitle}>{title}</Text>
          {!open && <Text style={d.sectionSummary} numberOfLines={1}>{summary}</Text>}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.fg3} />
      </TouchableOpacity>
      {open && <View style={{ marginTop: 8 }}>{children}</View>}
    </View>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  bold,
  muted,
  small,
}: {
  label: string;
  value: string | null | undefined;
  bold?: boolean;
  muted?: boolean;
  small?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text
        style={[ir.value, bold && ir.bold, muted && ir.muted, small && ir.small]}
        numberOfLines={small ? 1 : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 8,
  },
  label: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, flex: 1 },
  value: {
    fontSize: 13, fontWeight: '600', color: COLORS.carbon,
    flex: 1.5, textAlign: 'right',
  },
  bold:  { fontWeight: '800', fontSize: 15 },
  muted: { color: COLORS.fg3, fontWeight: '500' },
  small: { fontSize: 10, fontWeight: '400', color: COLORS.fg3 },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  root:     { flex: 1, backgroundColor: COLORS.porcelain },

  // ── Layout (2026-11-27): summary, renter line, sections, sticky bar, sheet ──
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  productRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  productThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  productThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  productName: { ...TYPE.cardTitle, color: COLORS.carbon },
  productMeta: { ...TYPE.secondary, color: COLORS.fg3, marginTop: 2 },
  orderList: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.softGray200, paddingTop: 8, gap: 2 },
  orderListTitle: { ...TYPE.small, fontWeight: '700', color: COLORS.fg3, marginBottom: 2 },
  orderItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, minHeight: 44 },
  orderItemName: { ...TYPE.body, fontWeight: '600', color: COLORS.carbon, flex: 1 },
  orderItemPhase: { ...TYPE.small, color: COLORS.fg3, maxWidth: '45%' },
  moneyBox: { marginTop: 12, backgroundColor: SHADES.amberLight, borderRadius: 12, padding: 12, gap: 2 },
  moneyLabel: { ...TYPE.cardTitle, color: COLORS.carbon },
  moneySub: { ...TYPE.small, color: SHADES.carbonMuted },
  moneyLate: { color: COLORS.danger, fontWeight: '700' },
  phoneLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  renterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  renterTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.softGray200, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  sectionTitle: { ...TYPE.cardTitle, color: COLORS.carbon },
  sectionSummary: { ...TYPE.secondary, color: COLORS.fg3, marginTop: 2 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.softGray200, paddingHorizontal: 16, paddingTop: 10, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 8,
  },
  barRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  barPrimary: { flex: 1, marginTop: 0 },
  barError: { ...TYPE.small, color: COLORS.danger },
  barNote: { ...TYPE.small, color: SHADES.amberText, fontWeight: '600' },
  moreBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,30,30,0.4)' },
  sheet: { backgroundColor: COLORS.porcelain, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.softGray200, marginBottom: 10 },
  sheetTitle: { ...TYPE.sectionTitle, color: COLORS.carbon, marginBottom: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, backgroundColor: COLORS.white, borderRadius: 14 },
  menuText: { ...TYPE.body, fontWeight: '600', color: COLORS.carbon, flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, fontWeight: '500', color: COLORS.fg3 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  // Status + deposit row
  statusRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  statusBadgeText:  { fontSize: 13, fontWeight: '800' },

  depositPending: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: COLORS.amberTint, borderWidth: 1, borderColor: COLORS.amberTintBorder,
  },
  depositPendingText: { fontSize: 12, fontWeight: '700', color: COLORS.amberTintText },

  depositReturned: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: '#A7F3D0',
  },
  depositReturnedText: { fontSize: 12, fontWeight: '700', color: '#065F46' },

  // Info cards
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16 },
  cardLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: COLORS.fg3, marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: COLORS.softGray200, marginVertical: 6 },

  nameInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.carbon, marginBottom: 8,
  },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  currencyUnit: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  lateInfo:          { gap: 6, marginTop: 8, marginBottom: 4 },
  lateInfoText:      { fontSize: 12, fontWeight: '500', color: COLORS.fg2, lineHeight: 17 },
  nonReturnBadge:    { alignSelf: 'flex-start', backgroundColor: COLORS.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  nonReturnBadgeText:{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  readOnlyLateChargeText: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginBottom: 8 },

  // Renter contact
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
  },
  contactBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },

  notesText: {
    fontSize: 14, fontWeight: '400', color: COLORS.carbon, lineHeight: 20, marginTop: 6,
  },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4,
  },
  metaText: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },

  // Checklist view links
  checklistLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  checklistLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.carbon },

  // ── Actions card ─────────────────────────────────────────────────────────
  settleCard: { borderWidth: 1.5, borderColor: COLORS.amber, marginBottom: 12, gap: 8 },
  settleTitle: { fontSize: 16, fontWeight: '800', color: COLORS.carbon },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.softGray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.carbon, marginTop: 8,
  },
  actionsCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, gap: 10,
  },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10,
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
  },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#B91C1C' },

  actionLoading: { paddingVertical: 12, alignItems: 'center' },

  primaryBtn: {
    height: 52, borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.1 },

  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  missedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FDF0C4', borderRadius: 10, padding: 12, marginTop: 8,
  },
  missedBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#7A5500', lineHeight: 17 },
  cancelFieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginTop: 4, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  chipActive: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.fg2 },
  chipTextActive: { color: COLORS.white },
  cancelLinkText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  endState: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  endStateText: { fontSize: 13, fontWeight: '500', color: COLORS.fg3 },

  // Phone verification row in Renter card
  phoneVerifyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  phoneVerifyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  phoneVerifyRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  phoneVerifyNumber: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },

  // Phone edit section
  phoneEditSection: { paddingVertical: 8, gap: 8 },
  phoneEditInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.softGray200, borderRadius: 10,
    backgroundColor: COLORS.warmBeige, paddingHorizontal: 12,
  },
  phoneEditInput: {
    flex: 1, height: 44, fontSize: 14, fontWeight: '600', color: COLORS.carbon,
  },
  phoneEditError: { fontSize: 12, fontWeight: '500', color: COLORS.danger },
  phoneEditBtns: { flexDirection: 'row', gap: 10 },
  phoneEditCancelBtn: {
    flex: 1, height: 40, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneEditCancelText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  phoneEditSaveBtn: {
    flex: 1, height: 40, borderRadius: 8,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneEditSaveText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },

  // Mark verified + edit phone buttons
  verifyBtn: {
    height: 32, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  verifyBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.carbon },
  editPhoneBtn: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center',
  },

  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: '#A7F3D0',
  },
  verifiedBadgeText: { fontSize: 12, fontWeight: '700', color: '#065F46' },

  unverifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: COLORS.amberTint, borderWidth: 1, borderColor: COLORS.amberTintBorder,
  },
  unverifiedBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.amberTintText },

  // Renter avatar in Renter card
  renterAvatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  renterAvatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  renterAvatarCircleImg: {
    width: 44, height: 44,
  },
  renterAvatarInitial: {
    fontSize: 16, fontWeight: '800', color: COLORS.fg2,
  },
  renterAvatarName: {
    fontSize: 15, fontWeight: '700', color: COLORS.carbon,
  },
  renterIdSmall: {
    fontSize: 10, fontWeight: '400', color: COLORS.fg3, marginTop: 2,
  },
});
