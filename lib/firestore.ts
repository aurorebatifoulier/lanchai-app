import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  writeBatch,
  increment,
  limit,
  startAfter,
  type WriteBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import type { CancelReason } from '@/functions/src/shared/cancellation';
import { Product, ProductCategory } from './mockData';
import { isBeforePickupDay, vteDay } from '@/functions/src/shared/dates';
import { returnStockMoves, type ReturnStockInput } from '@/functions/src/shared/returnStock';

// Throws on Firestore error — callers must handle.
// Drafts and archived products are never shown or bookable for renters (the
// createReservations callable rejects them too). Admin screens query products directly.
export function isRenterVisible(p: { status?: string }): boolean {
  return p.status !== 'draft' && p.status !== 'archived';
}

// Renter-facing product list (Home, Explore/search, Liked, account counts).
export async function getProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Product))
    .filter(isRenterVisible);
}

// Throws on Firestore error — callers must handle.
export async function getProductsByCategory(category: ProductCategory): Promise<Product[]> {
  const q = query(collection(db, 'products'), where('category', '==', category));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Product))
    .filter(isRenterVisible);
}

// Returns null only when the product doesn't exist. Throws on Firestore error — callers must handle.
// Any product, whatever its status — admin screens, rental history, reviews.
export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Product;
}

// Renter-facing single product (detail, booking, bag, checkout): null for a draft or
// archived product, so an old link shows "This item isn't available".
export async function getRenterProduct(id: string): Promise<Product | null> {
  const p = await getProduct(id);
  return p && isRenterVisible(p) ? p : null;
}

export async function getFavorites(userId: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'favorites'));
    return snap.docs.map(d => d.id);
  } catch {
    return [];
  }
}

export async function addFavorite(userId: string, productId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId, 'favorites', productId), {
      createdAt: Timestamp.now(),
    });
  } catch {}
}

export async function removeFavorite(userId: string, productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', userId, 'favorites', productId));
  } catch {}
}

// ── Product stock condition ──────────────────────────────────────────────────
// inRepairUnits/lostUnits (see lib/mockData.ts's Product / lib/types.ts's ProductDoc)
// are the counts utils/availability.ts's effectiveStock() subtracts from stockLeft —
// the required source of truth for bookable stock everywhere. Every change to either
// count goes through here so it's always paired with an append-only audit doc at
// products/{id}/stockAdjustments — there is no path that increments/decrements the
// count fields directly without also logging why.
//
// adminName is free-text (matches this admin app's existing convention for
// "who did this" fields — outstandingSettledBy, outstandingWrittenOffBy, the staff-name
// inputs on the reservation lost/stolen action — none of which pair with a real Firebase
// Auth uid anywhere in this codebase), not a stricter identity check.
export type StockConditionField = 'inRepairUnits' | 'lostUnits' | 'pendingSettlementUnits';

// Adds a stock-condition adjustment to an EXISTING batch without committing it — lets a
// caller fold this into a larger atomic write. Used directly by
// adjustProductStockCondition below (its own single-purpose batch) and by the
// "Report lost/stolen" reservation action (app/admin/reservations/[id].tsx), which
// batches this alongside the reservation's own status/charge update so the two can
// never partially succeed — the actual gap this whole feature exists to close, since
// today reporting a reservation lost never touches the product at all.
export function addStockAdjustmentToBatch(
  batch: WriteBatch,
  productId: string,
  field: StockConditionField,
  delta: number,
  reason: string,
  adminName: string,
  reservationId?: string,
): void {
  batch.update(doc(db, 'products', productId), { [field]: increment(delta) });
  const adjustmentRef = doc(collection(db, 'products', productId, 'stockAdjustments'));
  batch.set(adjustmentRef, {
    field,
    delta,
    reason,
    ...(reservationId ? { reservationId } : {}),
    adminName,
    createdAt: serverTimestamp(),
  });
}

/**
 * Stock moves of a return (shared rule, functions/src/shared/returnStock.ts): unusable
 * units → lostUnits, every other unit → pendingSettlementUnits until releaseSettledStock.
 * Used by the single and chained return checklists and the "Mark as returned" fallback.
 */
export function addReturnStockToBatch(
  batch: WriteBatch,
  productId: string,
  r: ReturnStockInput,
  adminName: string,
  reservationId: string,
): void {
  const { lostUnits, pendingUnits } = returnStockMoves(r);
  if (lostUnits > 0) {
    addStockAdjustmentToBatch(batch, productId, 'lostUnits', lostUnits, 'Return checklist rated item unusable', adminName, reservationId);
  }
  if (pendingUnits > 0) {
    addStockAdjustmentToBatch(batch, productId, 'pendingSettlementUnits', pendingUnits, 'Returned — pending deposit settlement', adminName, reservationId);
  }
}

