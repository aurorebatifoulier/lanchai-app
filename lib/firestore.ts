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
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getBookingHold, BookingHoldError } from './bookingHold';
import { Product, ProductCategory } from './mockData';

// Throws on Firestore error — callers must handle.
export async function getProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Product))
    .filter((p: any) => p.status !== 'archived');
}

// Throws on Firestore error — callers must handle.
export async function getProductsByCategory(category: ProductCategory): Promise<Product[]> {
  const q = query(collection(db, 'products'), where('category', '==', category));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Product))
    .filter((p: any) => p.status !== 'archived');
}

// Returns null only when the product doesn't exist. Throws on Firestore error — callers must handle.
export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Product;
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
  | 'lost'; // reported lost/stolen — terminal, never returned

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
  deposit: number;
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
  currency: string;
  notes: string;
  status: ReservationStatus;
  orderId?: string;  // set during multi-item checkout (Step 3); absent on single-item bookings until migrated
  createdAt: Timestamp;
  handoverChecklist?: ChecklistData;
  returnChecklist?: ChecklistData;
  couponApplied?: { id: string; percent: number; discountAmount: number };

  // ── Damage/loss charge — set by the return checklist (damaged/unusable) or the
  // "Report lost/stolen" admin action. Absent = no charge was ever computed. ──────
  chargeAmount?: number;              // frozen, in chargeCurrency
  chargeCurrency?: 'LAK' | 'USD' | 'THB';
  chargeReason?: string;              // e.g. "Main item condition — Damaged", "Reported lost/stolen"
  chargeSeverity?: 'damaged' | 'unusable' | 'lostStolen';
  chargePercent?: number;             // % actually applied, post staff-override — audit trail
  // Late-return penalty — fully independent of the damage/condition charge above (two
  // separate causes, two separate fields, never merged). Shares chargeCurrency. Frozen
  // from the indicative, Cloud-Function-owned latePenaltyAmount (always LAK) once staff
  // confirms/overrides it on the return checklist (or, read-only, on lost/stolen reports).
  lateChargeAmount?: number;          // frozen, in chargeCurrency
  lateChargeReason?: string;          // e.g. "Returned 6h late"
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

// ── New reservation write ──────────────────────────────────────────────────
export interface NewReservationData {
  productId: string;
  productName: string;
  productImage: string | null;
  renterId: string;
  renterName: string | null;
  pickupAt: Date;
  returnAt: Date;
  pickupLabel: string;
  returnLabel: string;
  durationDays: number;
  quantity: number;
  pricePerDay: number;
  subtotal: number;
  total: number;
  deposit: number;
  currency: 'LAK';
  notes: string;
  status: 'pending_payment';
  orderId: string;
  couponApplied?: { id: string; percent: number; discountAmount: number };
}

// Throws on Firestore error — caller must catch so the booking flow doesn't proceed on failure.
export async function addReservation(data: NewReservationData): Promise<string> {
  if (!data.pricePerDay || data.pricePerDay <= 0 || !data.subtotal || data.subtotal <= 0) {
    throw new Error('Reservation rejected: pricePerDay or subtotal is 0 or unset.');
  }
  // Client-side mirror of the firestore.rules bookingHolds check (the real enforcement) —
  // here only to surface a clear BookingHoldError instead of a raw permission-denied.
  if (await getBookingHold(data.renterId)) throw new BookingHoldError();
  const { pickupAt, returnAt, ...rest } = data;
  const id = `${data.orderId}_1`;
  await setDoc(doc(db, 'reservations', id), {
    ...rest,
    pickupAt: Timestamp.fromDate(pickupAt),
    returnAt: Timestamp.fromDate(returnAt),
    createdAt: serverTimestamp(),
  });
  return id;
}

