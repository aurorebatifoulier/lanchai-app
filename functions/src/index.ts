import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  computeLatePenalty,
  sanitizeGraceHours,
  isPenaltyStage,
  formatPenaltyDays,
} from './shared/latePenalty';
import { BREVO_API_KEY } from './email/config';
import {
  loyaltyPointsFor, isLoyaltyExcluded, applyLoyaltyPointsChange, DEFAULT_REVIEW_REWARD_POINTS,
  TIER_ORDER, TIER_LABELS, type LoyaltyChangeConfig, type LoyaltyTierKey,
} from './shared/loyalty';
import { isPickupMissed } from './shared/dates';
import { HANDOFF_BUFFER_MS } from './shared/availability';
import { sendLateReturnEmail } from './email/triggers';
import { dueLateAlerts, planLateEmails, type LateAlertKey, type LateRow } from './lateAlerts';

// Transactional emails (Brevo) — see functions/src/email/.
export * from './email/triggers';

// Server-side reservation creation (the only path for renters) — see reservations.ts.
export * from './reservations';

// Review rating sync + server-side account deletion — see account.ts.
export * from './account';

admin.initializeApp();
const db = admin.firestore();

// Reads the internal late-return grace period (config/latePolicy — admin-only in the
// rules, never surfaced to renters). Missing/invalid → DEFAULT_LATE_GRACE_HOURS.
async function getGraceHours(): Promise<number> {
  const snap = await db.collection('config').doc('latePolicy').get().catch(() => null);
  return sanitizeGraceHours(snap?.data()?.graceHours);
}