// Standalone adjustment with no linked reservation — e.g. the product-form manual
// stepper, or a warehouse audit finding a broken unit with no associated booking.
// Throws on Firestore error — caller must handle.
export async function adjustProductStockCondition(
  productId: string,
  field: StockConditionField,
  delta: number,
  reason: string,
  adminName: string,
): Promise<void> {
  const batch = writeBatch(db);
  addStockAdjustmentToBatch(batch, productId, field, delta, reason, adminName);
  await batch.commit();
}

// ── ReservationStatus ─────────────────────────────────────────────────────────
export type ReservationStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'active'
  | 'returned'
  | 'cancelled'
  | 'lost'
  // Admin-marked missed pick-up (never automatic). Terminal: releases occupancy like a
  // cancellation, and holds new bookings (syncBookingHold) until an admin lifts it.
  | 'no_show'; // reported lost/stolen — terminal, never returned

// ── Rental checklist (handover / return) ──────────────────────────────────────
export type ChecklistRating = 'good' | 'fair' | 'damaged' | 'unusable';

export const CHECKLIST_CATEGORIES = [
  { id: 'mainItem',       label: 'Main item condition' },
  { id: 'cleanliness',    label: 'Cleanliness' },
  { id: 'basicUsage',     label: 'Basic usage' },
  { id: 'power',          label: 'Power / activation' },
  { id: 'accessories',    label: 'Accessories' },
  { id: 'cables',         label: 'Cables / parts' },
  { id: 'protectiveCase', label: 'Protective case' },
  { id: 'storageCase',    label: 'Storage case' },
  { id: 'other',          label: 'Other components' },
] as const;
export type ChecklistCategoryId = typeof CHECKLIST_CATEGORIES[number]['id'];

export interface ChecklistData {
  categories: Record<ChecklistCategoryId, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  confirmedByName: string;
  confirmedAt: Timestamp;
  clientConfirmedByName: string;
  clientConfirmed: boolean;
  depositCurrency: 'LAK' | 'USD' | 'THB';
  depositAmount: number; // frozen at submit time — never recalculated later
}

// ── RentalDoc — shape of a document in the `reservations` collection ─────────
export interface RentalDoc {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  renterId: string;
  renterName: string | null;
  pickupAt: Timestamp;
  returnAt: Timestamp;
  pickupLabel: string;
  returnLabel: string;
  durationDays: number;
  quantity: number;
  pricePerDay: number;
  subtotal: number;
  total: number;    // rental fee only — does NOT include deposit (deposit is tracked separately)
  deposit: number;   // line total = depositPerUnit × quantity (createReservations)
  /** Unit deposit (LAK), frozen by createReservations. Absent on older reservations. */
  depositPerUnit?: number;
  /** Rental agreement signed at pick-up (finalizeRentalAgreement — server-written). */
  agreementId?: string;
  agreementSignedAt?: Timestamp;
  agreementMethod?: 'signature' | 'paper';
  depositReturned?: boolean;
  returnedAt?: Timestamp;
  // Late-return escalation — all written by the lateReturnAlerts Cloud Function only.
  lateAlert0h?: boolean;
  lateAlert1h?: boolean;
  lateAlertGrace?: boolean;
  lateAlert24h?: boolean;
  lateAlert48h?: boolean;
  lateAlert72h?: boolean;
  // Suggested penalty (LAK) / rental days, recalculated by the function at each tier via
  // functions/src/shared/latePenalty.ts. 0 within the internal grace period — renter
  // screens must only render it when > 0. Never deducted automatically.
  latePenaltyAmount?: number;
  latePenaltyDays?: number;
  // Set once the return is > 72h late: flag only — status stays 'active', no automatic
  // lost/stolen or deduction. Admin decides (normal return, or "Report lost/stolen").
  nonReturnAt?: Timestamp;
  // Internal: handed over before the planned pick-up day (staff confirmed it) + that plan.
  earlyHandover?: boolean;
  earlyHandoverPlannedAt?: Timestamp;
  currency: string;
  notes: string;
  status: ReservationStatus;
  orderId?: string;  // set during multi-item checkout (Step 3); absent on single-item bookings until migrated
  createdAt: Timestamp;
  handoverChecklist?: ChecklistData;
  returnChecklist?: ChecklistData;
  couponApplied?: { id: string; percent: number; discountAmount: number };
  // Set by the restoreCancelledCoupon Cloud Function once the coupon was given back.
  couponRestored?: boolean;

