import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { BREVO_API_KEY, REGION } from './config';
import { sendEmail, getEmailMode, type SendResult } from './send';
import { claimEmail, finishEmail, type EmailField } from './claim';
import { cancellationEmailVariant } from '../shared/cancellation';
import { isBtobRejectionKey } from '../shared/btob';
import {
  getEmailShop, getRecipient, getVatPercent, getRates, getLoyaltyThresholds, hasReviewed, getReviewRewardPoints,
  type EmailShop, type Recipient,
} from './context';
import { loyaltyPointsFor, pointsToNextTier, nextTierName } from '../shared/loyalty';
import {
  bookingConfirmationEmail, pickupReminderEmail, returnReminderEmail, cancellationEmail,
  receiptEmail, reviewFollowUpEmail, btobApprovedEmail, btobRejectedEmail, lateReturnEmail, noShowEmail,
  passwordResetEmail, emailVerificationEmail,
  idVerifiedEmail, idDeclinedEmail, residencyApprovedEmail, residencyRejectedEmail, residencyExpiredEmail,
  welcomeEmail,
  type ResData, type Rendered, type LateEmailStage, type LateLine,
} from './templates';

// Transactional emails (Brevo). Every sender: claim → send → finish, so nothing is ever
// sent twice. Handlers catch everything — email problems never crash or retry a trigger.

const db = () => admin.firestore();
// Doc data → template data: Timestamps become epoch ms (templates format them in
// Vientiane time), everything else is the frozen reservation fields as stored.
const asRes = (snap: admin.firestore.DocumentSnapshot): ResData => {
  const d = snap.data() ?? {};
  const ms = (t: unknown) => (t instanceof admin.firestore.Timestamp ? t.toMillis() : 0);
  return {
    ...(d as Omit<ResData, 'id' | 'pickupAtMs' | 'returnAtMs'>),
    id: snap.id,
    pickupAtMs: ms(d.pickupAt),
    returnAtMs: ms(d.returnAt),
    cancelledAtMs: d.cancelledAt ? ms(d.cancelledAt) : undefined,
    returnedAtMs: d.returnedAt ? ms(d.returnedAt) : undefined,
    pricePerDay: d.pricePerDay ?? 0,
    durationDays: d.durationDays ?? 0,
  };
};

async function deliver(
  uid: string,
  fallbackName: string | null | undefined,
  build: (name: string, shop: EmailShop, recipient: Recipient) => Rendered,
  tag: string,
  opts: { respectOptOut?: boolean } = {},
): Promise<SendResult | 'opted_out'> {
  const [recipient, shop] = await Promise.all([getRecipient(uid, fallbackName), getEmailShop()]);
  if (opts.respectOptOut && recipient.remindersOptOut) return 'opted_out';
  if (!recipient.email) return 'no_recipient';
  const mail = build(recipient.name, shop, recipient);
  return sendEmail({ to: { email: recipient.email, name: recipient.name }, ...mail, tag });
}

/** Claims every ref for `field`, sends once for the claimed set, records the result. */
async function claimAndSend(
  refs: admin.firestore.DocumentReference[],
  field: EmailField,
  send: (claimed: admin.firestore.DocumentReference[]) => Promise<SendResult | 'opted_out'>,
): Promise<void> {
  const claimed = await claimEmail(refs, field);
  if (claimed.length === 0) return;
  let result: SendResult | 'opted_out' = 'failed';
  try {
    result = await send(claimed);
  } catch (err) {
    logger.error('[email] send threw', { field, err: String(err) });
  }
  await finishEmail(claimed, field, result === 'opted_out' ? 'no_recipient' : result);
}

