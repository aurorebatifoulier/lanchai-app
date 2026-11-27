import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireRole, type AdminCaller } from './adminAuth';
import { auditData, newAuditRef } from './audit';
import { BREVO_API_KEY } from './email/config';
import { canDo } from './shared/reservationMachine';
import { unitsOnHand, effectiveStock, earlyHandoverConflicts, OCCUPYING_STATUSES, type OccupancyRecord } from './shared/availability';
import { isBeforePickupDay, vteDayRange, vteReservationLabel, EARLIER_DAY_HANDOVER_TEXT } from './shared/dates';
import { CHECKLIST_CATEGORY_IDS, CHECKLIST_RATINGS, type ChecklistRating } from './shared/returnCharges';
import {
  buildHandoverQuote, collectFor, parsePickupPayment, rentalPaymentMethodKey, fmtMoney, paymentPartLabel,
  type HandoverQuote, type Rates,
} from './shared/handoverQuote';
import { idCheckNeeded } from './shared/identity';
import type { AgreementMethod } from './shared/rentalAgreement';
import { validateIdFiles, registerIdentityDocument, syncFirstRentalIdFlags, sendIdVerifiedEmailOnce } from './identity';
import { verifyAgreementPdf, agreementRecordWrites, emailAgreement } from './agreements';

// Pick-up (app/admin/pickup.tsx, 4 steps: ID → Condition → Payment → Client signs).
// quoteHandover = the Payment step's figures (shared buildHandoverQuote: the rental and
// deposit FROZEN at booking, in every currency with a rate). submitHandover = the ONLY
// way an item leaves the shop: in ONE transaction it re-checks the state machine, the
// pick-up DAY (an earlier day changes the booking → refused), a unit PHYSICALLY in the
// shop (stock − out with renters − repair − lost − cleaning), the extra hours of a
// same-day early pick-up, the ID check and the quote (`quote-changed` → back to the
// Payment step), then writes the payment (rental and deposit, each in its own currency
// and method), the deposit received, the checklist, the agreement record, the ID check
// and phoneVerified. Notifications / emails after the commit.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
type FailStatus = 'invalid-argument' | 'failed-precondition' | 'not-found';
const fail = (code: string, message: string, status: FailStatus = 'failed-precondition', extra: Record<string, unknown> = {}): never => {
  throw new HttpsError(status, message, { code, ...extra });
};

interface HandoverChecklistInput {
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  accessories?: { name: string; qty: number; handedOver: boolean }[];
}

/** Evidence: at least this many pick-up photos per item, even when everything is Good. */
export const MIN_HANDOVER_PHOTOS = 2;

function parseChecklist(id: string, raw: unknown): HandoverChecklistInput {
  if (raw == null || typeof raw !== 'object') fail('checklist-incomplete', 'Rate every part of the item first.', 'invalid-argument');
  const c = raw as Record<string, unknown>;
  const cats = (c.categories ?? {}) as Record<string, { rating?: unknown; note?: unknown }>;
  const categories: HandoverChecklistInput['categories'] = {};
  for (const k of CHECKLIST_CATEGORY_IDS) {
    const v = cats[k];
    if (!v || !CHECKLIST_RATINGS.includes(v.rating as ChecklistRating)) fail('checklist-incomplete', 'Rate every part of the item first.', 'invalid-argument');
    const note = typeof v!.note === 'string' ? v!.note.trim().slice(0, 500) : '';
    categories[k] = { rating: v!.rating as ChecklistRating, ...(note ? { note } : {}) };
  }
  const photos = Array.isArray(c.photos) ? c.photos.filter((p): p is string => typeof p === 'string') : [];
  if (photos.length > 20 || photos.some(p => p.length > 2000 || !p.includes(`reservations%2F${id}%2Fhandover%2F`))) {
    fail('invalid-photo', 'A photo is not from this pick-up.', 'invalid-argument');
  }
  if (new Set(photos).size < MIN_HANDOVER_PHOTOS) {
    fail('photos-required', `Take at least ${MIN_HANDOVER_PHOTOS} photos of the item at pick-up.`, 'invalid-argument');
  }
  const rawAcc = Array.isArray(c.accessories) ? c.accessories as Record<string, unknown>[] : null;
  if (rawAcc && rawAcc.length > 30) fail('invalid-request', 'Too many accessories.', 'invalid-argument');
  const accessories = rawAcc?.map(a => {
    const name = typeof a?.name === 'string' ? a.name.trim().slice(0, 80) : '';
    const qty = typeof a?.qty === 'number' && Number.isInteger(a.qty) && a.qty >= 1 && a.qty <= 999 ? a.qty : 0;
    if (!name || !qty) fail('invalid-request', 'Invalid accessory.', 'invalid-argument');
    return { name, qty, handedOver: a.handedOver !== false };
  });
  return { categories, photos, ...(accessories ? { accessories } : {}) };
}