  // ── Cancellation ──────────────────────────────────────────────────────────
  cancelledAt?: Timestamp;
  cancelledBy?: 'renter' | 'admin' | 'admin_release';
  cancelReason?: CancelReason;        // admin cancellations only (functions/src/shared/cancellation.ts)
  cancelReasonText?: string;          // optional free text from the admin
  // Optional advance paid before pick-up — never written today (payment happens at
  // pick-up). If it ever exists, cancellationOutcome() applies the policy tiers.
  advancePaidLak?: number;
  // Set by applyReviewReward once this reservation's review earned its points.
  reviewRewardApplied?: boolean;

  // ── No-show (admin-marked only) ───────────────────────────────────────────
  noShowAt?: Timestamp;
  noShowBy?: string;                  // admin uid
  noShowByName?: string;
  // Lifting the booking hold keeps status 'no_show' (history) — only these are set.
  noShowHoldLiftedAt?: Timestamp;
  noShowHoldLiftedBy?: string;        // admin uid
  noShowHoldLiftedByName?: string;
  // Idempotency marker of the missedPickupAlerts Cloud Function (admin notification).
  missedPickupAlertAt?: Timestamp;

  // ── Damage/loss charge — set by the return checklist (damaged/unusable) or the
  // "Report lost/stolen" admin action. Absent = no charge was ever computed. ──────
  chargeAmount?: number;              // frozen, in chargeCurrency
  chargeCurrency?: 'LAK' | 'USD' | 'THB';
  chargeReason?: string;              // e.g. "Main item condition — Damaged", "Reported lost/stolen"
  chargeSeverity?: 'damaged' | 'unusable' | 'lostStolen';
  chargePercent?: number;             // % actually applied, post staff-override — audit trail
  /** Units the damage / unusable / lost charge is about (staff choice, 1..quantity).
   *  Absent on older reservations = the whole quantity (shared/returnStock.ts). */
  chargeUnits?: number;
  // Late-return penalty — fully independent of the damage/condition charge above (two
  // separate causes, two separate fields, never merged). Shares chargeCurrency. Frozen
  // from the indicative, Cloud-Function-owned latePenaltyAmount (always LAK) once staff
  // confirms/overrides it on the return checklist (or, read-only, on lost/stolen reports).
  lateChargeAmount?: number;          // frozen, in chargeCurrency
  lateChargeReason?: string;          // e.g. "Returned 6h late"
  // ── Waivers — staff explicitly waived a suggested charge (return checklist "Waive",
  // undone from the admin detail until returnFinalizedAt). The amount field stays
  // absent; renters see "… · waived by our team" (buildReceiptSummary), never the
  // staff name. *WaivedAmount = the suggestion, in chargeCurrency, for reference/undo.
  // Identity (functions/src/identity.ts): "I'll show my ID at the shop", and the first
  // pick-up double check still pending for this renter (server-kept in sync).
  idCheckAtCounter?: boolean;
  firstRentalIdCheck?: boolean;
  lateChargeWaived?: boolean;
  lateChargeWaivedAmount?: number;
  lateChargeWaivedReason?: string;    // e.g. "Returned 6h late" — restored on undo
  lateChargeWaivedBy?: string;        // internal only
  lateChargeWaivedAt?: Timestamp;
  damageChargeWaived?: boolean;
  damageChargeWaivedAmount?: number;
  damageChargeWaivedReason?: string;  // e.g. "Main item condition — Damaged"
  damageChargeWaivedPercent?: number;
  damageChargeWaivedBy?: string;      // internal only
  damageChargeWaivedAt?: Timestamp;
  // Combined across BOTH charge sources vs. the deposit held — the only point where
  // damage charge and late penalty are summed; both stay separate fields above this.
  depositAppliedToCharge?: number;    // min(chargeAmount + lateChargeAmount, depositHeld), same currency
  outstandingBalance?: number;        // max(0, (chargeAmount + lateChargeAmount) - depositHeld)
  outstandingSettled?: boolean;
  outstandingSettledAt?: Timestamp;
  outstandingSettledBy?: string;      // free-text staff name
  // Second, parallel resolution path for outstandingBalance — used when the balance is
  // confirmed uncollectible (e.g. renter unreachable after a lost/stolen report) rather
  // than actually collected. Mutually exclusive with outstandingSettled in practice (the
  // admin UI only offers one at a time), but not enforced at the data level.
  outstandingWrittenOff?: boolean;
  outstandingWrittenOffAt?: Timestamp;
  outstandingWrittenOffBy?: string;   // free-text staff name
  outstandingWrittenOffNotes?: string;