// ── 1. Booking confirmation — ONE email per order ───────────────────────────────
// Every reservation id is `${orderId}_${n}` (single bookings included: addReservation
// writes `${orderId}_1`), and bag orders are written in ONE atomic batch, so when `_1`
// is created all its siblings already exist. Equality-only query → no composite index.
export const emailBookingConfirmation = onDocumentCreated(
  { document: 'reservations/{reservationId}', region: REGION, secrets: [BREVO_API_KEY] },
  async event => {
    try {
      const snap = event.data;
      if (!snap || !event.params.reservationId.endsWith('_1')) return;
      const first = asRes(snap);
      const orderId = first.orderId ?? event.params.reservationId.replace(/_1$/, '');
      const siblings = first.orderId
        ? (await db().collection('reservations').where('orderId', '==', orderId).get()).docs
        : [snap];
      const items = siblings.map(asRes).sort((a, b) => a.id.localeCompare(b.id));
      const renterId: string = snap.get('renterId');
      const vat = await getVatPercent();
      await claimAndSend([snap.ref], 'emailConfirmation', () =>
        deliver(renterId, snap.get('renterName'), (name, shop) => bookingConfirmationEmail(name, orderId, items, shop, vat), 'booking-confirmation'));
    } catch (err) {
      logger.error('[email] booking confirmation failed', { err: String(err) });
    }
  },
);

// ── 4. Cancellation + 5. Receipt (reservation updates) ──────────────────────────
export const emailReservationUpdates = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: REGION, secrets: [BREVO_API_KEY] },
  async event => {
    try {
      const before = event.data?.before.data();
      const afterSnap = event.data?.after;
      const after = afterSnap?.data();
      if (!before || !after || !afterSnap) return;
      const renterId: string = after.renterId;

      // Cancellation. Variant A = customer-requested, B = cancelled by LANCHAI,
      // null = admin_release (a data correction, not a cancellation) → no email.
      const variant = cancellationEmailVariant(after.cancelledBy, after.cancelReason);
      if (before.status !== 'cancelled' && after.status === 'cancelled' && variant) {
        // Group the order's lines cancelled in the same batch (same cancelledAt) into one
        // email; claimEmail's transaction makes concurrent sibling triggers send only once.
        const siblings = after.orderId
          ? (await db().collection('reservations').where('orderId', '==', after.orderId).get()).docs
          : [afterSnap as admin.firestore.QueryDocumentSnapshot];
        let group = siblings.filter(d =>
          d.get('status') === 'cancelled' && d.get('cancelledBy') !== 'admin_release'
          && !!after.cancelledAt && d.get('cancelledAt')?.isEqual?.(after.cancelledAt));
        if (!group.some(d => d.id === afterSnap.id)) group = [...group, afterSnap as admin.firestore.QueryDocumentSnapshot];
        const groupIds = new Set(group.map(d => d.id));
        // Partial cancellation: lines of the same order that are still reserved.
        const stillReserved = siblings
          .filter(d => !groupIds.has(d.id) && ['pending_payment', 'confirmed', 'active'].includes(d.get('status')))
          .map(asRes);

        await claimAndSend(group.map(d => d.ref), 'emailCancellation', async claimed => {
          const ids = new Set(claimed.map(r => r.id));
          const items = await withProductInfo(group.filter(d => ids.has(d.id)).map(asRes).sort((a, b) => a.id.localeCompare(b.id)));
          return deliver(renterId, after.renterName, (name, shop) => cancellationEmail(name, items, shop, {
            variant,
            reason: after.cancelReason ?? null,
            reasonText: after.cancelReasonText ?? null,
            stillReserved,
          }), `cancellation-${variant}`);
        });
      }

      // Missed pick-up ("We missed you") — one email per admin batch (same noShowAt).
      if (before.status !== 'no_show' && after.status === 'no_show') {
        const siblings = after.orderId
          ? (await db().collection('reservations').where('orderId', '==', after.orderId).get()).docs
          : [afterSnap as admin.firestore.QueryDocumentSnapshot];
        let group = siblings.filter(d =>
          d.get('status') === 'no_show' && !!after.noShowAt && d.get('noShowAt')?.isEqual?.(after.noShowAt));
        if (!group.some(d => d.id === afterSnap.id)) group = [...group, afterSnap as admin.firestore.QueryDocumentSnapshot];
        await claimAndSend(group.map(d => d.ref), 'emailNoShow', async claimed => {
          const ids = new Set(claimed.map(r => r.id));
          const items = group.filter(d => ids.has(d.id)).map(asRes).sort((a, b) => a.id.localeCompare(b.id));
          return deliver(renterId, after.renterName, (name, shop) => noShowEmail(name, items, shop), 'no-show');
        });
      }

      // End-of-rental receipt — same gate as the in-app receipt screen.
      if (!before.returnFinalizedAt && after.returnFinalizedAt && after.status === 'returned') {
        const res = asRes(afterSnap);
        const [vat, reviewed, loyaltyCfg, rewardPoints] = await Promise.all([
          getVatPercent(), hasReviewed(res.productId, renterId), getLoyaltyThresholds(), getReviewRewardPoints(),
        ]);
        await claimAndSend([afterSnap.ref], 'emailReceipt', () =>
          deliver(renterId, after.renterName, (name, shop, recipient) => {
            // Same rule as applyLoyaltyPoints; the balance already includes these points
            // (credited when the reservation became 'returned', before settlement).
            const earned = loyaltyPointsFor(res.subtotal);
            const loyalty = recipient.loyaltyExcluded || earned <= 0 ? null : {
              earned,
              toNext: pointsToNextTier(recipient.loyaltyPoints, loyaltyCfg),
              nextTier: nextTierName(recipient.loyaltyPoints, loyaltyCfg),
              isTop: !!loyaltyCfg && nextTierName(recipient.loyaltyPoints, loyaltyCfg) === null,
            };
            return receiptEmail(name, res, vat, shop, {
              firstName: recipient.firstName,
              alreadyReviewed: reviewed,
              loyalty,
              // Same eligibility as applyReviewReward: not excluded, not rewarded yet.
              reviewRewardPoints: recipient.loyaltyExcluded || res.reviewRewardApplied ? null : rewardPoints,
            });
          }, 'receipt'));
      }
    } catch (err) {
      logger.error('[email] reservation update email failed', { err: String(err) });
    }
  },
);