function parseIds(raw: unknown): string[] {
  const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  if (ids.length === 0 || ids.length > 20) fail('invalid-request', 'Nothing to hand over.', 'invalid-argument');
  if (new Set(ids).size !== ids.length) fail('invalid-request', 'Duplicate item.', 'invalid-argument');
  return ids;
}

async function readRates(get: (ref: FirebaseFirestore.DocumentReference) => Promise<FirebaseFirestore.DocumentSnapshot>): Promise<Rates> {
  const p = await get(db().doc('config/pricing'));
  const pos = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
  const ms = (k: string) => (p.get(k) as Timestamp | undefined)?.toMillis?.() ?? (p.get('updatedAt') as Timestamp | undefined)?.toMillis?.() ?? null;
  return {
    USD: { rate: pos(p.get('exchangeRate')), setAtMs: ms('exchangeRateUpdatedAt') },
    THB: { rate: pos(p.get('thbToLakRate')), setAtMs: ms('thbToLakRateUpdatedAt') },
  };
}

const toRecord = (x: FirebaseFirestore.DocumentSnapshot): OccupancyRecord => ({
  reservationId: x.id,
  pickupAt: (x.get('pickupAt') as Timestamp | undefined)?.toMillis() ?? 0,
  returnAt: (x.get('returnAt') as Timestamp | undefined)?.toMillis() ?? 0,
  quantity: Math.max(1, Number(x.get('quantity') ?? 1)),
});

/**
 * Every check BEFORE anything leaves the shop (inside the caller's transaction): state
 * machine, same order + renter, pick-up day, unit physically on hand, same-day extra hours.
 */