  // ── Return closeout — deposit settlement gates stock release ────────────────
  // returnFinalizedAt is the single canonical "financial side of this return is
  // closed" signal, written by whichever of the 3 closing actions actually fires
  // (deposit returned in full, outstanding balance settled, or outstanding balance
  // written off) — never derive "is this closed?" from any one of those fields
  // alone, since any single one can legitimately never apply to a given reservation.
  // This is what the releaseSettledStock Cloud Function (functions/src/index.ts)
  // watches, alongside the 12h HANDOFF_BUFFER_MS since returnAt, before it decrements
  // the product's pendingSettlementUnits (see lib/types.ts). Never set client-side to
  // anything other than serverTimestamp() — see CLAUDE.md's Timestamp.now() gotcha.
  returnFinalizedAt?: Timestamp;
  depositReturnedBy?: string;         // free-text staff name, set when depositReturned is confirmed
  // Admin's choice, at settlement, for a damaged-but-returnable item — only meaningful
  // when chargeSeverity === 'damaged'. Absent/undefined for a clean return means
  // 'release'. Read by releaseSettledStock to decide whether to release the unit back
  // to available stock or transfer it into inRepairUnits instead.
  stockReleaseHandling?: 'release' | 'repair';
  // Idempotency marker for releaseSettledStock — null once the return checklist is
  // submitted (so the cron's query can find it), set to serverTimestamp() once that
  // cron has actually processed the stock adjustment, so it's never double-applied.
  stockReleasedAt?: Timestamp | null;
}

// Returns all reservations sharing an orderId — used by the confirmation screen to load
// per-item QR data. Single-item bookings also carry an orderId field. No composite index needed.
export async function getReservationsByOrderId(orderId: string): Promise<RentalDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'reservations'), where('orderId', '==', orderId)),
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RentalDoc));
}

// Throws on Firestore error — caller must handle. Sorted client-side (no composite index needed).
export async function getMyReservations(uid: string): Promise<RentalDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'reservations'), where('renterId', '==', uid)),
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RentalDoc));
}

