import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { BREVO_API_KEY, REGION } from './config';
import { sendEmail, getEmailMode, type SendResult } from './send';
import { claimEmail, finishEmail, type EmailField } from './claim';
import { getEmailShop, getRecipient, getVatPercent, getRates, type EmailShop } from './context';
import {
  bookingConfirmationEmail, pickupReminderEmail, returnReminderEmail, cancellationEmail,
  receiptEmail, btobApprovedEmail, btobRejectedEmail, lateReturnEmail,
  type ResData, type Rendered, type LateEmailStage,
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
    pricePerDay: d.pricePerDay ?? 0,
    durationDays: d.durationDays ?? 0,
  };
};

async function deliver(
  uid: string,
  fallbackName: string | null | undefined,
  build: (name: string, shop: EmailShop) => Rendered,
  tag: string,
  opts: { respectOptOut?: boolean } = {},
): Promise<SendResult | 'opted_out'> {
  const [recipient, shop] = await Promise.all([getRecipient(uid, fallbackName), getEmailShop()]);
  if (opts.respectOptOut && recipient.remindersOptOut) return 'opted_out';
  if (!recipient.email) return 'no_recipient';
  const mail = build(recipient.name, shop);
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

      // Cancellation. admin_release is a data correction, not a cancellation → no email.
      if (before.status !== 'cancelled' && after.status === 'cancelled' && after.cancelledBy !== 'admin_release') {
        // Group the order's lines cancelled in the same batch (same cancelledAt) into one
        // email; claimEmail's transaction makes concurrent sibling triggers send only once.
        let group = [afterSnap];
        if (after.orderId && after.cancelledAt) {
          const siblings = await db().collection('reservations').where('orderId', '==', after.orderId).get();
          group = siblings.docs.filter(d =>
            d.get('status') === 'cancelled' && d.get('cancelledBy') !== 'admin_release'
            && d.get('cancelledAt')?.isEqual?.(after.cancelledAt));
          if (!group.some(d => d.id === afterSnap.id)) group.push(afterSnap);
        }
        await claimAndSend(group.map(d => d.ref), 'emailCancellation', async claimed => {
          const ids = new Set(claimed.map(r => r.id));
          const items = group.filter(d => ids.has(d.id)).map(asRes).sort((a, b) => a.id.localeCompare(b.id));
          return deliver(renterId, after.renterName, (name, shop) => cancellationEmail(name, items, shop), 'cancellation');
        });
      }

      // End-of-rental receipt — same gate as the in-app receipt screen.
      if (!before.returnFinalizedAt && after.returnFinalizedAt && after.status === 'returned') {
        const vat = await getVatPercent();
        const res = asRes(afterSnap);
        await claimAndSend([afterSnap.ref], 'emailReceipt', () =>
          deliver(renterId, after.renterName, (name, shop) => receiptEmail(name, res, vat, shop), 'receipt'));
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
        await claimAndSend([afterSnap.ref], 'emailBtobApproved', () =>
          deliver(uid, null, (name, shop) => btobApprovedEmail(name, shop), 'btob-approved'));
      } else if (after.btobStatus === 'rejected') {
        const reason = typeof after.btobRejectionReason === 'string' && after.btobRejectionReason.trim()
          ? after.btobRejectionReason.trim() : null;
        await claimAndSend([afterSnap.ref], 'emailBtobRejected', () =>
          deliver(uid, null, (name, shop) => btobRejectedEmail(name, reason, shop), 'btob-rejected'));
      }
    } catch (err) {
      logger.error('[email] btob decision email failed', { err: String(err) });
    }
  },
);

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
  build: (name: string, items: ResData[], shop: EmailShop) => Rendered,
  tag: string,
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
      const items = docs.filter(d => ids.has(d.id)).map(asRes).sort((a, b) => a.id.localeCompare(b.id));
      return deliver(renterId, docs[0].get('renterName'), (name, shop) => build(name, items, shop), tag, { respectOptOut: true });
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
      await sendReminders(['active'], 'returnAt', 'emailReturnReminder', returnReminderEmail, 'return-reminder');
    } catch (err) {
      logger.error('[email] return reminders failed', { err: String(err) });
    }
  },
);

// ── 7. Late returns — called from lateReturnAlerts next to the in-app alert ──────
// Idempotency comes from that function's own lateAlert* flags. Never throws.
export async function sendLateReturnEmail(
  renterId: string,
  stage: LateEmailStage,
  r: { id: string; productName: string; returnLabel: string; renterName?: string | null },
  amountLak: number,
): Promise<void> {
  try {
    const result = await deliver(renterId, r.renterName, (name, shop) => lateReturnEmail(name, stage, r, amountLak, shop), `late-${stage}`);
    if (result !== 'sent') logger.warn('[email] late-return email not sent', { reservationId: r.id, stage, result });
  } catch (err) {
    logger.error('[email] late-return email failed', { reservationId: r.id, err: String(err) });
  }
}

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
    const closed: ResData = {
      ...base, couponApplied: null, total: 300000, chargeCurrency: 'LAK',
      handoverChecklist: { depositAmount: 500000, depositCurrency: 'LAK' },
      lateChargeAmount: 150000, lateChargeReason: 'Returned 30h late', depositAppliedToCharge: 150000, outstandingBalance: 0,
    };
    const samples: [string, Rendered][] = [
      ['booking-confirmation',             bookingConfirmationEmail(name, 'LNC-261020-TEST', [base, second], shop, vat)],
      ['booking-confirmation-mixed-dates', bookingConfirmationEmail(name, 'LNC-261020-TEST', [base, otherDates], shop, vat)],
      ['pickup-reminder',                  pickupReminderEmail(name, [base, second], shop, rates)],
      ['pickup-reminder-mixed-dates',      pickupReminderEmail(name, [base, otherDates], shop, rates)],
      ['return-reminder',                  returnReminderEmail(name, [base], shop)],
      ['cancellation',                     cancellationEmail(name, [base, second], shop)],
      ['receipt',                          receiptEmail(name, closed, vat, shop)],
      ['btob-approved',                    btobApprovedEmail(name, shop)],
      ['btob-rejected',                    btobRejectedEmail(name, 'The registration document is not readable.', shop)],
      ['late-tier1',                       lateReturnEmail(name, 'tier1', base, 300000, shop)],
      ['late-tier2',                       lateReturnEmail(name, 'tier2', base, 450000, shop)],
      ['late-tier3',                       lateReturnEmail(name, 'tier3', base, 600000, shop)],
      ['late-nonReturn',                   lateReturnEmail(name, 'nonReturn', base, 600000, shop)],
    ];
    const results: Record<string, SendResult> = {};
    for (const [tag, mail] of samples) {
      results[tag] = await sendEmail({ to: { email: to, name }, ...mail, subject: `[sample] ${mail.subject}`, tag: `test-${tag}`, bypassRedirect: true }, mode);
    }
    const sent = Object.values(results).filter(r => r === 'sent').length;
    return { to, sent, total: samples.length, results, live: mode.live, redirectTo: mode.redirectTo };
  },
);