async function checkPickup(
  tx: FirebaseFirestore.Transaction, ids: string[], caller: AdminCaller, nowMs: number,
): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const snaps = await Promise.all(ids.map(id => tx.get(db().collection('reservations').doc(id))));
  const need = new Map<string, number>();
  for (const s of snaps) {
    if (!s.exists) fail('not-found', 'Booking not found.', 'not-found');
    // State machine: re-read IN the transaction (refused pick-up → owner only, etc.).
    if (!canDo(s.data()!, 'handover', caller.role, 'server')) {
      fail('not-allowed', 'This booking can’t be handed over now (already out, closed, or the pick-up was refused).');
    }
    const pickupMs = (s.get('pickupAt') as Timestamp | undefined)?.toMillis() ?? 0;
    if (isBeforePickupDay(pickupMs, nowMs)) fail('earlier-day', EARLIER_DAY_HANDOVER_TEXT, 'failed-precondition', { reservationId: s.id });
    const pid = String(s.get('productId'));
    need.set(pid, (need.get(pid) ?? 0) + Math.max(1, Number(s.get('quantity') ?? 1)));
  }
  const first = snaps[0];
  const orderOf = (s: FirebaseFirestore.DocumentSnapshot) => String(s.get('orderId') ?? s.id);
  if (snaps.some(s => s.get('renterId') !== first.get('renterId') || orderOf(s) !== orderOf(first))) {
    fail('mixed-order', 'These items aren’t from the same order.');
  }
  for (const [pid, units] of need) {
    const product = await tx.get(db().collection('products').doc(pid));
    const occupying = await tx.get(db().collection('reservations').where('productId', '==', pid).where('status', 'in', OCCUPYING_STATUSES));
    const others = occupying.docs.filter(x => x.get('archived') !== true && !ids.includes(x.id));
    const p = product.data() ?? {};
    const stock = {
      stockLeft: Number(p.stockLeft ?? 0), inRepairUnits: p.inRepairUnits, lostUnits: p.lostUnits,
      pendingSettlementUnits: p.pendingSettlementUnits,
    };
    const name = String(p.name ?? 'This item');
    // 1. Physical check: units in the shop right now.
    const outDocs = others.filter(x => x.get('status') === 'active');
    const outUnits = outDocs.reduce((sum, x) => sum + Math.max(1, Number(x.get('quantity') ?? 1)), 0);
    const onHand = unitsOnHand(stock, outUnits);
    if (onHand < units) {
      const parts = [
        outUnits > 0 ? `${outUnits} out with a renter` : null,
        (p.pendingSettlementUnits ?? 0) > 0 ? `${p.pendingSettlementUnits} cleaning after a return` : null,
        (p.inRepairUnits ?? 0) > 0 ? `${p.inRepairUnits} in repair` : null,
        (p.lostUnits ?? 0) > 0 ? `${p.lostUnits} lost` : null,
      ].filter(Boolean).join(', ');
      fail('no-unit-on-hand',
        `No ${name} in the shop to hand over (stock ${Number(p.stockLeft ?? 0)}${parts ? `: ${parts}` : ''}).`,
        'failed-precondition',
        { productId: pid, onHand, needed: units, outReservationIds: outDocs.map(x => x.id) });
    }
    // 2. Earlier time today: the extra hours must be free for every line of the order.
    const lines = snaps.filter(x => String(x.get('productId')) === pid).map(toRecord);
    const bad = earlyHandoverConflicts({ items: lines, others: others.map(toRecord), totalStock: effectiveStock(stock), nowMs })[0];
    if (bad) {
      const c = bad.conflicts[0];
      fail('booked-by-someone-else',
        c ? `Booked by someone else on ${vteDayRange(c.pickupAt, c.returnAt)} (${name}).` : `Booked by someone else before this pick-up (${name}).`,
        'failed-precondition',
        { productId: pid, reservationId: bad.reservationId, conflictIds: bad.conflicts.map(x => x.reservationId) });
    }
  }
  return snaps;
}

const quoteOf = (snaps: FirebaseFirestore.DocumentSnapshot[], rates: Rates): HandoverQuote =>
  buildHandoverQuote(snaps.map(s => ({ ...(s.data() as Record<string, unknown>), reservationId: s.id })), rates);

// quoteHandover({ ids }) → HandoverQuote — the Payment step (nothing is written).
export const quoteHandover = onCall({ region: REGION, invoker: 'public' }, async request => {
  const caller = await requireRole(request, 'staff');
  const ids = parseIds(((request.data ?? {}) as { ids?: unknown }).ids);
  const nowMs = Date.now();
  return db().runTransaction(async tx => {
    const snaps = await checkPickup(tx, ids, caller, nowMs);
    return quoteOf(snaps, await readRates(ref => tx.get(ref)));
  });
});

type IdCheckInput = { matchesPerson?: unknown; nameMatches?: unknown; counterPhoto?: { docType?: unknown; files?: unknown } } | null;