// Returns null only when reservation doesn't exist. Throws on Firestore error — caller must handle.
export async function getReservationById(id: string): Promise<RentalDoc | null> {
  const snap = await getDoc(doc(db, 'reservations', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RentalDoc;
}

// ── New reservations — server-side only ─────────────────────────────────────
// Renters can't write reservations (firestore.rules: create is admin-only). Every
// booking goes through the createReservations callable (functions/src/reservations.ts),
// which recomputes all figures from server data with the same shared rules the app
// uses for previews, checks stock inside a transaction, and consumes the coupon.
export interface BookingItemInput {
  productId: string;
  pickupAt: Date;
  returnAt: Date;
  quantity: number;
}

export type BookingErrorCode =
  | 'unauthenticated' | 'invalid-request' | 'phone-required' | 'account-pending' | 'account-on-hold'
  | 'product-unavailable' | 'access-restricted' | 'invalid-slot' | 'too-soon' | 'invalid-dates'
  | 'unpriced' | 'slot-unavailable' | 'coupon-invalid' | 'pricing-not-configured' | 'internal'
  | 'id-required' | 'id-rejected';

const BOOKING_ERROR_MESSAGES: Record<BookingErrorCode, string> = {
  'unauthenticated':        'Please sign in to book.',
  'invalid-request':        'Something is wrong with this booking. Please check it and try again.',
  'phone-required':         'A phone number is required to book. Go to Account → Personal info to add one.',
  'account-pending':        'Your business account is still being reviewed — you can book once it’s approved.',
  'account-on-hold':        'New bookings are paused for your account — see the message above.',
  'product-unavailable':    'This item is no longer available. Please remove it and try again.',
  'access-restricted':      'This item is reserved for higher-tier members.',
  'invalid-slot':           'This time is outside our opening hours. Please pick another slot.',
  'too-soon':               'This pick-up time is too soon now — please choose a later slot.',
  'invalid-dates':          'The return must be after the pick-up. Please check your dates.',
  'unpriced':               'This item doesn’t have a price yet. Please try another item.',
  'slot-unavailable':       'Sorry — someone just booked this item for these dates. Please choose other dates.',
  'coupon-invalid':         'This coupon can’t be used anymore. Remove it and try again.',
  'pricing-not-configured': 'Booking is temporarily unavailable. Please try again later.',
  'internal':               'Could not confirm your booking. Please try again.',
  'id-required':            'An ID document is required to book — add it now, or choose to show it at the shop.',
  'id-rejected':            'Your ID document was declined — please add a new one to book.',
};

/** Thrown by createBooking — `message` is ready to show to the renter. */
export class BookingError extends Error {
  constructor(public code: BookingErrorCode, message: string) {
    super(message);
    this.name = 'BookingError';
  }
}

// Throws BookingError (friendly message) on any failure — callers just display it.
export async function createBooking(input: {
  items: BookingItemInput[];
  couponId?: string | null;
  notes?: string;
  /** "I'll show my ID at the shop" (no ID document on file yet). */
  idCheckAtCounter?: boolean;
}): Promise<{ orderId: string; reservationIds: string[] }> {
  const call = httpsCallable<unknown, { orderId: string; reservationIds: string[] }>(functions, 'createReservations');
  try {
    const res = await call({
      items: input.items.map(i => ({
        productId: i.productId,
        pickupAtMs: i.pickupAt.getTime(),
        returnAtMs: i.returnAt.getTime(),
        quantity: i.quantity,
      })),
      couponId: input.couponId ?? null,
      notes: input.notes ?? '',
      idCheckAtCounter: input.idCheckAtCounter === true,
    });
    return res.data;
  } catch (err: any) {
    const code = (err?.details?.code ?? 'internal') as BookingErrorCode;
    throw new BookingError(code, BOOKING_ERROR_MESSAGES[code] ?? BOOKING_ERROR_MESSAGES.internal);
  }
}

// ── Renter-initiated cancellation ────────────────────────────────────────────

// Cancels a single reservation. Throws on Firestore error — caller must handle.
export async function cancelReservation(id: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', id), {
    status:      'cancelled',
    cancelledAt: serverTimestamp(),
    cancelledBy: 'renter',
  });
}

// Cancels multiple reservations in one batch. Pass only IDs already verified as
// pending_payment or confirmed — Firestore rules enforce this server-side too.
// Throws on Firestore error — caller must handle.
export async function cancelReservations(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (ids.length === 1) { await cancelReservation(ids[0]); return; }
  const batch = writeBatch(db);
  ids.forEach(id =>
    batch.update(doc(db, 'reservations', id), {
      status:      'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: 'renter',
    }),
  );
  await batch.commit();
}

// ── Admin bulk actions ────────────────────────────────────────────────────────

// Marks one or several lines (e.g. a whole order) as no-show in ONE batch — same
// noShowAt, so the "We missed you" email trigger sends one grouped email. Only for
// pending_payment/confirmed reservations whose pick-up day is over (isPickupMissed).
// Final: a mistaken no-show is handled by lifting the hold, not by reverting it.
// Throws on Firestore error — caller must handle.
export async function adminMarkNoShow(ids: string[], adminUid: string, adminName: string): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, 'reservations', id), {
      status:       'no_show',
      noShowAt:     serverTimestamp(),
      noShowBy:     adminUid,
      noShowByName: adminName,
      updatedAt:    serverTimestamp(),
    });
  }
  await batch.commit();
}

// Lifts the no-show booking hold for a renter: stamps every not-yet-lifted no_show
// reservation of that renter (they stay no_show in the history). syncBookingHold then
// recomputes bookingHolds/{renterId}. Equality-only query → no composite index.
// Throws on Firestore error — caller must handle.
export async function adminLiftNoShowHold(renterId: string, adminUid: string, adminName: string): Promise<number> {
  const snap = await getDocs(query(
    collection(db, 'reservations'),
    where('renterId', '==', renterId),
    where('status', '==', 'no_show'),
  ));
  const open = snap.docs.filter(d => !d.get('noShowHoldLiftedAt'));
  if (open.length === 0) return 0;
  const batch = writeBatch(db);
  for (const d of open) {
    batch.update(d.ref, {
      noShowHoldLiftedAt:     serverTimestamp(),
      noShowHoldLiftedBy:     adminUid,
      noShowHoldLiftedByName: adminName,
      updatedAt:              serverTimestamp(),
    });
  }
  await batch.commit();
  return open.length;
}