// Human-readable order-ID alphabet — excludes 0/O/1/I/L to avoid misreads off a screen.
const ORDER_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function randomOrderCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ORDER_CODE_CHARS[Math.floor(Math.random() * ORDER_CODE_CHARS.length)];
  return out;
}
function todayStamp(): string {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
const MAX_ORDER_ID_ATTEMPTS = 5;

// Generates a new, verified-unique, human-readable order ID (e.g. "LNC-260731-A3F2") —
// this becomes both the `orderId` field AND the prefix of every reservation doc ID it
// creates (`{orderId}_1`, `{orderId}_2`, ...), so sibling items in an order sort
// adjacently in the Firebase console instead of scattering under random auto-IDs.
// Checking only the `_1` suffix for existence is enough: every doc in an order is
// created together from the same orderId, so a real collision would hit `_1` too.
// Throws on Firestore error, or if it can't find a free code after MAX_ORDER_ID_ATTEMPTS.
export async function newOrderId(): Promise<string> {
  const stamp = todayStamp();
  for (let attempt = 0; attempt < MAX_ORDER_ID_ATTEMPTS; attempt++) {
    const candidate = `LNC-${stamp}-${randomOrderCode()}`;
    const probe = await getDoc(doc(db, 'reservations', `${candidate}_1`));
    if (!probe.exists()) return candidate;
  }
  throw new Error('Could not generate a unique order ID — please try again.');
}

// Atomically writes multiple reservations sharing one orderId.
// Throws on Firestore error — caller must catch.
export async function addReservationBatch(
  items: Array<Omit<NewReservationData, 'orderId'>>,
  orderId: string,
): Promise<void> {
  for (const item of items) {
    if (!item.pricePerDay || item.pricePerDay <= 0 || !item.subtotal || item.subtotal <= 0) {
      throw new Error(`Reservation rejected: item "${item.productName}" has pricePerDay or subtotal of 0.`);
    }
  }
  // Same client-side mirror of the rules' bookingHolds check as addReservation.
  if (items.length > 0 && await getBookingHold(items[0].renterId)) throw new BookingHoldError();
  const batch = writeBatch(db);
  items.forEach((item, i) => {
    const ref = doc(db, 'reservations', `${orderId}_${i + 1}`);
    const { pickupAt, returnAt, ...rest } = item;
    batch.set(ref, {
      ...rest,
      orderId,
      pickupAt:  Timestamp.fromDate(pickupAt),
      returnAt:  Timestamp.fromDate(returnAt),
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
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
  // Late-return penalty — present only when the reservation had a late penalty. Fully
  // independent of the damage fields above; either, neither, or both may be set.
  lateChargeAmount?: number;
  lateChargeReason?: string;
  // Always present whenever this object is passed at all — combined across both sources.
  chargeCurrency: 'LAK' | 'USD' | 'THB';
  depositAppliedToCharge: number;
  outstandingBalance: number;
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
  }>,
): Promise<void> {
  if (items.length === 0) return;
  const batch = writeBatch(db);
  items.forEach(({ id, type, checklistData, charge, productId, quantity, adminName }) => {
    const isHandover = type === 'handover';
    batch.update(doc(db, 'reservations', id), {
      [isHandover ? 'handoverChecklist' : 'returnChecklist']: checklistData,
      status: isHandover ? 'active' : 'returned',
      ...(isHandover ? {} : { returnedAt: serverTimestamp(), stockReleasedAt: null }),
      ...(charge ?? {}),
      updatedAt: serverTimestamp(),
    });
    // Excluded from available stock the instant it's marked returned — released only by
    // releaseSettledStock, once the deposit/charges are closed out AND the 12h handoff
    // buffer has elapsed. A checklist-rated 'unusable' item is a true write-off, so it
    // goes straight to lostUnits instead, mirroring "Report lost/stolen".
    if (!isHandover) {
      const field: StockConditionField = charge?.chargeSeverity === 'unusable' ? 'lostUnits' : 'pendingSettlementUnits';
      const reason = charge?.chargeSeverity === 'unusable'
        ? 'Return checklist rated item unusable'
        : 'Returned — pending deposit settlement';
      addStockAdjustmentToBatch(batch, productId, field, quantity, reason, adminName, id);
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
  btobRejectionReason?: string;
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

// Writes a review (using reservationId as doc ID for one-review-per-rental enforcement),
// then re-reads all reviews for the product to recompute averageRating + reviewCount.
// NOTE: non-atomic — race condition is negligible at current volume.
// Migrate to Cloud Function + FieldValue.increment() when on Blaze plan.
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

  const allSnap = await getDocs(collection(db, 'reviews', productId, 'reviews'));
  const ratings = allSnap.docs.map(d => (d.data() as ReviewDoc).rating);
  const count = ratings.length;
  const avg = ratings.reduce((sum, r) => sum + r, 0) / count;

  await updateDoc(doc(db, 'products', productId), {
    averageRating: avg,
    reviewCount: count,
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