export const lateReturnAlerts = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-southeast1', secrets: [BREVO_API_KEY] },
  async () => {
    const now = Date.now();
    const snap = await db
      .collection('reservations')
      .where('status', '==', 'active')
      .get();

    const adminSnap = await db.collection('admins').get();
    const adminUids = adminSnap.docs.map(d => d.id);
    const graceHours = await getGraceHours();

    // Late emails go out ONE per order and run (planLateEmails, lateAlerts.ts) — the
    // in-app alerts below stay per reservation.
    const lateRows: LateRow[] = [];

    for (const reservationDoc of snap.docs) {
      const data = reservationDoc.data();
      const returnAt: admin.firestore.Timestamp = data.returnAt;
      if (!returnAt || returnAt.toMillis() > now) continue;

      const reservationId = reservationDoc.id;
      const renterId: string = data.renterId;
      const productName: string = data.productName ?? 'your item';
      const renterName: string = data.renterName ?? 'A renter';
      const pricePerDay: number = data.pricePerDay ?? 0;
      const quantity: number = data.quantity ?? 1;

      const penalty = computeLatePenalty({
        returnAtMs: returnAt.toMillis(), nowMs: now, pricePerDay, quantity, graceHours,
      });
      const amount = penalty.amountLak.toLocaleString('en-US');
      const daysLabel = formatPenaltyDays(penalty.days);
      const breakdown = `${daysLabel} × ${pricePerDay.toLocaleString('en-US')} LAK × ${quantity}`;
      const renterLink = `/rentals/${reservationId}`;
      const adminLink = `/admin/reservations/${reservationId}`;

      const updates: Record<string, unknown> = {};

      // Recalculated on every run, written only when it changes — so the stored
      // suggestion follows the tiers (0 → 1 → 1.5 → 2 days) instead of freezing at 0h.
      if (data.latePenaltyAmount !== penalty.amountLak || data.latePenaltyDays !== penalty.days) {
        updates.latePenaltyAmount = penalty.amountLak;
        updates.latePenaltyDays = penalty.days;
      }
      if (penalty.stage === 'nonReturn' && !data.nonReturnAt) {
        updates.nonReturnAt = FieldValue.serverTimestamp();
      }

      const senders: Record<LateAlertKey, () => Promise<void>> = {} as Record<LateAlertKey, () => Promise<void>>;
      senders.lateAlert0h = async () => {
        await sendRenterNotif(renterId, {
          title: 'Return due now',
          body: `Your ${productName} is due back today — please return it now to avoid a late fee.`,
          icon: 'clock', iconColor: 'amber', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: 'Return due now',
          body: `${renterName}'s ${productName} is due for return today.`,
          icon: 'alert', iconColor: 'amber', deepLink: adminLink,
        });
      };
      senders.lateAlert1h = async () => {
        await sendRenterNotif(renterId, {
          title: 'Return is 1 hour late',
          body: `Your ${productName} was due 1 hour ago. Please return it as soon as possible — late returns may add rental days.`,
          icon: 'alert', iconColor: 'coral', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: '1h overdue',
          body: `${renterName}'s ${productName} is 1 hour late — no return confirmed yet.`,
          icon: 'alert', iconColor: 'coral', deepLink: adminLink,
        });
      };
      senders.lateAlertGrace = async () => {
        await sendRenterNotif(renterId, {
          title: 'Return overdue',
          body: `Your ${productName} is overdue. A late fee of ${amount} LAK (1 rental day) may apply, pending confirmation from our team — please return the item as soon as possible.`,
          icon: 'alert', iconColor: 'coral', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: 'Overdue — penalty suggested',
          body: `${renterName}'s ${productName} is ${Math.floor(penalty.hoursLate)}h overdue. Suggested penalty: ${amount} LAK (${breakdown}) — requires manual confirmation at return.`,
          icon: 'alert', iconColor: 'coral', deepLink: adminLink,
        });
      };
      senders.lateAlert24h = async () => {
        await sendRenterNotif(renterId, {
          title: 'Return over 24 hours late',
          body: `Your ${productName} is more than 24 hours overdue. The late fee may now be ${amount} LAK (1.5 rental days), pending confirmation from our team — please return it as soon as possible.`,
          icon: 'alert', iconColor: 'coral', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: '24h+ overdue',
          body: `${renterName}'s ${productName} is more than 24 hours overdue. Suggested penalty: ${amount} LAK (${breakdown}) — requires manual confirmation at return.`,
          icon: 'alert', iconColor: 'coral', deepLink: adminLink,
        });
      };
      senders.lateAlert48h = async () => {
        await sendRenterNotif(renterId, {
          title: 'Return over 48 hours late',
          body: `Your ${productName} is more than 48 hours overdue. The late fee may now be ${amount} LAK (2 rental days), pending confirmation from our team. After 72 hours, it will be treated as a non-return.`,
          icon: 'alert', iconColor: 'coral', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: '48h+ overdue',
          body: `${renterName}'s ${productName} is more than 48 hours overdue. Suggested penalty: ${amount} LAK (${breakdown}) — requires manual confirmation at return.`,
          icon: 'alert', iconColor: 'coral', deepLink: adminLink,
        });
      };
      senders.lateAlert72h = async () => {
        await sendRenterNotif(renterId, {
          title: 'Treated as a non-return',
          body: `Your ${productName} is now more than 72 hours overdue and is treated as a non-return. Your deposit may be kept and our contract procedure applies. Please contact us right away.`,
          icon: 'alert', iconColor: 'coral', deepLink: renterLink,
        });
        await sendAdminNotifs(adminUids, {
          title: 'Non-return (72h+)',
          body: `${renterName}'s ${productName} is more than 72 hours overdue and is flagged as a non-return. Suggested penalty: ${amount} LAK (${breakdown}). Review it, and use "Report lost/stolen" if the item won't come back.`,
          icon: 'alert', iconColor: 'coral', deepLink: adminLink,
        });
      };

      // Only the highest due alert is sent; all due flags are marked done. Emails mirror
      // it from the end of grace on (planLateEmails below); the 0h/+1h stay in-app only.
      const due = dueLateAlerts(data, penalty, returnAt.toMillis(), now);
      const highest = due.length ? due[due.length - 1] : null;
      if (highest) {
        await senders[highest]();
        for (const k of due) updates[k] = true;
      }
      lateRows.push({
        id: reservationId, orderId: data.orderId ?? reservationId.replace(/_\d+$/, ''), renterId, penalty, highest,
      });

      if (Object.keys(updates).length > 0) {
        await reservationDoc.ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
      }
    }

    // Same lateAlert* flags → never sent twice; sendLateReturnEmail never throws.
    const docsById = new Map(snap.docs.map(d => [d.id, d]));
    for (const batch of planLateEmails(lateRows)) {
      const lines = batch.lines.map(l => ({ ...l, snap: docsById.get(l.id)! }));
      // Past the grace period syncBookingHold always holds the renter (admins excepted) —
      // decided here so the line doesn't depend on that trigger having run yet.
      await sendLateReturnEmail(batch.renterId, batch.stage, batch.orderId, lines, !adminUids.includes(batch.renterId));
    }
  },
);