// Admin cancellation of one or several lines (e.g. a whole order) in ONE batch: the
// shared serverTimestamp gives every line the same cancelledAt, which is how the
// cancellation email trigger groups them into a single email. Pass only
// pending_payment/confirmed reservations (ADMIN_CANCELLABLE_STATUSES).
// Throws on Firestore error — caller must handle.
export async function adminCancelReservations(
  ids: string[],
  reason: CancelReason,
  reasonText: string,
): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, 'reservations', id), {
      status:           'cancelled',
      cancelledAt:      serverTimestamp(),
      cancelledBy:      'admin',
      cancelReason:     reason,
      cancelReasonText: reasonText.trim(),
      updatedAt:        serverTimestamp(),
    });
  }
  await batch.commit();
}

// Force-clears a reservation that's stuck showing as blocked (early return, a
// cancellation that didn't go through the normal flow, or similar data drift) — a
// data-correction action, not a fresh cancellation event. A single, non-batched write
// on the reservation itself; functions/src/index.ts's syncReservationOccupancy then
// deletes the reservationOccupancy mirror automatically, since 'cancelled' is already
// one of its terminal-status delete triggers — no direct write to reservationOccupancy
// is attempted (its rule denies all client writes unconditionally, admin included).
// This does NOT resolve any deposit/charge — the caller's UI must make that clear.
// Throws on Firestore error — caller must handle.
export async function releaseReservation(id: string, adminName: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', id), {
    status:      'cancelled',
    cancelledAt: serverTimestamp(),
    cancelledBy: 'admin_release',
    releasedBy:  adminName,
    releasedAt:  serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });
}