// ── 6. Business account approved / rejected ─────────────────────────────────────
export const emailBtobDecision = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION, secrets: [BREVO_API_KEY] },
  async event => {
    try {
      const before = event.data?.before.data();
      const afterSnap = event.data?.after;
      const after = afterSnap?.data();
      if (!before || !after || !afterSnap || before.btobStatus === after.btobStatus) return;
      const uid = event.params.uid;
      if (after.btobStatus === 'approved') {
        // Deposit line/preheader depend on the configured business deposit %.
        const loyalty = (await db().collection('config').doc('loyalty').get()).data();
        const pct = loyalty?.depositPercentByType?.business;
        const showVat = (await getVatPercent()) != null;
        await claimAndSend([afterSnap.ref], 'emailBtobApproved', () =>
          deliver(uid, null, (name, shop, recipient) => btobApprovedEmail(name, shop, {
            firstName: recipient.firstName,
            businessDepositPercent: typeof pct === 'number' ? pct : null,
            showVat,
          }), 'btob-approved'));
      } else if (after.btobStatus === 'rejected') {
        // A: fixable (resubmit from the app) / B: final — chosen from btobRejectionFixable.
        await claimAndSend([afterSnap.ref], 'emailBtobRejected', () =>
          deliver(uid, null, (name, shop, recipient) => btobRejectedEmail(name, shop, {
            firstName: recipient.firstName,
            reason: isBtobRejectionKey(after.btobRejectionReason) ? after.btobRejectionReason : null,
            text: typeof after.btobRejectionText === 'string' ? after.btobRejectionText : null,
            fixable: after.btobRejectionFixable === true,
          }), `btob-rejected-${after.btobRejectionFixable === true ? 'fixable' : 'final'}`));
      }
    } catch (err) {
      logger.error('[email] btob decision email failed', { err: String(err) });
    }
  },
);

/** Adds product data the cancellation email needs (category for "similar", isPremium for the policy tiers). */
async function withProductInfo(items: ResData[]): Promise<ResData[]> {
  const ids = [...new Set(items.map(r => r.productId).filter((x): x is string => !!x))];
  if (ids.length === 0) return items;
  const snaps = await db().getAll(...ids.map(id => db().collection('products').doc(id)));
  const byId = new Map(snaps.map(s => [s.id, s.data() ?? {}]));
  return items.map(r => {
    const p = byId.get(r.productId ?? '') ?? {};
    return { ...r, isPremium: p.isPremium === true, categoryId: typeof p.category === 'string' ? p.category : undefined };
  });
}

