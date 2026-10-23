import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { isPickupMissed } from '@/functions/src/shared/dates';
import type { BookingHold } from '@/lib/bookingHold';
import {
  getUserProfile,
  getProduct,
  addStockAdjustmentToBatch,
  adminCancelReservations,
  adminMarkNoShow,
  adminLiftNoShowHold,
  getReservationsByOrderId,
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
import {
  CANCEL_REASONS,
  CANCEL_REASON_KEYS,
  ADMIN_CANCELLABLE_STATUSES,
  type CancelReason,
} from '@/functions/src/shared/cancellation';

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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

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
  const [confirmAction, setConfirmAction] = useState<
    'confirm_payment' | 'pickup' | 'returned' | 'deposit' | 'cancel' | 'settle_outstanding' | 'write_off_outstanding' | 'lost'
    | 'no_show' | 'lift_hold' | null
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

  // ── Phone edit state ──────────────────────────────────────────────────────
  const [editingPhone,   setEditingPhone]   = useState(false);
  const [phoneInput,     setPhoneInput]     = useState('');
  const [savingPhone,    setSavingPhone]    = useState(false);
  const [phoneError,     setPhoneError]     = useState<string | null>(null);
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  // ── Load reservation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'reservations', id))
      .then(snap => {
        if (!snap.exists()) { setLoading(false); return; }
        const r = { id: snap.id, ...snap.data() } as RentalDoc;
        setReservation(r);
        getProduct(r.productId).then(setProduct).catch(() => setProduct(null));
        getUserProfile(r.renterId)
          .then(p => { if (p) setRenterProfile(p); })
          .catch(() => {})
          .finally(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, [id]);

  // ── Action executor ───────────────────────────────────────────────────────
  const runAction = useCallback(async (
    firestoreUpdates: Record<string, unknown>,
    localUpdates: Partial<Omit<RentalDoc, 'id'>>,
    onSuccess?: () => void,
    // Optional — lets a caller fold ADDITIONAL writes into the SAME atomic batch as the
    // reservation update, instead of a separate non-atomic write after this one
    // resolves. Used by the "Report lost/stolen" action to also increment the product's
    // lostUnits count + write its audit log, so the two can never partially succeed.
    extraBatchWork?: (batch: WriteBatch) => void,
  ) => {
    if (!id || actioning) return;
    setActioning(true);
    setActionError(null);
    setConfirmAction(null);
    try {
      if (extraBatchWork) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'reservations', id), { ...firestoreUpdates, updatedAt: serverTimestamp() });
        extraBatchWork(batch);
        await batch.commit();
      } else {
        await updateDoc(doc(db, 'reservations', id), {
          ...firestoreUpdates,
          updatedAt: serverTimestamp(),
        });
      }
      setReservation(prev => prev ? { ...prev, ...localUpdates } : prev);
      onSuccess?.();
    } catch (err: any) {
      console.error('[AdminReservationDetail] action error:', err?.code, err?.message);
      setActionError('Failed to update. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [id, actioning]);

  // ── Lost/stolen charge — always 100% of replacement value. Currency comes from the
  // reservation's already-locked deposit currency; 'LAK' is a defensive fallback only —
  // status === 'active' structurally guarantees a completed handover checklist already
  // exists, so this branch is effectively unreachable in practice. Declared here (not in
  // the "Derived" section below, which sits after early-return guards) since it drives a
  // hook and hooks can't be called conditionally. ─────────────────────────────────
  const lostChargeCurrency: 'LAK' | 'USD' | 'THB' = reservation?.handoverChecklist?.depositCurrency ?? 'LAK';
  const lostDefaultChargeAmount: number | null = product?.retailPrice != null
    ? convertUsdTo(product.retailPrice, lostChargeCurrency, exchangeRate, thbRate)
    : null;
  useEffect(() => {
    if (!lostChargeTouched && lostDefaultChargeAmount != null) {
      setLostChargeAmountInput(String(lostDefaultChargeAmount));
    }
  }, [lostDefaultChargeAmount, lostChargeTouched]);
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
        body: 'Your pick-up didn’t happen, so we released the items. Nothing to pay — message us to book again.',
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
      <View style={[d.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        {header}
        <View style={d.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={[d.root, { paddingTop: insets.top }]}>
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
  const depositReturned = reservation.depositReturned ?? false;
  const badge           = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  const isReturnOverdue = status === 'active' && reservation.returnAt.toMillis() < Date.now();

  // Once a handover checklist has been submitted, the deposit was actually received in
  // whatever currency the admin chose there — show that instead of the original LAK
  // figure. Before handover, no currency choice has been made yet, so show LAK as usual.
  const handoverDeposit = reservation.handoverChecklist;
  const depositDisplay = (handoverDeposit?.depositCurrency && handoverDeposit?.depositAmount != null)
    ? `${handoverDeposit.depositAmount.toLocaleString('en-US')} ${handoverDeposit.depositCurrency}`
    : fmtLak(reservation.deposit);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[d.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[d.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* ── Status + deposit chips ────────────────────────────────────── */}
        <View style={[d.statusRow, isReturnOverdue && { backgroundColor: '#FFF1F2', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }]}>
          {isReturnOverdue ? (() => {
            const sev = overdueSeverity(reservation.returnAt);
            const { bg, fg } = overdueChipColors(sev);
            return (
              <View style={[d.statusBadge, { backgroundColor: bg }]}>
                <Text style={[d.statusBadgeText, { color: fg }]}>{overdueLabel(reservation.returnAt)}</Text>
              </View>
            );
          })() : (
            <View style={[d.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[d.statusBadgeText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          )}
          {depositReturned ? (
            <View style={d.depositReturned}>
              <Feather name="check-circle" size={12} color="#065F46" />
              <Text style={d.depositReturnedText}>Deposit returned</Text>
            </View>
          ) : (
            <View style={d.depositPending}>
              <Text style={d.depositPendingText}>
                {status === 'returned' ? `Return deposit: ${depositDisplay}` : `Deposit: ${depositDisplay}`}
              </Text>
            </View>
          )}
        </View>

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

        {/* ── BOOKING INFO ──────────────────────────────────────────────── */}
        <View style={d.card}>
          <Text style={d.cardLabel}>Booking info</Text>
          <InfoRow label="Product"  value={reservation.productName} />
          <InfoRow
            label="Quantity"
            value={`${reservation.quantity} unit${reservation.quantity !== 1 ? 's' : ''}`}
          />
          <InfoRow
            label="Duration"
            value={`${reservation.durationDays} day${reservation.durationDays !== 1 ? 's' : ''} (24h)`}
          />
        </View>

        {/* ── DATES ─────────────────────────────────────────────────────── */}
        <View style={d.card}>
          <Text style={d.cardLabel}>Dates</Text>
          <InfoRow label="Pick-up" value={reservation.pickupLabel} />
          <InfoRow label="Return"  value={reservation.returnLabel} />
        </View>

        {/* ── RENTER ────────────────────────────────────────────────────── */}
        <View style={d.card}>
          <Text style={d.cardLabel}>Renter</Text>
          {/* Avatar + name */}
          <View style={d.renterAvatarRow}>
            <View style={d.renterAvatarCircle}>
              {renterPhotoURL ? (
                <ExpoImage
                  source={{ uri: renterPhotoURL }}
                  style={d.renterAvatarCircleImg}
                  contentFit="cover"
                />
              ) : (
                <Text style={d.renterAvatarInitial}>
                  {(renterDisplayName?.charAt(0) ?? '?').toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={d.renterAvatarName}>{renterDisplayName ?? '—'}</Text>
              <Text style={d.renterIdSmall} numberOfLines={1}>{reservation.renterId}</Text>
            </View>
          </View>

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
                <TouchableOpacity
                  style={d.editPhoneBtn}
                  onPress={handleEditPhone}
                  activeOpacity={0.8}
                >
                  <Feather name="edit-2" size={13} color={COLORS.fg3} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(phone || whatsapp) && (
            <View style={d.contactRow}>
              {phone && (
                <TouchableOpacity
                  style={d.contactBtn}
                  onPress={() => Linking.openURL(`tel:${phone}`)}
                  activeOpacity={0.75}
                >
                  <Feather name="phone" size={14} color={COLORS.carbon} />
                  <Text style={d.contactBtnText}>{phone}</Text>
                </TouchableOpacity>
              )}
              {whatsapp && (
                <TouchableOpacity
                  style={d.contactBtn}
                  onPress={() =>
                    Linking.openURL(`https://wa.me/${whatsapp.replace(/[^0-9+]/g, '')}`)
                  }
                  activeOpacity={0.75}
                >
                  <Feather name="message-circle" size={14} color={COLORS.carbon} />
                  <Text style={d.contactBtnText}>WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── PRICE BREAKDOWN ───────────────────────────────────────────── */}
        <View style={d.card}>
          <Text style={d.cardLabel}>Price breakdown</Text>
          <InfoRow label="Rate"     value={`${fmtLak(reservation.pricePerDay)} / day`} />
          <InfoRow label="Subtotal" value={fmtLak(reservation.subtotal)} />
          {reservation.couponApplied && (
            <InfoRow
              label="Coupon applied"
              value={`−${fmtLak(reservation.couponApplied.discountAmount)} (${reservation.couponApplied.percent}% off)`}
              muted
            />
          )}
          <View style={d.divider} />
          <InfoRow label="Total to pay"         value={fmtLak(reservation.total)}   bold />
          <InfoRow label="Deposit (refundable)"  value={depositDisplay} muted />
        </View>

        {/* ── SETTLEMENT SUMMARY ───────────────────────────────────────── */}
        {hasCharge && (
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
        )}

        {/* ── WAIVED CHARGES (internal) ─────────────────────────────────── */}
        {(reservation.lateChargeWaived || reservation.damageChargeWaived) && (() => {
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
            runAction(fields, fields);
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

        {/* ── SETTLEMENT RECEIPT ───────────────────────────────────────── */}
        {status === 'returned' && reservation.returnFinalizedAt && (
          <View style={{ marginBottom: 12 }}>
            <Text style={d.cardLabel}>Receipt</Text>
            <RentalReceipt rental={reservation} vatPercent={vatPercent} staffView />
          </View>
        )}

        {/* ── NOTES ─────────────────────────────────────────────────────── */}
        {!!reservation.notes && (
          <View style={d.card}>
            <Text style={d.cardLabel}>Notes</Text>
            <Text style={d.notesText}>{reservation.notes}</Text>
          </View>
        )}

        {/* ── META ──────────────────────────────────────────────────────── */}
        <View style={d.metaRow}>
          <Feather name="clock" size={12} color={COLORS.fg3} />
          <Text style={d.metaText}>Created: {fmtTimestamp(reservation.createdAt)}</Text>
        </View>

        {/* ── CHECKLISTS ────────────────────────────────────────────────── */}
        {(reservation.handoverChecklist?.confirmedAt || reservation.returnChecklist?.confirmedAt) && (
          <View style={d.card}>
            <Text style={d.cardLabel}>Checklists</Text>
            {reservation.handoverChecklist?.confirmedAt && (
              <TouchableOpacity
                style={d.checklistLinkRow}
                onPress={() => router.push(`/admin/reservations/${id}/checklist?type=handover&mode=view`)}
                activeOpacity={0.75}
              >
                <Feather name="clipboard" size={14} color={COLORS.carbon} />
                <Text style={d.checklistLinkText}>View handover checklist</Text>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
            {reservation.returnChecklist?.confirmedAt && (
              <TouchableOpacity
                style={d.checklistLinkRow}
                onPress={() => router.push(`/admin/reservations/${id}/checklist?type=return&mode=view`)}
                activeOpacity={0.75}
              >
                <Feather name="clipboard" size={14} color={COLORS.carbon} />
                <Text style={d.checklistLinkText}>View return checklist</Text>
                <Feather name="chevron-right" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── ACTIONS ────────────────────────────────────────────────────── */}
        <View style={d.actionsCard}>
          <Text style={d.cardLabel}>Actions</Text>

          {/* Error banner */}
          {actionError && (
            <View style={d.errorBanner}>
              <Feather name="alert-circle" size={14} color={COLORS.danger} />
              <Text style={d.errorBannerText}>{actionError}</Text>
            </View>
          )}

          {/* Loading spinner — while Firestore write is in flight */}
          {actioning && (
            <View style={d.actionLoading}>
              <ActivityIndicator color={COLORS.amber} />
            </View>
          )}

          {/* ── Confirm dialogs — only one open at a time ─────────────── */}
          {!actioning && confirmAction === 'confirm_payment' && (
            <ConfirmBox
              text="Confirm that payment has been received and activate this booking?"
              confirmLabel="Confirm payment"
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => runAction(
                { status: 'confirmed' },
                { status: 'confirmed' },
                () => sendNotif(reservation.renterId, {
                  type: 'rental',
                  icon: 'check',
                  iconColor: 'green',
                  title: 'Reservation confirmed',
                  body: `Your ${reservation.productName} booking for ${reservation.pickupLabel} is confirmed.`,
                  deepLink: `/rentals/${id}`,
                }),
              )}
            />
          )}
          {!actioning && confirmAction === 'pickup' && (
            <ConfirmBox
              text="Confirm the renter has picked up the item?"
              confirmLabel="Mark as picked up"
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => runAction(
                { status: 'active' },
                { status: 'active' },
                () => {
                  sendNotif(reservation.renterId, {
                    type: 'rental',
                    icon: 'box',
                    iconColor: 'carbon',
                    title: 'Rental started',
                    body: `You've picked up the ${reservation.productName}. Return by ${reservation.returnLabel}.`,
                    deepLink: `/rentals/${id}`,
                  });
                  // Mark phone as verified in-person at pickup (if not already).
                  if (!phoneVerified) {
                    updateDoc(doc(db, 'users', reservation.renterId), { phoneVerified: true })
                      .then(() => setRenterProfile(p => p ? { ...p, phoneVerified: true } : p))
                      .catch(err => console.warn('[AdminReservationDetail] phoneVerified update failed:', err));
                  }
                },
              )}
            />
          )}
          {!actioning && confirmAction === 'returned' && (
            <ConfirmBox
              text="Confirm the renter has returned the item?"
              confirmLabel="Mark as returned"
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => runAction(
                { status: 'returned', returnedAt: serverTimestamp(), stockReleasedAt: null },
                { status: 'returned' },
                () => {
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
                },
                // Defensive fallback path — a checklist wasn't the trigger here, so decide
                // the stock bucket from whatever chargeSeverity already sits on the doc (if
                // any), exactly like the checklist submit paths.
                batch => addStockAdjustmentToBatch(
                  batch,
                  reservation.productId,
                  reservation.chargeSeverity === 'unusable' ? 'lostUnits' : 'pendingSettlementUnits',
                  reservation.quantity,
                  reservation.chargeSeverity === 'unusable'
                    ? 'Return checklist rated item unusable'
                    : 'Returned — pending deposit settlement',
                  'Admin (fallback return action)',
                  id,
                ),
              )}
            />
          )}
          {!actioning && (confirmAction === 'deposit' || confirmAction === 'settle_outstanding' || confirmAction === 'write_off_outstanding') && (
            <SettlementActions
              reservation={reservation}
              confirmAction={confirmAction}
              setConfirmAction={setConfirmAction}
              actioning={actioning}
              setActioning={setActioning}
              setActionError={setActionError}
              onSettled={u => setReservation(prev => prev ? { ...prev, ...u } : prev)}
            />
          )}
          {!actioning && confirmAction === 'lost' && (
            <ConfirmBox
              text={
                lostChargeAmount != null
                  ? `Report this item lost/stolen? A charge of ${lostChargeAmount.toLocaleString('en-US')} ${lostChargeCurrency} (100% of replacement value)${lostLateChargeAmount != null ? `, plus a ${lostLateChargeAmount.toLocaleString('en-US')} ${lostChargeCurrency} late-return penalty already on this reservation,` : ''} will be recorded, and the reservation will be closed as lost.`
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
                  {
                    status: 'lost',
                    chargeAmount: lostChargeAmount,
                    chargeCurrency: lostChargeCurrency,
                    chargeReason: lostNotes.trim() ? `Reported lost/stolen — ${lostNotes.trim()}` : 'Reported lost/stolen',
                    chargeSeverity: 'lostStolen',
                    chargePercent: 100,
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
                  batch => addStockAdjustmentToBatch(
                    batch,
                    reservation.productId,
                    'lostUnits',
                    reservation.quantity,
                    lostNotes.trim() ? `Reported lost/stolen — ${lostNotes.trim()}` : 'Reported lost/stolen',
                    lostStaffName.trim(),
                    id,
                  ),
                );
              }}
              destructive
            >
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

          {/* ── Action buttons — shown only when no confirm is open ──── */}
          {!actioning && confirmAction === null && (
            <>
              {/* Linear status transitions */}
              {status === 'pending_payment' && (
                <TouchableOpacity
                  style={d.primaryBtn}
                  onPress={() => setConfirmAction('confirm_payment')}
                  activeOpacity={0.85}
                >
                  <Text style={d.primaryBtnText}>Confirm payment</Text>
                </TouchableOpacity>
              )}
              {status === 'confirmed' && (
                <TouchableOpacity
                  style={d.primaryBtn}
                  onPress={() => reservation.handoverChecklist?.confirmedAt
                    ? setConfirmAction('pickup')
                    : router.push(`/admin/reservations/${id}/checklist?type=handover`)}
                  activeOpacity={0.85}
                >
                  <Text style={d.primaryBtnText}>Mark as picked up</Text>
                </TouchableOpacity>
              )}
              {status === 'active' && (
                <TouchableOpacity
                  style={d.primaryBtn}
                  onPress={() => reservation.returnChecklist?.confirmedAt
                    ? setConfirmAction('returned')
                    : router.push(`/admin/reservations/${id}/checklist?type=return`)}
                  activeOpacity={0.85}
                >
                  <Text style={d.primaryBtnText}>Mark as returned</Text>
                </TouchableOpacity>
              )}

              {/* Report lost/stolen — only while the item is out with the renter */}
              {status === 'active' && (
                <TouchableOpacity
                  style={d.cancelLink}
                  onPress={() => setConfirmAction('lost')}
                  activeOpacity={0.7}
                >
                  <Text style={d.cancelLinkText}>Report lost/stolen</Text>
                </TouchableOpacity>
              )}

              {/* Settlement — deposit refund / outstanding-balance collect / write-off,
                  shared with the post-checklist return-confirmation screen so the two
                  entry points can never diverge. See components/SettlementActions.tsx. */}
              <SettlementActions
                reservation={reservation}
                confirmAction={confirmAction}
                setConfirmAction={setConfirmAction}
                actioning={actioning}
                setActioning={setActioning}
                setActionError={setActionError}
                onSettled={u => setReservation(prev => prev ? { ...prev, ...u } : prev)}
              />

              {/* No-show — only once the pick-up day is over (alert, never automatic) */}
              {(status === 'pending_payment' || status === 'confirmed') && isPickupMissed(reservation.pickupAt.toMillis()) && (
                <TouchableOpacity style={d.cancelLink} onPress={openNoShow} activeOpacity={0.7}>
                  <Text style={d.cancelLinkText}>Mark as no-show</Text>
                </TouchableOpacity>
              )}

              {/* Lift the renter's no-show hold */}
              {renterHold?.reasons.includes('noShow') && (
                <TouchableOpacity style={d.cancelLink} onPress={() => setConfirmAction('lift_hold')} activeOpacity={0.7}>
                  <Text style={[d.cancelLinkText, { color: COLORS.carbon }]}>Lift no-show hold</Text>
                </TouchableOpacity>
              )}

              {/* Cancel — only before pickup */}
              {(status === 'pending_payment' || status === 'confirmed') && (
                <TouchableOpacity
                  style={d.cancelLink}
                  onPress={openCancel}
                  activeOpacity={0.7}
                >
                  <Text style={d.cancelLinkText}>Cancel reservation</Text>
                </TouchableOpacity>
              )}

              {/* End states */}
              {status === 'no_show' && (
                <View style={d.endState}>
                  <Feather name="calendar" size={15} color={COLORS.fg3} />
                  <Text style={d.endStateText}>
                    {`No-show${reservation.noShowByName ? ` — marked by ${reservation.noShowByName}` : ''}${reservation.noShowHoldLiftedByName ? ` · hold lifted by ${reservation.noShowHoldLiftedByName}` : ''}`}
                  </Text>
                </View>
              )}
              {status === 'cancelled' && (
                <View style={d.endState}>
                  <Feather name="x-circle" size={15} color={COLORS.fg3} />
                  <Text style={d.endStateText}>This reservation has been cancelled.</Text>
                </View>
              )}
              {status === 'returned' && depositReturned && (
                <View style={d.endState}>
                  <Feather name="check-circle" size={15} color={COLORS.success} />
                  <Text style={d.endStateText}>All done — item returned and deposit settled.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
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