// Confirms payment for multiple reservations sharing an order in one batch — used by
// the admin grouped bulk action. Throws on Firestore error — caller must handle.
export async function confirmReservationsPayment(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach(id =>
    batch.update(doc(db, 'reservations', id), {
      status:    'confirmed',
      updatedAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

// Writes each item's handover/return checklist and flips its status, all in one atomic
// batch — used by the consolidated summary screen at the end of a chained multi-item
// checklist flow, so every item transitions together or none do. Throws on Firestore
// error — caller must handle.
export interface ChecklistBatchChargeFields {
  // Damage/condition charge — present only when the worst rating was damaged/unusable.
  chargeAmount?: number;
  chargeReason?: string;
  chargeSeverity?: 'damaged' | 'unusable';
  chargePercent?: number;
  chargeUnits?: number;
  // Late-return penalty — present only when the reservation had a late penalty. Fully
  // independent of the damage fields above; either, neither, or both may be set.
  lateChargeAmount?: number;
  lateChargeReason?: string;
  // Explicit staff waivers (see RentalDoc). *WaivedAt is stamped by submitChecklistBatch.
  lateChargeWaived?: boolean;
  lateChargeWaivedAmount?: number;
  lateChargeWaivedReason?: string;
  lateChargeWaivedBy?: string;
  damageChargeWaived?: boolean;
  damageChargeWaivedAmount?: number;
  damageChargeWaivedReason?: string;
  damageChargeWaivedPercent?: number;
  damageChargeWaivedBy?: string;
  // Always present whenever this object is passed at all — combined across both sources.
  chargeCurrency: 'LAK' | 'USD' | 'THB';
  depositAppliedToCharge: number;
  outstandingBalance: number;
}

/**
 * Internal marker for a handover done before the planned pick-up day (staff confirmed
 * "Hand over early anyway?"): earlyHandover + the planned pick-up time. Never shown to
 * renters. Empty when the handover happens on / after the pick-up day.
 */
export function earlyHandoverFields(pickupAt: Timestamp | null | undefined): Record<string, unknown> {
  if (!pickupAt || !isBeforePickupDay(pickupAt.toMillis())) return {};
  return { earlyHandover: true, earlyHandoverPlannedAt: pickupAt };
}

/** Staff-facing inline warning before an early handover (detail + bulk list). */
export function earlyHandoverPrompt(pickupAtMs: number): string {
  return `This pick-up is planned for ${vteDay(pickupAtMs)}. Hand over early anyway?`;
}

export async function submitChecklistBatch(
  items: Array<{
    id: string;
    type: 'handover' | 'return';
    checklistData: ChecklistData;
    charge?: ChecklistBatchChargeFields;
    productId: string;
    quantity: number;
    adminName: string;
    /** Planned pick-up — handover only, to record an early handover. */
    pickupAt?: Timestamp | null;
  }>,
): Promise<void> {
  if (items.length === 0) return;
  const batch = writeBatch(db);
  items.forEach(({ id, type, checklistData, charge, productId, quantity, adminName, pickupAt }) => {
    const isHandover = type === 'handover';
    batch.update(doc(db, 'reservations', id), {
      [isHandover ? 'handoverChecklist' : 'returnChecklist']: checklistData,
      status: isHandover ? 'active' : 'returned',
      ...(isHandover ? earlyHandoverFields(pickupAt) : { returnedAt: serverTimestamp(), stockReleasedAt: null }),
      // Optional fields may be undefined (e.g. no suggested amount) — Firestore rejects those.
      ...Object.fromEntries(Object.entries(charge ?? {}).filter(([, v]) => v !== undefined)),
      ...(charge?.lateChargeWaived ? { lateChargeWaivedAt: serverTimestamp() } : {}),
      ...(charge?.damageChargeWaived ? { damageChargeWaivedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    });
    // Excluded from available stock the instant it's marked returned — released only by
    // releaseSettledStock, once the deposit/charges are closed out AND the 12h handoff
    // buffer has elapsed. A checklist-rated 'unusable' item is a true write-off, so it
    // goes straight to lostUnits instead, mirroring "Report lost/stolen".
    if (!isHandover) {
      addReturnStockToBatch(batch, productId, { quantity, chargeSeverity: charge?.chargeSeverity, chargeUnits: charge?.chargeUnits }, adminName, id);
    }
  });
  await batch.commit();
}

// ── User profile ─────────────────────────────────────────────────────────────

export interface UserAddress {
  id: string;
  label: string;
  line1: string;
  city: string;
  note: string;
}

// ── Loyalty ───────────────────────────────────────────────────────────────────
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyCoupon {
  id: string;
  tier: 'silver' | 'gold' | 'platinum';
  percent: number;
  issuedAt: Timestamp;
  used: boolean;
  usedAt?: Timestamp;
  usedOnReservationId?: string;
}

export interface UserProfile {
  displayName?: string;
  photoURL?: string | null;
  firstName?: string;
  lastName?: string;
  // phoneNumber: mandatory E.164 identity phone, set at sign-up and verified in-person at pickup
  phoneNumber?: string;
  phoneVerified?: boolean;
  // phone/whatsapp: contact details, editable in personal-info (kept in sync with phoneNumber)
  phone?: string;
  whatsapp?: string;
  whatsappSameAsPhone?: boolean;
  // address: the single free-text field editable in personal-info. Unrelated to
  // addresses/UserAddress below, a separate multi-entry labeled-address-book model
  // that was stubbed in but never wired to any UI — don't conflate the two.
  address?: string;
  // true = no pickup/return reminder emails (functions/src/email). Essential emails ignore it.
  emailRemindersOptOut?: boolean;
  /** News & offers email consent (app/profile/notifications.tsx) — not synced to Brevo yet. */
  marketingOptIn?: boolean;
  /** Server-written (submitIdentityDocument / retention): an ID document is on file. */
  idOnFile?: boolean;
  idDocVersion?: number;
  /** Server-written by recordIdCheck: the document version checked in person. Once set,
   *  the renter can't change their name (firestore.rules) — staff can. */
  idCheckedVersion?: number;
  /** Referral programme (server-written, functions/src/referral.ts). */
  inviteCode?: string;
  referredBy?: { uid: string; code: string };
  referralCount?: number;
  celebratedTier?: 'silver' | 'gold' | 'platinum';
  marketingOptInAt?: Timestamp;
  marketingOptOutAt?: Timestamp;
  addresses?: UserAddress[];
  customerType?: 'tourist' | 'resident' | 'business';
  // loyaltyPoints/loyaltyTier are server-computed only (see functions/src/index.ts
  // applyLoyaltyPoints) — never written by the client. Enforced in firestore.rules.
  loyaltyPoints?: number;
  loyaltyTier?: LoyaltyTier;
  firstRentalDate?: Timestamp;
  coupons?: LoyaltyCoupon[];

  // ── BtoB (business account) — absent/undefined means an existing/BtoC user, never
  // gated. btobStatus is only meaningful when accountType === 'btob'. Approval also
  // sets customerType: 'business' above, which is what the existing deposit-waiver
  // and (new) HT/VAT display logic actually key off — accountType/btobStatus exist
  // purely for the pending/rejected gate and the admin review screen. ──────────────
  accountType?: 'btoc' | 'btob';
  btobStatus?: 'pending_approval' | 'approved' | 'rejected';
  btobCompanyName?: string;
  btobLicenseNumber?: string;
  btobResponsibleName?: string;
  btobDocumentUrl?: string;
  btobSubmittedAt?: Timestamp;
  btobRejectionReason?: string;      // preset key (functions/src/shared/btob.ts)
  btobRejectionText?: string;
  btobRejectionFixable?: boolean;
  btobReviewedAt?: Timestamp;
  btobReviewedBy?: string;

  updatedAt?: Timestamp;
}

// Returns null only when no profile exists yet. Throws on Firestore error — caller must handle.
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

// Throws on Firestore error — caller must catch so the UI knows the save failed.
/** News & offers consent, with the server time of the opt-in / opt-out (rules require request.time). */
export async function setMarketingOptIn(uid: string, optIn: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    marketingOptIn: optIn,
    [optIn ? 'marketingOptInAt' : 'marketingOptOutAt']: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function submitRequest(text: string, contact: string): Promise<void> {
  try {
    await addDoc(collection(db, 'requests'), {
      text,
      contact: contact || null,
      createdAt: Timestamp.now(),
    });
  } catch {}
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface ReviewDoc {
  userId: string;
  reviewerName: string;
  rating: number;
  text: string;
  productId: string;
  reservationId: string;
  productName: string;
  createdAt: Timestamp;
  adminReply?: {
    text: string;
    repliedAt: Timestamp;
  };
}

// Returns null only when no review exists for this reservation. Throws on Firestore error.
export async function getReview(productId: string, reservationId: string): Promise<ReviewDoc | null> {
  const snap = await getDoc(doc(db, 'reviews', productId, 'reviews', reservationId));
  if (!snap.exists()) return null;
  return snap.data() as ReviewDoc;
}

// Returns reviews sorted newest-first. Throws on Firestore error — callers must handle.
export async function getProductReviews(productId: string): Promise<ReviewDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'reviews', productId, 'reviews'), orderBy('createdAt', 'desc')),
  );
  return snap.docs.map(d => d.data() as ReviewDoc);
}

/** Latest reviews of a product, one page at a time (single orderBy — no index). */
export async function getProductReviewsPage(
  productId: string,
  pageSize: number,
  after?: QueryDocumentSnapshot | null,
): Promise<{ reviews: ReviewDoc[]; last: QueryDocumentSnapshot | null }> {
  const base = query(collection(db, 'reviews', productId, 'reviews'), orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(after ? query(base, startAfter(after)) : base);
  return { reviews: snap.docs.map(d => d.data() as ReviewDoc), last: snap.docs[snap.docs.length - 1] ?? null };
}

// Writes a review (reservationId as doc ID → one review per rental). The product's
// averageRating/reviewCount are recomputed server-side by the syncProductRating Cloud
// Function (renters can't write products); the review reward is applyReviewReward.
// firestore.rules validate the shape: integer rating 1–5, text 10–2000 chars.
// Throws on Firestore error — caller must catch and surface to the user.
export async function submitReview(params: {
  productId: string;
  reservationId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  text: string;
  productName: string;
}): Promise<void> {
  const { productId, reservationId, userId, reviewerName, rating, text, productName } = params;

  await setDoc(doc(db, 'reviews', productId, 'reviews', reservationId), {
    userId,
    reviewerName,
    rating,
    text,
    productId,
    reservationId,
    productName,
    createdAt: serverTimestamp(),
  });
}

export async function updateReviewReply(
  productId: string,
  reservationId: string,
  replyText: string,
): Promise<void> {
  await updateDoc(doc(db, 'reviews', productId, 'reviews', reservationId), {
    adminReply: { text: replyText, repliedAt: serverTimestamp() },
  });
}

// ── Admin tasks ───────────────────────────────────────────────────────────────

export interface AdminTask {
  id: string;
  title: string;
  note?: string;
  date: Timestamp;
  completed: boolean;
  createdAt: Timestamp;
  createdBy: string;
}

export async function addAdminTask(params: {
  title: string;
  note?: string;
  date: Timestamp;
  completed: boolean;
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'adminTasks'), {
    ...params,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAdminTask(id: string, patch: Partial<Pick<AdminTask, 'title' | 'note' | 'completed'>>): Promise<void> {
  await updateDoc(doc(db, 'adminTasks', id), patch);
}

export async function deleteAdminTask(id: string): Promise<void> {
  await deleteDoc(doc(db, 'adminTasks', id));
}
