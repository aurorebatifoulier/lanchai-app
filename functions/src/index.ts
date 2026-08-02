import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

export const lateReturnAlerts = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-southeast1' },
  async () => {
    const now = Date.now();
    const snap = await db
      .collection('reservations')
      .where('status', '==', 'active')
      .get();

    const adminSnap = await db.collection('admins').get();
    const adminUids = adminSnap.docs.map(d => d.id);

    for (const reservationDoc of snap.docs) {
      const data = reservationDoc.data();
      const returnAt: admin.firestore.Timestamp = data.returnAt;
      if (!returnAt || returnAt.toMillis() > now) continue;

      const hoursLate = (now - returnAt.toMillis()) / 3_600_000;
      const reservationId = reservationDoc.id;
      const renterId: string = data.renterId;
      const productName: string = data.productName ?? 'your item';
      const renterName: string = data.renterName ?? 'A renter';
      const pricePerDay: number = data.pricePerDay ?? 0;
      const penalty = pricePerDay.toLocaleString('en-US');

      const updates: Record<string, unknown> = {};

      // ── 0h alert ──────────────────────────────────────────────────────────
      if (!data.lateAlert0h) {
        updates.lateAlert0h = true;
        updates.latePenaltyAmount = pricePerDay;
        await sendRenterNotif(renterId, {
          title: 'Return due now',
          body: `Your ${productName} is due back today — please return it now to avoid a late fee.`,
          icon: 'clock', iconColor: 'amber',
          deepLink: `/rentals/${reservationId}`,
        });
        await sendAdminNotifs(adminUids, {
          title: 'Return due now',
          body: `${renterName}'s ${productName} is due for return today.`,
          icon: 'alert', iconColor: 'amber',
          deepLink: `/admin/reservations/${reservationId}`,
        });
      }

      // ── +1h alert ─────────────────────────────────────────────────────────
      if (hoursLate >= 1 && !data.lateAlert1h) {
        updates.lateAlert1h = true;
        await sendRenterNotif(renterId, {
          title: 'Return is 1 hour late',
          body: `Your ${productName} was due 1 hour ago. Please return it as soon as possible — a late fee may apply the longer it's overdue.`,
          icon: 'alert', iconColor: 'coral',
          deepLink: `/rentals/${reservationId}`,
        });
        await sendAdminNotifs(adminUids, {
          title: '1h overdue',
          body: `${renterName}'s ${productName} is 1 hour late — no return confirmed yet.`,
          icon: 'alert', iconColor: 'coral',
          deepLink: `/admin/reservations/${reservationId}`,
        });
      }

      // ── +2h alert ─────────────────────────────────────────────────────────
      if (hoursLate >= 2 && !data.lateAlert2h) {
        updates.lateAlert2h = true;
        await sendRenterNotif(renterId, {
          title: 'Return is 2 hours overdue',
          body: `Your ${productName} is now 2 hours overdue. A late fee of ${penalty} LAK may apply, pending confirmation from our team — please return the item as soon as possible.`,
          icon: 'alert', iconColor: 'coral',
          deepLink: `/rentals/${reservationId}`,
        });
        await sendAdminNotifs(adminUids, {
          title: '2h overdue',
          body: `${renterName}'s ${productName} is 2 hours overdue. Estimated penalty: ${penalty} LAK (requires manual confirmation before applying).`,
          icon: 'alert', iconColor: 'coral',
          deepLink: `/admin/reservations/${reservationId}`,
        });
      }

      if (Object.keys(updates).length > 0) {
        await reservationDoc.ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
      }
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

export const applyLoyaltyPoints = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    if (!event.data) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status === 'returned' || after.status !== 'returned') return;
    if (after.loyaltyApplied) return;

    const pointsEarned = Math.floor((after.subtotal ?? 0) / 10_000);
    const renterId: string = after.renterId;

    const configSnap = await db.collection('config').doc('loyalty').get();
    const cfg = configSnap.data() as {
      thresholds?: { silver: number; gold: number; platinum: number };
      couponPercentByTier?: { silver: number; gold: number; platinum: number };
    } | undefined;

    const tierOrder: Array<{ tier: 'silver' | 'gold' | 'platinum'; threshold: number }> =
      cfg?.thresholds
        ? [
            { tier: 'silver',   threshold: cfg.thresholds.silver },
            { tier: 'gold',     threshold: cfg.thresholds.gold },
            { tier: 'platinum', threshold: cfg.thresholds.platinum },
          ]
        : [];

    const userRef = db.collection('users').doc(renterId);

    await db.runTransaction(async tx => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() ?? {};
      const oldPoints: number = userData.loyaltyPoints ?? 0;
      const newPoints = oldPoints + pointsEarned;

      const newlyCrossed = tierOrder.filter(t => oldPoints < t.threshold && newPoints >= t.threshold);
      const newTier =
        [...tierOrder].reverse().find(t => newPoints >= t.threshold)?.tier ?? 'bronze';

      // Firestore forbids FieldValue.serverTimestamp() sentinels inside array elements
      // ("cannot be used inside of an array") — coupons live in an array, so each one
      // needs a concrete Timestamp computed now, not a server-resolved sentinel.
      const issuedAt = admin.firestore.Timestamp.now();
      const newCoupons = newlyCrossed.map(t => ({
        id: db.collection('_').doc().id, // random id — standard no-write Firestore ID trick
        tier: t.tier,
        percent: cfg?.couponPercentByTier?.[t.tier] ?? 0,
        issuedAt,
        used: false,
      }));

      const existingCoupons: unknown[] = userData.coupons ?? [];

      tx.update(userRef, {
        loyaltyPoints: newPoints,
        loyaltyTier: newTier,
        ...(userData.firstRentalDate ? {} : { firstRentalDate: FieldValue.serverTimestamp() }),
        ...(newCoupons.length > 0 ? { coupons: [...existingCoupons, ...newCoupons] } : {}),
      });

      tx.update(event.data!.after.ref, {
        loyaltyApplied: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);

// ── Loyalty Phase 2 — tier-gated product access ──────────────────────────────

// Local copies, matching the existing pattern in applyLoyaltyPoints above (this project
// doesn't share code between the app and functions) — must stay in sync with
// lib/loyalty.ts's TIER_ORDER/TIER_LABELS.
const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum'] as const;
type Tier = typeof TIER_ORDER[number];
const TIER_LABELS: Record<Tier, string> = {
  bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum',
};

// Auto-expires 'earlyAccess' products once their deadline has passed — flips
// accessMode to 'public'. Never touches 'exclusive' products (query excludes them).
// Self-idempotent: once flipped, a doc no longer matches the query, so no flag needed.
export const expireEarlyAccess = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-southeast1' },
  async () => {
    const snap = await db.collection('products')
      .where('accessMode', '==', 'earlyAccess')
      .where('earlyAccessUntil', '<=', admin.firestore.Timestamp.now())
      .get();

    await Promise.all(snap.docs.map(d => d.ref.update({
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
  payload: { title: string; body: string; icon: string; iconColor: string; deepLink: string },
): Promise<void> {
  await Promise.all(
    adminUids.map(uid =>
      db.collection('notifications').doc(uid).collection('items').add({
        type: 'rental',
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
    ),
  );
}