/** Adds each product's "What's included" list (products/{id}.whatsIncluded) for display. */
async function withIncluded(items: ResData[]): Promise<ResData[]> {
  const ids = [...new Set(items.map(r => r.productId).filter((x): x is string => !!x))];
  if (ids.length === 0) return items;
  const snaps = await db().getAll(...ids.map(id => db().collection('products').doc(id)));
  const included = new Map(snaps.map(s => [s.id, (s.get('whatsIncluded') as unknown[] | undefined)
    ?.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) ?? []]));
  return items.map(r => ({ ...r, included: included.get(r.productId ?? '') ?? [] }));
}

// ── 2 + 3. Day-before reminders — 18:00 Vientiane (UTC+7, no DST) ───────────────
const VIENTIANE_OFFSET_MS = 7 * 60 * 60 * 1000;

function tomorrowWindowVientiane(nowMs = Date.now()): { start: number; end: number } {
  const local = new Date(nowMs + VIENTIANE_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - VIENTIANE_OFFSET_MS;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

async function sendReminders(
  statuses: string[],
  timeField: 'pickupAt' | 'returnAt',
  field: 'emailPickupReminder' | 'emailReturnReminder',
  build: (name: string, items: ResData[], shop: EmailShop, recipient: Recipient) => Rendered,
  tag: string,
  enrich?: (items: ResData[]) => Promise<ResData[]>,
): Promise<void> {
  const { start, end } = tomorrowWindowVientiane();
  // Equality-only query, date filtered in code — no composite index (see CLAUDE.md).
  const snap = await db().collection('reservations').where('status', 'in', statuses).get();
  const due = snap.docs.filter(d => {
    const t: admin.firestore.Timestamp | undefined = d.get(timeField);
    return t && t.toMillis() >= start && t.toMillis() < end && !d.get(field)?.status;
  });
  // One email per order (a bag order's lines share pickup/return times).
  const groups = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  for (const d of due) {
    const key = `${d.get('renterId')}|${d.get('orderId') ?? d.id}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  for (const docs of groups.values()) {
    const renterId: string = docs[0].get('renterId');
    await claimAndSend(docs.map(d => d.ref), field, async claimed => {
      const ids = new Set(claimed.map(r => r.id));
      let items = docs.filter(d => ids.has(d.id)).map(asRes).sort((a, b) => a.id.localeCompare(b.id));
      if (enrich) items = await enrich(items);
      return deliver(renterId, docs[0].get('renterName'), (name, shop, recipient) => build(name, items, shop, recipient), tag, { respectOptOut: true });
    });
  }
}

export const emailDailyReminders = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Asia/Vientiane', region: REGION, secrets: [BREVO_API_KEY] },
  async () => {
    try {
      const rates = await getRates();
      await sendReminders(['pending_payment', 'confirmed'], 'pickupAt', 'emailPickupReminder',
        (name, items, shop) => pickupReminderEmail(name, items, shop, rates), 'pickup-reminder');
    } catch (err) {
      logger.error('[email] pickup reminders failed', { err: String(err) });
    }
    try {
      await sendReminders(['active'], 'returnAt', 'emailReturnReminder', returnReminderEmail, 'return-reminder', withIncluded);
    } catch (err) {
      logger.error('[email] return reminders failed', { err: String(err) });
    }
    try {
      await sendReviewFollowUps();
    } catch (err) {
      logger.error('[email] review follow-ups failed', { err: String(err) });
    }
  },
);

// ── Review follow-up: ONE gentle email ~2 days after return, if not reviewed yet ──
// Runs with the daily 18:00 job. Window = returns 48–72h ago, so each reservation is
// considered exactly once. Never more than one (emailReviewFollowUp claim), skipped
// when the renter already reviewed the product or opted out of reminder emails.
async function sendReviewFollowUps(): Promise<void> {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const snap = await db().collection('reservations').where('status', '==', 'returned').get();
  const due = snap.docs.filter(d => {
    const t: admin.firestore.Timestamp | undefined = d.get('returnedAt') ?? d.get('returnAt');
    const age = t ? now - t.toMillis() : -1;
    return age >= 2 * DAY && age < 3 * DAY && !d.get('emailReviewFollowUp')?.status && !!d.get('productId');
  });
  const rewardPoints = due.length ? await getReviewRewardPoints() : 0;
  for (const d of due) {
    const r = asRes(d);
    const renterId: string = d.get('renterId');
    if (await hasReviewed(r.productId, renterId)) continue;
    await claimAndSend([d.ref], 'emailReviewFollowUp', () =>
      deliver(renterId, d.get('renterName'), (name, shop, recipient) => reviewFollowUpEmail(name, r, shop, {
        firstName: recipient.firstName,
        reviewRewardPoints: recipient.loyaltyExcluded || r.reviewRewardApplied ? null : rewardPoints,
      }), 'review-follow-up', { respectOptOut: true }));
  }
}

// ── 7. Late returns — called from lateReturnAlerts, ONE email per order and run ──
// Idempotency comes from that function's own lateAlert* flags. `lines` are the order's
// late reservations with the fee just computed by computeLatePenalty. Never throws.
export async function sendLateReturnEmail(
  renterId: string,
  stage: LateEmailStage,
  orderId: string,
  lines: { snap: admin.firestore.DocumentSnapshot; stage: LateEmailStage; amountLak: number; days: number }[],
  holdActive: boolean,
): Promise<void> {
  try {
    const late: LateLine[] = lines.map(l => ({
      r: { ...asRes(l.snap), latePenaltyAmount: l.amountLak, latePenaltyDays: l.days },
      stage: l.stage,
    }));
    const result = await deliver(renterId, lines[0]?.snap.get('renterName') as string | undefined,
      (name, shop, recipient) => lateReturnEmail(name, stage, late, shop, { firstName: recipient.firstName, orderId, holdActive }),
      `late-${stage}`);
    if (result !== 'sent') logger.warn('[email] late-return email not sent', { orderId, stage, result });
  } catch (err) {
    logger.error('[email] late-return email failed', { orderId, err: String(err) });
  }
}

// ── 8. Identity / residency — called by identity.ts and residency.ts ────────────
// Idempotency is the caller's job (ID verified: once per document version). Respects
// the test/redirect mode like every account email. Never throws.
export async function sendAccountEmail(
  uid: string,
  build: (shop: EmailShop, recipient: Recipient) => Rendered,
  tag: string,
): Promise<SendResult | 'opted_out' | 'error'> {
  try {
    const result = await deliver(uid, null, (_name, shop, recipient) => build(shop, recipient), tag);
    if (result !== 'sent') logger.warn('[email] account email not sent', { uid, tag, result });
    return result;
  } catch (err) {
    logger.error('[email] account email failed', { uid, tag, err: String(err) });
    return 'error';
  }
}

export { idVerifiedEmail, idDeclinedEmail, residencyApprovedEmail, residencyRejectedEmail, residencyExpiredEmail, welcomeEmail };

// ── Test path: every template with sample data, to the test inbox ───────────────
// (config/emailSettings.redirectAllTo, or DEFAULT_TEST_REDIRECT when empty) — never
// to the calling admin's own address, and regardless of live/test mode.
export const sendTestEmails = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const isAdmin = (await db().collection('admins').doc(uid).get()).exists;
    if (!isAdmin) throw new HttpsError('permission-denied', 'Admins only.');
    const [shop, vat, mode, rates] = await Promise.all([getEmailShop(), getVatPercent(), getEmailMode(), getRates()]);
    const to = mode.redirectTo;
    const name = String(request.auth?.token.name ?? '').split(' ')[0] || 'there';
    const DAY = 24 * 60 * 60 * 1000;
    // Sat 24 Oct 2026 10:00 Vientiane = 03:00 UTC (sample data only).
    const pickupAtMs = Date.UTC(2026, 9, 24, 3, 0);
    const base: ResData = {
      id: 'LNC-261020-TEST_1', orderId: 'LNC-261020-TEST', productName: 'Camping tent (4 people)', quantity: 1,
      pickupLabel: 'Sat, 24 Oct · 10:00', returnLabel: 'Mon, 26 Oct · 10:00',
      pickupAtMs, returnAtMs: pickupAtMs + 2 * DAY, pricePerDay: 150000, durationDays: 2,
      subtotal: 300000, total: 270000, deposit: 500000, couponApplied: { percent: 10, discountAmount: 30000 },
    };
    const second: ResData = {
      ...base, id: 'LNC-261020-TEST_2', productName: 'Portable speaker', quantity: 2,
      pricePerDay: 30000, subtotal: 120000, total: 108000, deposit: 200000, couponApplied: { percent: 10, discountAmount: 12000 },
    };
    const otherDates: ResData = {
      ...second, id: 'LNC-261020-TEST_3', productName: 'Electric drill', quantity: 1,
      pickupAtMs: pickupAtMs + DAY, returnAtMs: pickupAtMs + 4 * DAY, pricePerDay: 40000, durationDays: 3,
      pickupLabel: 'Sun, 25 Oct · 10:00', returnLabel: 'Wed, 28 Oct · 10:00',
      subtotal: 120000, total: 120000, deposit: 150000, couponApplied: null,
    };
    // Sample amounts follow the real rules: 150,000 LAK/day × 1 → 30h late = 1.5 rental
    // days = 225,000 LAK (computeLatePenalty, rounded up to 1,000 LAK).
    const returnedAtMs = base.returnAtMs + 12 * 60 * 1000;
    // A real catalogue photo for the review samples (public product image URL), if any.
    const sampleImage = (await db().collection('products').limit(10).get()).docs
      .map(d => (d.get('images') as unknown[] | undefined)?.[0])
      .find((u): u is string => typeof u === 'string' && u.startsWith('https://')) ?? null;
    const closedClean: ResData = {
      ...base, productId: 'sample-tent', productImage: sampleImage, couponApplied: null, total: 300000, chargeCurrency: 'LAK', returnedAtMs,
      handoverChecklist: { depositAmount: 500000, depositCurrency: 'LAK' },
      depositAppliedToCharge: 0, outstandingBalance: 0,
    };
    const closedLate: ResData = {
      ...closedClean, returnedAtMs: base.returnAtMs + 30 * 60 * 60 * 1000,
      latePenaltyAmount: 225000, latePenaltyDays: 1.5,
      lateChargeAmount: 225000, lateChargeReason: 'Returned 30h late', depositAppliedToCharge: 225000,
    };
    // Late samples: 150,000 LAK/day → 1 / 1.5 / 2 rental days (computeLatePenalty);
    // speaker 30,000 × 1.5 × 2 = 90,000 LAK. Deposit as held at handover.
    const late = (r: ResData, amount: number, days: number): ResData => ({
      ...r, latePenaltyAmount: amount, latePenaltyDays: days,
      handoverChecklist: { depositAmount: r.deposit, depositCurrency: 'LAK' },
    });
    const lateCtx = { firstName: name, orderId: 'LNC-261020-TEST', holdActive: true };
    const sampleLoyalty = { earned: 30, toNext: 120, nextTier: 'gold' as const, isTop: false };
    const samples: [string, Rendered][] = [
      ['booking-confirmation',             bookingConfirmationEmail(name, 'LNC-261020-TEST', [base, second], shop, vat)],
      ['booking-confirmation-mixed-dates', bookingConfirmationEmail(name, 'LNC-261020-TEST', [base, otherDates], shop, vat)],
      ['pickup-reminder',                  pickupReminderEmail(name, [base, second], shop, rates)],
      ['pickup-reminder-mixed-dates',      pickupReminderEmail(name, [base, otherDates], shop, rates)],
      ['return-reminder',                  returnReminderEmail(name, [
        { ...base, included: ['Tent body', 'Rain fly', '8 pegs', 'Carry bag'] },
        { ...second, included: [] },
      ], shop, { loyaltyExcluded: false })],
      ['return-reminder-mixed-dates',      returnReminderEmail(name, [base, otherDates], shop, { loyaltyExcluded: false })],
      ['cancellation-A-nothing-to-pay',    cancellationEmail(name, [base, second], shop, { variant: 'A', stillReserved: [] })],
      ['cancellation-A-store-credit',      cancellationEmail(name, [{
        ...base, couponApplied: null, advancePaidLak: 108000, // sample only — no advance exists today
        cancelledAtMs: base.pickupAtMs - 36 * 60 * 60 * 1000,
      }], shop, { variant: 'A', stillReserved: [] })],
      ['cancellation-B-partial',           cancellationEmail(name, [{ ...base, productId: 'sample', categoryId: 'outdoor' }], shop, {
        variant: 'B', reason: 'item_unavailable', reasonText: null, stillReserved: [second],
      })],
      ['no-show',                          noShowEmail(name, [base, second], shop)],
      ['receipt-A-no-charges',             receiptEmail(name, closedClean, vat, shop, { firstName: name, alreadyReviewed: false, loyalty: sampleLoyalty, reviewRewardPoints: 10 })],
      ['receipt-B-late-return',            receiptEmail(name, closedLate, vat, shop, { firstName: name, alreadyReviewed: false, loyalty: sampleLoyalty, reviewRewardPoints: 10 })],
      ['receipt-C-late-fee-waived',        receiptEmail(name, {
        ...closedClean, returnedAtMs: base.returnAtMs + 5 * 60 * 60 * 1000, lateChargeWaived: true,
      }, vat, shop, { firstName: name, alreadyReviewed: false, loyalty: sampleLoyalty, reviewRewardPoints: 10 })],
      ['review-follow-up',                 reviewFollowUpEmail(name, closedClean, shop, { firstName: name, reviewRewardPoints: 10 })],
      ['review-follow-up-no-photo',        reviewFollowUpEmail(name, { ...closedClean, productImage: null }, shop, { firstName: null, reviewRewardPoints: null })],
      ['btob-approved',                    btobApprovedEmail(name, shop, { firstName: name, businessDepositPercent: 0, showVat: vat != null })],
      ['btob-rejected-A-fixable',          btobRejectedEmail(name, shop, { firstName: name, reason: 'doc_unreadable', text: 'The photo is blurry on the licence number.', fixable: true })],
      ['btob-rejected-B-final',            btobRejectedEmail(name, shop, { firstName: name, reason: 'not_eligible', text: null, fixable: false })],
      ['late-tier1',                       lateReturnEmail(name, 'tier1', [{ r: late(base, 150000, 1), stage: 'tier1' }], shop, lateCtx)],
      ['late-tier2-two-items',             lateReturnEmail(name, 'tier2', [
        { r: late(base, 225000, 1.5), stage: 'tier2' }, { r: late(second, 90000, 1.5), stage: 'tier2' },
      ], shop, lateCtx)],
      ['late-tier3',                       lateReturnEmail(name, 'tier3', [{ r: late(base, 300000, 2), stage: 'tier3' }], shop, lateCtx)],
      // Non-working sample links (oobCode=SAMPLE) — real ones only come from the callables.
      ['auth-password-reset',              passwordResetEmail('https://lanchai-app.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=SAMPLE', shop)],
      ['auth-email-verification',          emailVerificationEmail('https://lanchai-app.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=SAMPLE', shop)],
      ['welcome',                          welcomeEmail(shop, { firstName: name, residentSavingPct: 30 })],
      ['id-verified',                      idVerifiedEmail(shop, { firstName: name, idRetentionMonths: 6 })],
      ['id-declined',                      idDeclinedEmail(shop, { firstName: name, text: 'The photo is blurry or cut off — please add a sharp photo with all four corners visible.' })],
      ['residency-approved',               residencyApprovedEmail(shop, { firstName: name, validUntilMs: pickupAtMs + 300 * DAY })],
      ['residency-rejected-A-fixable',     residencyRejectedEmail(shop, { firstName: name, reason: 'proof_missing', text: 'The lease contract isn\u2019t in your name.', fixable: true })],
      ['residency-rejected-B-final',       residencyRejectedEmail(shop, { firstName: name, reason: 'not_eligible', text: null, fixable: false })],
      ['residency-expired',                residencyExpiredEmail(shop, { firstName: name })],
      ['late-nonReturn',                   lateReturnEmail(name, 'nonReturn', [{ r: late(base, 300000, 2), stage: 'nonReturn' }], shop, lateCtx)],
    ];
    const results: Record<string, SendResult> = {};
    for (const [tag, mail] of samples) {
      results[tag] = await sendEmail({ to: { email: to, name }, ...mail, subject: `[sample] ${mail.subject}`, tag: `test-${tag}`, bypassRedirect: true }, mode);
    }
    const sent = Object.values(results).filter(r => r === 'sent').length;
    return { to, sent, total: samples.length, results, live: mode.live, redirectTo: mode.redirectTo };
  },
);