// submitHandover({ items: [{ reservationId, checklist }], payment: { rental, deposit },
//   quote: { rental, deposit }, idCheck?, phoneVerified, agreement: { id, method } })
//   → { ok, collected: { rental, deposit } }
export const submitHandover = onCall({ region: REGION, invoker: 'public', secrets: [BREVO_API_KEY], memory: '512MiB' }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as Record<string, unknown>;
  // Builds older than the Pick-up flow sent no payment / agreement: refuse clearly.
  if (d.payment == null || d.agreement == null) fail('update-app', 'Update the app to hand over (new pick-up flow).');
  const raw = Array.isArray(d.items) ? d.items as Record<string, unknown>[] : [];
  const ids = parseIds(raw.map(x => x?.reservationId));
  const checklists = new Map(raw.map(x => [String(x.reservationId), parseChecklist(String(x.reservationId), x.checklist)]));
  const payment = parsePickupPayment(d.payment) ?? fail('invalid-request', 'Choose how the client paid.', 'invalid-argument');
  const shown = (d.quote ?? {}) as { rental?: unknown; deposit?: unknown };
  const ag = (d.agreement ?? {}) as { id?: unknown; method?: unknown };
  const agreementId = typeof ag.id === 'string' ? ag.id : '';
  const method: AgreementMethod = ag.method === 'paper' ? 'paper' : ag.method === 'signature' ? 'signature'
    : fail('invalid-request', 'The client must sign the agreement.', 'invalid-argument');
  if (!agreementId) fail('invalid-request', 'The client must sign the agreement.', 'invalid-argument');
  const idIn = (d.idCheck ?? null) as IdCheckInput;

  // Reads + checks that can't run in a transaction: the agreement PDF, the counter ID photo.
  const head = await db().collection('reservations').doc(ids[0]).get();
  if (!head.exists) fail('not-found', 'Booking not found.', 'not-found');
  const renterId = String(head.get('renterId'));
  const orderId = String(head.get('orderId') ?? head.id);
  if ((await db().collection('rentalAgreements').doc(agreementId).get()).exists) fail('already-finalized', 'This agreement is already recorded.');
  const pdf = await verifyAgreementPdf(agreementId, method, orderId);
  if (idIn?.counterPhoto) {
    if (idIn.matchesPerson !== true || idIn.nameMatches !== true) fail('confirmations-required', 'Both ID checks must be confirmed.', 'invalid-argument');
    const files = await validateIdFiles(renterId, idIn.counterPhoto.files);
    await registerIdentityDocument(renterId, { docType: idIn.counterPhoto.docType, files, source: 'counter' });
  }

  const nowMs = Date.now();
  let collected = { rental: 0, deposit: 0 };
  let checkedVersion: number | null = null;
  let rows: { id: string; data: FirebaseFirestore.DocumentData }[] = [];

  await db().runTransaction(async tx => {
    checkedVersion = null;
    const snaps = await checkPickup(tx, ids, caller, nowMs);
    const [rates, userSnap, idSnap] = await Promise.all([
      readRates(ref => tx.get(ref)),
      tx.get(db().collection('users').doc(renterId)),
      tx.get(db().collection('identityChecks').doc(renterId)),
    ]);
    // What the client saw must still be true (a rate may have changed since).
    const q = quoteOf(snaps, rates);
    const due = collectFor(q, payment);
    if (!due || Number(shown.rental) !== due.rental || Number(shown.deposit) !== due.deposit) {
      throw new HttpsError('failed-precondition', 'The amounts changed — check the payment again.', { code: 'quote-changed', quote: q });
    }
    collected = due;
    // ID: first pick-up of the CURRENT document → both confirmations + a document on file.
    if (idCheckNeeded(userSnap.data())) {
      if (idIn?.matchesPerson !== true || idIn?.nameMatches !== true) fail('id-check-required', 'Check the client’s ID first.');
      if (idSnap.get('status') !== 'on_file' || typeof idSnap.get('version') !== 'number') fail('no-document', 'Take a photo of the ID first.');
      checkedVersion = idSnap.get('version') as number;
    }

    const rentalFig = q.currencies[payment.rental.currency]!;
    const depositFig = q.currencies[payment.deposit.currency]!;
    rows = snaps.map(s => ({ id: s.id, data: s.data()! }));
    const previous = [...new Set(rows.map(r => r.data.agreementId as string | undefined).filter((x): x is string => !!x))];
    agreementRecordWrites(tx, {
      agreementId, orderId, renterId, reservationIds: ids, method, pdf,
      staffUid: caller.uid, staffName: caller.name, previous,
    });

    snaps.forEach((s, i) => {
      const r = s.data()!;
      const pickupMs = (r.pickupAt as Timestamp | undefined)?.toMillis() ?? 0;
      const early = pickupMs > nowMs; // earlier time, same day (an earlier day was refused)
      const auditRef = newAuditRef();
      const rentalAmount = rentalFig.rentalPerLine[i];
      const depositAmount = depositFig.depositPerLine[i];
      tx.update(s.ref, {
        status: 'active',
        handoverChecklist: {
          ...checklists.get(s.id)!,
          // What returns read (depositHeldOf): the deposit in ITS OWN currency.
          depositCurrency: payment.deposit.currency,
          depositAmount,
          rentalPaymentMethod: rentalPaymentMethodKey(payment.rental),
          confirmedByName: caller.name,
          confirmedByRole: caller.role,
          clientConfirmed: true,
          confirmedAt: FieldValue.serverTimestamp(),
        },
        handoverPayment: {
          rental: {
            currency: payment.rental.currency, method: payment.rental.method, amount: rentalAmount,
            rate: rentalFig.rate, rateSetAtMs: rentalFig.rateSetAtMs, amountLak: q.lines[i].rentalLak,
          },
          deposit: {
            currency: payment.deposit.currency, method: payment.deposit.method, amount: depositAmount,
            rate: depositFig.rate, rateSetAtMs: depositFig.rateSetAtMs, amountLak: q.lines[i].depositLak,
          },
          orderTotals: { rental: collected.rental, deposit: collected.deposit },
          collectedBy: { uid: caller.uid, name: caller.name, role: caller.role },
        },
        agreementId, agreementSignedAt: FieldValue.serverTimestamp(), agreementMethod: method,
        // The calendar blocks from the real handover time; the booked time is kept.
        ...(early ? {
          pickupAt: Timestamp.fromMillis(nowMs),
          pickupLabel: vteReservationLabel(nowMs),
          earlyHandoverPlannedAt: r.pickupAt,
        } : {}),
        pickupRefusedOpen: false,
        lastAction: 'handover',
        lastAuditId: auditRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, auditData(caller, {
        action: 'handover', reservationId: s.id, orderId: r.orderId, productId: r.productId, renterId,
        note: [
          `rental ${fmtMoney(rentalAmount, payment.rental.currency)} · ${paymentPartLabel(payment.rental)}`,
          `deposit ${fmtMoney(depositAmount, payment.deposit.currency)} · ${paymentPartLabel(payment.deposit)}`,
          `agreement ${method}`,
          early ? `picked up early (planned ${vteReservationLabel(pickupMs)})` : null,
        ].filter(Boolean).join(' · '),
      }));
    });
    const userFields = {
      ...(d.phoneVerified === true ? { phoneVerified: true } : {}),
      ...(checkedVersion != null ? { idCheckedVersion: checkedVersion, idCheckedAt: FieldValue.serverTimestamp(), idCheckedBy: caller.name } : {}),
    };
    if (Object.keys(userFields).length) tx.set(db().collection('users').doc(renterId), userFields, { merge: true });
    if (checkedVersion != null) {
      tx.set(newAuditRef(), auditData(caller, {
        action: 'id.checked', renterId,
        note: `version ${checkedVersion}${idIn?.counterPhoto ? ' · photo taken at the counter' : ''} · at pick-up`,
      }));
    }
  });
  logger.info('[handover] submitted', { by: caller.uid, role: caller.role, items: ids.length, agreementId });

  // After the commit: a failed email / notification never undoes a pick-up.
  const notifs = db().collection('notifications').doc(renterId).collection('items');
  await Promise.all(rows.map(r => notifs.add({
    type: 'rental', icon: 'box', iconColor: 'carbon', title: 'Rental started',
    body: `You've picked up the ${r.data.productName}. Return by ${r.data.returnLabel}.`,
    deepLink: `/rentals/${r.id}`, createdAt: FieldValue.serverTimestamp(), readAt: null,
  }))).catch(err => logger.error('[handover] notification failed', { err: String(err) }));
  const version = checkedVersion as number | null;
  if (version != null) {
    await syncFirstRentalIdFlags(renterId).catch(err => logger.error('[handover] id flags', { err: String(err) }));
    await sendIdVerifiedEmailOnce(renterId, version).catch(err => logger.error('[handover] id email', { err: String(err) }));
  }
  const emailed = await emailAgreement({ agreementId, orderId, renterId, method, buf: pdf.buf, signedAtMs: nowMs, rows })
    .catch(err => { logger.error('[handover] agreement email', { err: String(err) }); return false; });
  // For the "Picked up" screen: where the agreement went (the account's own address).
  const email = await admin.auth().getUser(renterId).then(u => u.email ?? null).catch(() => null);
  return { ok: true, collected, emailed, email };
});