// Keeps bookingHolds/{renterId} in sync with that renter's reservations: the doc exists
// (and blocks new reservations — see firestore.rules' reservations create rule) while the
// renter has an ACTIVE reservation past the grace period, or an unpaid outstanding
// balance. Fires on every reservation write; the scheduled lateReturnAlerts above writes
// latePenaltyAmount the moment the grace period ends, which re-triggers this, so the
// time-based crossing needs no extra mechanism. Writes only to bookingHolds — no loop.
export const syncBookingHold = onDocumentWritten(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    const renterId: string | undefined =
      event.data?.after.data()?.renterId ?? event.data?.before.data()?.renterId;
    if (!renterId) return;

    const holdRef = db.collection('bookingHolds').doc(renterId);
    const [graceHours, snap, adminDoc] = await Promise.all([
      getGraceHours(),
      db.collection('reservations').where('renterId', '==', renterId).get(),
      db.collection('admins').doc(renterId).get(),
    ]);
    // Admins are never blocked from booking.
    if (adminDoc.exists) {
      await holdRef.delete().catch(() => {});
      return;
    }
    const now = Date.now();

    const overdueIds: string[] = [];
    const outstandingIds: string[] = [];
    const noShowIds: string[] = [];
    for (const d of snap.docs) {
      const r = d.data();
      // Admin-marked missed pick-up, until an admin lifts the hold (status stays no_show).
      if (r.status === 'no_show' && !r.noShowHoldLiftedAt) noShowIds.push(d.id);
      if (r.status === 'active' && r.returnAt) {
        const { stage } = computeLatePenalty({
          returnAtMs: r.returnAt.toMillis(), nowMs: now,
          pricePerDay: r.pricePerDay ?? 0, quantity: r.quantity ?? 1, graceHours,
        });
        if (isPenaltyStage(stage)) overdueIds.push(d.id);
      }
      if ((r.outstandingBalance ?? 0) > 0 && !r.outstandingSettled && !r.outstandingWrittenOff) {
        outstandingIds.push(d.id);
      }
    }

    if (overdueIds.length === 0 && outstandingIds.length === 0 && noShowIds.length === 0) {
      await holdRef.delete().catch(() => {});
      return;
    }
    const reasons: string[] = [];
    if (overdueIds.length > 0) reasons.push('overdue');
    if (outstandingIds.length > 0) reasons.push('outstanding');
    if (noShowIds.length > 0) reasons.push('noShow');
    await holdRef.set({
      reasons,
      reservationIds: [...new Set([...overdueIds, ...outstandingIds, ...noShowIds])],
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

// HANDOFF_BUFFER_MS comes from functions/src/shared/availability.ts (shared with the app).

// Releases a returned reservation's unit(s) back into the bookable pool — decrementing
// the product's pendingSettlementUnits (see lib/types.ts) — but only once BOTH the
// deposit/charges are closed out (returnFinalizedAt is set, by whichever of the 3
// closing actions in app/admin/reservations/[id].tsx fired) AND the 12h handoff buffer
// has elapsed since returnAt. Release is deliberately NOT synchronous with settlement:
// under the immediate-refund policy settlement happens ~10 minutes after return, and
// releasing that fast would give the unit zero handoff buffer at all. This is timing
// logic only — no renter/admin-facing color or urgency treatment, matching the explicit
// decision not to reintroduce the removed deposit-urgency system.
export const releaseSettledStock = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-southeast1' },
  async () => {
    const now = Date.now();
    const snap = await db
      .collection('reservations')
      .where('status', '==', 'returned')
      .where('stockReleasedAt', '==', null)
      .get();

    for (const reservationDoc of snap.docs) {
      const data = reservationDoc.data();

      const returnFinalizedAt: admin.firestore.Timestamp | undefined = data.returnFinalizedAt;
      if (!returnFinalizedAt) continue; // deposit/charges not closed out yet

      const returnAt: admin.firestore.Timestamp | undefined = data.returnAt;
      if (!returnAt || now < returnAt.toMillis() + HANDOFF_BUFFER_MS) continue; // buffer not elapsed yet

      const productId: string = data.productId;
      const quantity: number = data.quantity ?? 0;
      if (!productId || quantity <= 0) continue;

      const toRepair = data.stockReleaseHandling === 'repair';
      const batch = db.batch();
      const productRef = db.collection('products').doc(productId);

      batch.update(reservationDoc.ref, { stockReleasedAt: FieldValue.serverTimestamp() });
      batch.update(productRef, toRepair
        ? { pendingSettlementUnits: FieldValue.increment(-quantity), inRepairUnits: FieldValue.increment(quantity) }
        : { pendingSettlementUnits: FieldValue.increment(-quantity) },
      );

      const releaseAdjustmentRef = productRef.collection('stockAdjustments').doc();
      batch.set(releaseAdjustmentRef, {
        field: 'pendingSettlementUnits',
        delta: -quantity,
        reason: toRepair
          ? 'Released from pending settlement — sent to repair'
          : 'Released from pending settlement — back in stock',
        reservationId: reservationDoc.id,
        adminName: 'system (releaseSettledStock)',
        createdAt: FieldValue.serverTimestamp(),
      });
      if (toRepair) {
        const repairAdjustmentRef = productRef.collection('stockAdjustments').doc();
        batch.set(repairAdjustmentRef, {
          field: 'inRepairUnits',
          delta: quantity,
          reason: 'Released from pending settlement — sent to repair',
          reservationId: reservationDoc.id,
          adminName: 'system (releaseSettledStock)',
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
    }
  },
);

export const applyRentalCount = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    if (!event.data) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status === 'returned' || after.status !== 'returned') return;
    if (after.rentalCountApplied) return;

    const productId: string = after.productId;
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();

    if (productSnap.exists) {
      await productRef.update({
        rentalCount:   FieldValue.increment(1),
        bookingsCount: FieldValue.increment(1),
      });
    }

    await event.data.after.ref.update({
      rentalCountApplied: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

// Gives a loyalty coupon back to the renter when the booking it was used on is
// cancelled — renter or LANCHAI cancellation alike (nothing is charged before pick-up),
// but never for admin_release (a data correction). Only when EVERY line carrying that
// coupon (couponApplied.id) is cancelled: a partial cancellation keeps it used.
// Idempotent: the transaction checks/sets `couponRestored` on those lines, so the
// sibling triggers of a batch cancellation restore it once. Coupons live in an array,
// so no serverTimestamp() sentinel is written inside it (CLAUDE.md gotcha).
export const restoreCancelledCoupon = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;
      if (before.status === 'cancelled' || after.status !== 'cancelled') return;
      if (after.cancelledBy === 'admin_release') return;
      const couponId: string | undefined = after.couponApplied?.id;
      if (!couponId || after.couponRestored) return;

      const lines = after.orderId
        ? (await db.collection('reservations').where('orderId', '==', after.orderId).get()).docs
        : [event.data!.after as admin.firestore.QueryDocumentSnapshot];
      const carrying = lines.filter(d => d.get('couponApplied')?.id === couponId);
      if (carrying.some(d => d.get('status') !== 'cancelled')) return; // partial → keep it used

      const userRef = db.collection('users').doc(after.renterId);
      const usedOn = new Set<string>([...carrying.map(d => d.id), ...(after.orderId ? [after.orderId] : [])]);

      await db.runTransaction(async tx => {
        const lineSnaps = await Promise.all(carrying.map(d => tx.get(d.ref)));
        if (lineSnaps.some(l => l.get('couponRestored'))) return;
        const userSnap = await tx.get(userRef);
        const coupons: Record<string, unknown>[] = userSnap.get('coupons') ?? [];
        let restored = false;
        const next = coupons.map(c => {
          if (c.id !== couponId || c.used !== true) return c;
          if (c.usedOnReservationId && !usedOn.has(String(c.usedOnReservationId))) return c;
          restored = true;
          const { usedAt: _usedAt, usedOnReservationId: _usedOn, ...rest } = c;
          return { ...rest, used: false };
        });
        if (restored) tx.update(userRef, { coupons: next });
        for (const l of lineSnaps) tx.update(l.ref, { couponRestored: true });
      });
    } catch (err) {
      console.error('[restoreCancelledCoupon] failed', err);
    }
  },
);

// "Not picked up" admin alert: once the pick-up day is over (Vientiane time) for a
// pending_payment/confirmed booking, notify admins ONCE per order. Alert only — never
// changes the reservation status (a late pick-up still goes through; the admin decides
// whether to mark a no-show). Equality-only query + date filter in code (no index).
export const missedPickupAlerts = onSchedule(
  { schedule: 'every 60 minutes', region: 'asia-southeast1' },
  async () => {
    const now = Date.now();
    const snap = await db.collection('reservations')
      .where('status', 'in', ['pending_payment', 'confirmed'])
      .get();
    const due = snap.docs.filter(d => {
      const p: admin.firestore.Timestamp | undefined = d.get('pickupAt');
      return p && isPickupMissed(p.toMillis(), now) && !d.get('missedPickupAlertAt');
    });
    if (due.length === 0) return;

    const groups = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
    for (const d of due) {
      const key = d.get('orderId') ?? d.id;
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    const adminUids = (await db.collection('admins').get()).docs.map(a => a.id);
    for (const [orderId, docs] of groups) {
      const first = docs[0];
      const names = docs.map(d => d.get('productName') ?? 'item').join(', ');
      await sendAdminNotifs(adminUids, {
        title: 'Not picked up',
        body: `${first.get('renterName') ?? 'A renter'} didn't pick up ${names} (order ${orderId}). Mark it as a no-show or continue the pick-up if they come.`,
        icon: 'alert', iconColor: 'amber',
        deepLink: `/admin/reservations/${first.id}`,
      });
      await Promise.all(docs.map(d => d.ref.update({ missedPickupAlertAt: FieldValue.serverTimestamp() })));
    }
  },
);

// Server-side credit of loyalty points — the ONLY way points ever change. Shared by
// rentals (applyLoyaltyPoints) and reviews (applyReviewReward): balance, tier and the
// one-time tier coupons all come from applyLoyaltyPointsChange (shared/loyalty.ts), and
// every credit leaves a users/{uid}/loyaltyHistory entry. Must run inside a transaction
// that has already read `userSnap` (reads before writes).
type LoyaltyCfg = LoyaltyChangeConfig | undefined;

async function getLoyaltyCfg(): Promise<LoyaltyCfg> {
  const snap = await db.collection('config').doc('loyalty').get();
  return snap.data() as LoyaltyCfg & { reviewRewardPoints?: number } | undefined;
}

function creditLoyaltyPoints(
  tx: admin.firestore.Transaction,
  userSnap: admin.firestore.DocumentSnapshot,
  amount: number,
  cfg: LoyaltyCfg,
  entry: { source: 'rental' | 'review'; reservationId: string; productName: string },
  extraUserFields: Record<string, unknown> = {},
): void {
  const userData = userSnap.data() ?? {};
  const { newPoints, newTier, crossed } = applyLoyaltyPointsChange(userData.loyaltyPoints ?? 0, amount, cfg);

  // Firestore forbids FieldValue.serverTimestamp() sentinels inside array elements
  // ("cannot be used inside of an array") — coupons live in an array, so each one
  // needs a concrete Timestamp computed now, not a server-resolved sentinel.
  const issuedAt = admin.firestore.Timestamp.now();
  const newCoupons = crossed.map(c => ({
    id: db.collection('_').doc().id, // random id — standard no-write Firestore ID trick
    tier: c.tier,
    percent: c.percent,
    issuedAt,
    used: false,
  }));
  const existingCoupons: unknown[] = userData.coupons ?? [];

  tx.update(userSnap.ref, {
    loyaltyPoints: newPoints,
    loyaltyTier: newTier,
    ...extraUserFields,
    ...(newCoupons.length > 0 ? { coupons: [...existingCoupons, ...newCoupons] } : {}),
  });
  tx.set(userSnap.ref.collection('loyaltyHistory').doc(), {
    amount,
    source: entry.source,
    reservationId: entry.reservationId,
    productName: entry.productName,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const applyLoyaltyPoints = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    if (!event.data) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status === 'returned' || after.status !== 'returned') return;
    if (after.loyaltyApplied) return;

    const pointsEarned = loyaltyPointsFor(after.subtotal);
    const userRef = db.collection('users').doc(after.renterId);

    // Business / BtoB accounts are excluded entirely from the loyalty program — no
    // points, no tier progression, no coupons, ever (shared isLoyaltyExcluded rule).
    const preSnap = await userRef.get();
    if (isLoyaltyExcluded(preSnap.data() ?? {})) return;

    const cfg = await getLoyaltyCfg();

    await db.runTransaction(async tx => {
      const userSnap = await tx.get(userRef);
      creditLoyaltyPoints(tx, userSnap, pointsEarned, cfg,
        { source: 'rental', reservationId: event.params.reservationId, productName: after.productName ?? '' },
        userSnap.data()?.firstRentalDate ? {} : { firstRentalDate: FieldValue.serverTimestamp() });
      tx.update(event.data!.after.ref, {
        loyaltyApplied: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);

// Review reward: N points (config/loyalty.reviewRewardPoints, default 10) for a review
// of a RETURNED reservation of that renter — ALWAYS, whatever the rating (the rating is
// never read). Once per reservation: reviewRewardApplied on the reservation (only
// Cloud Functions/admins can write it), so an admin edit (update, not create) or a
// deleted-then-recreated review never re-credits. Excluded accounts: nothing.
// No clawback if an admin later deletes the review.
export const applyReviewReward = onDocumentCreated(
  { document: 'reviews/{productId}/reviews/{reservationId}', region: 'asia-southeast1' },
  async event => {
    try {
      const review = event.data?.data();
      if (!review) return;
      const { productId, reservationId } = event.params;
      const resRef = db.collection('reservations').doc(reservationId);
      const resSnap = await resRef.get();
      const res = resSnap.data();
      if (!res || res.status !== 'returned' || res.renterId !== review.userId || res.productId !== productId) return;
      if (res.reviewRewardApplied) return;

      const userRef = db.collection('users').doc(res.renterId);
      const preSnap = await userRef.get();
      if (isLoyaltyExcluded(preSnap.data() ?? {})) return;

      const cfg = await getLoyaltyCfg() as (LoyaltyCfg & { reviewRewardPoints?: number }) | undefined;
      const points = typeof cfg?.reviewRewardPoints === 'number' && cfg.reviewRewardPoints >= 0
        ? Math.floor(cfg.reviewRewardPoints)
        : DEFAULT_REVIEW_REWARD_POINTS;
      if (points <= 0) return;

      await db.runTransaction(async tx => {
        const [freshRes, userSnap] = await Promise.all([tx.get(resRef), tx.get(userRef)]);
        if (freshRes.get('reviewRewardApplied')) return;
        creditLoyaltyPoints(tx, userSnap, points, cfg,
          { source: 'review', reservationId, productName: res.productName ?? review.productName ?? '' });
        tx.update(resRef, { reviewRewardApplied: true, updatedAt: FieldValue.serverTimestamp() });
      });
    } catch (err) {
      console.error('[applyReviewReward] failed', err);
    }
  },
);

// ── Loyalty Phase 2 — tier-gated product access ──────────────────────────────

// Tier order/labels come from functions/src/shared/loyalty.ts (shared with the app).
type Tier = LoyaltyTierKey;

// Auto-expires 'earlyAccess' products once their deadline has passed — flips
// accessMode to 'public'. Never touches 'exclusive' products (query excludes them).
// Self-idempotent: once flipped, a doc no longer matches the query, so no flag needed.
export const expireEarlyAccess = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-southeast1' },
  async () => {
    // Equality-only query + in-memory date filter, on purpose: combining
    // accessMode == … with earlyAccessUntil <= … needs a composite index this project
    // doesn't have (the query failed with FAILED_PRECONDITION on every run). Only a
    // handful of products are ever in early access, so filtering here costs nothing.
    const now = Date.now();
    const snap = await db.collection('products')
      .where('accessMode', '==', 'earlyAccess')
      .get();
    const expired = snap.docs.filter(d => {
      const until: admin.firestore.Timestamp | undefined = d.data().earlyAccessUntil;
      return until != null && until.toMillis() <= now;
    });

    await Promise.all(expired.map(d => d.ref.update({
      accessMode: 'public',
      updatedAt:  FieldValue.serverTimestamp(),
    })));
  },
);

// Notifies eligible members when a product is created or updated into 'earlyAccess' or
// 'exclusive' access mode. Only fires when accessMode itself transitions into a gated
// state — unrelated edits to an already-gated product (price tweaks, etc.) don't re-notify.
export const notifyProductAccessGrant = onDocumentWritten(
  { document: 'products/{productId}', region: 'asia-southeast1' },
  async event => {
    if (!event.data?.after.exists) return; // skip deletes

    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.data()!;
    const gatedModes = ['earlyAccess', 'exclusive'];

    if (before?.accessMode === after.accessMode) return; // no change, or unrelated edit
    if (!gatedModes.includes(after.accessMode)) return;  // didn't just become gated

    const minTier = (after.minTierRequired ?? 'bronze') as Tier;
    const eligibleTiers = TIER_ORDER.slice(TIER_ORDER.indexOf(minTier));

    const usersSnap = await db.collection('users').where('loyaltyTier', 'in', eligibleTiers).get();
    if (usersSnap.empty) return;

    const isExclusive = after.accessMode === 'exclusive';
    const tierLabel = TIER_LABELS[minTier];
    const title = isExclusive ? 'New exclusive item' : 'New early access item';
    const body = isExclusive
      ? `${after.name} is now available exclusively for ${tierLabel}+ members.`
      : `${after.name} is now available early for ${tierLabel}+ members.`;

    await Promise.all(usersSnap.docs.map(u =>
      db.collection('notifications').doc(u.id).collection('items').add({
        type: 'product',
        title,
        body,
        icon: 'star',
        iconColor: 'amber',
        deepLink: `/product/${event.params.productId}`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
    ));
  },
);

async function sendRenterNotif(
  uid: string,
  payload: { title: string; body: string; icon: string; iconColor: string; deepLink: string },
): Promise<void> {
  await db.collection('notifications').doc(uid).collection('items').add({
    type: 'rental',
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
  });
}

async function sendAdminNotifs(
  adminUids: string[],
  payload: { type?: string; title: string; body: string; icon: string; iconColor: string; deepLink: string },
): Promise<void> {
  const { type = 'rental', ...rest } = payload;
  await Promise.all(
    adminUids.map(uid =>
      db.collection('notifications').doc(uid).collection('items').add({
        type,
        ...rest,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
    ),
  );
}

// Notifies every admin when a new BtoB (business account) signup comes in — fires only
// on the transition into accountType: 'btob' (idempotent: an update that leaves
// accountType already 'btob' — e.g. an admin's own approve/reject write — never re-fires).
export const notifyBtobSignup = onDocumentWritten(
  { document: 'users/{uid}', region: 'asia-southeast1' },
  async event => {
    if (!event.data?.after.exists) return; // skip deletes
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.data()!;
    if (before?.accountType === 'btob') return; // already notified on the original signup
    if (after.accountType !== 'btob') return;    // not a BtoB signup

    const adminSnap = await db.collection('admins').get();
    const adminUids = adminSnap.docs.map(d => d.id);
    if (adminUids.length === 0) return;

    await sendAdminNotifs(adminUids, {
      type: 'account',
      title: 'New business account',
      body: `${after.btobCompanyName ?? 'A company'} submitted a business account application.`,
      icon: 'briefcase',
      iconColor: 'amber',
      deepLink: `/admin/business-accounts/${event.params.uid}`,
    });
  },
);

// Notifies every admin when a renter files a new claim. Renters can't write directly
// into an admin's own notifications subcollection (firestore.rules only allows
// isAdmin() || isOwner(userId) there), so this Cloud Function is the only channel for
// this direction — the reverse (admin -> renter, on response) is a plain client-side
// sendNotif call from app/admin/claims/[id].tsx, no function needed.
export const notifyClaimFiled = onDocumentWritten(
  { document: 'claims/{claimId}', region: 'asia-southeast1' },
  async event => {
    if (!event.data?.after.exists || event.data.before.exists) return; // creation only

    const adminSnap = await db.collection('admins').get();
    const adminUids = adminSnap.docs.map(d => d.id);
    if (adminUids.length === 0) return;

    await sendAdminNotifs(adminUids, {
      type: 'rental',
      title: 'New claim filed',
      body: 'A renter reported an issue and needs review.',
      icon: 'alert',
      iconColor: 'amber',
      deepLink: `/admin/claims/${event.params.claimId}`,
    });
  },
);

// ── Reservation occupancy mirror ─────────────────────────────────────────────
//
// The `reservations` collection holds real renter PII (name, pricing, notes) and is
// locked to owner-or-admin reads in firestore.rules. But any renter needs to check
// product availability across ALL renters' bookings before booking — checking "is
// productX free on these dates" inherently requires knowing about other people's
// reservations. Rather than widen reservations' read rule (which would leak that PII
// to any signed-in user), this mirrors each reservation into a minimal, PII-free
// companion doc at reservationOccupancy/{reservationId} — just
// { productId, pickupAt, returnAt, quantity, status } — which utils/availability.ts's
// getAvailableStock queries instead. firestore.rules allows any authenticated user to
// read this collection and denies client writes entirely (only this function, via the
// Admin SDK, ever writes to it).
//
// Fires on every reservation create/update/delete — not just the specific status
// transitions the app's client code currently makes — so it stays correct even as new
// status-changing code paths get added later, instead of requiring every call site to
// remember to keep a second write in sync.
//
// Terminal statuses (returned/cancelled/lost/no_show) delete the mirror rather than keep it
// around with a stale status: getAvailableStock's own status filter is then pure
// defense-in-depth, not the primary correctness mechanism.
export const syncReservationOccupancy = onDocumentWritten(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    const occupancyRef = db.collection('reservationOccupancy').doc(event.params.reservationId);

    if (!event.data?.after.exists) {
      await occupancyRef.delete().catch(() => {});
      return;
    }

    const after = event.data.after.data()!;

    if (['returned', 'cancelled', 'lost', 'no_show'].includes(after.status)) {
      await occupancyRef.delete().catch(() => {});
      return;
    }

    await occupancyRef.set({
      productId: after.productId,
      pickupAt:  after.pickupAt,
      returnAt:  after.returnAt,
      quantity:  after.quantity,
      status:    after.status,
    });
  },
);
