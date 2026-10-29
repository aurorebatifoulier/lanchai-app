import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { BREVO_API_KEY } from './email/config';
import { sendAccountEmail, rentalAgreementEmail } from './email/triggers';
import { vteReservationLabel } from './shared/dates';
import { PRE_PICKUP_STATUSES } from './shared/identity';
import { LEGAL_EFFECTIVE_DATE } from './shared/legal';
import {
  AGREEMENT_TEMPLATE_VERSION, agreementPdfPath, isAgreementIdFor, type AgreementMethod,
} from './shared/rentalAgreement';

// Rental agreement signed at pick-up — see functions/src/shared/rentalAgreement.ts.
// The app builds the PDF (signature or photos of the paper form) and uploads it to
// rentalAgreements/{agreementId}/; this callable makes it official: checks the file and
// the reservations, stamps the server time + SHA-256 of the PDF, links the reservations,
// keeps the staff name in an admin-only subdocument, then emails the PDF to the renter.
// Business record: never deleted (not part of the ID-document retention).

const REGION = 'asia-southeast1';
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'unauthenticated' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};

async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const isAdmin = (await admin.firestore().collection('admins').doc(uid!).get()).exists;
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admins only.', { code: 'admins-only' });
  return uid!;
}

// { agreementId, reservationIds, method, staffName? } → { agreementId, signedAtMs, emailed }
export const finalizeRentalAgreement = onCall(
  { region: REGION, secrets: [BREVO_API_KEY], memory: '512MiB' },
  async request => {
    const adminUid = await requireAdmin(request.auth?.uid);
    const d = (request.data ?? {}) as { agreementId?: unknown; reservationIds?: unknown; method?: unknown; staffName?: unknown };
    const agreementId = typeof d.agreementId === 'string' ? d.agreementId : '';
    const method: AgreementMethod | null = d.method === 'signature' || d.method === 'paper' ? d.method : null;
    const ids = Array.isArray(d.reservationIds) ? [...new Set(d.reservationIds.filter((x): x is string => typeof x === 'string'))] : [];
    if (!agreementId || !method || ids.length === 0 || ids.length > 30) fail('invalid-request', 'Invalid agreement.', 'invalid-argument');

    const db = admin.firestore();
    const snaps = await Promise.all(ids.map(id => db.collection('reservations').doc(id).get()));
    if (snaps.some(s => !s.exists)) fail('not-found', 'A reservation is missing.');
    const rows = snaps.map(s => ({ ref: s.ref, id: s.id, data: s.data()! }));
    const renterId = rows[0].data.renterId as string;
    const orderId = (rows[0].data.orderId as string | undefined) ?? rows[0].id;
    if (rows.some(r => r.data.renterId !== renterId || ((r.data.orderId as string | undefined) ?? r.id) !== orderId)) {
      fail('mixed-order', 'These items aren’t from the same order.');
    }
    if (rows.some(r => !(PRE_PICKUP_STATUSES as readonly string[]).includes(r.data.status))) {
      fail('not-pre-pickup', 'The agreement is signed before the handover is completed.');
    }
    if (!isAgreementIdFor(agreementId, orderId)) fail('invalid-request', 'Invalid agreement.', 'invalid-argument');
    const ref = db.collection('rentalAgreements').doc(agreementId);
    if ((await ref.get()).exists) fail('already-finalized', 'This agreement is already recorded.');

    // The PDF: right place, really a PDF, not too big → SHA-256 as integrity evidence.
    const pdfPath = agreementPdfPath(agreementId, method!);
    const file = admin.storage().bucket().file(pdfPath);
    const [exists] = await file.exists();
    if (!exists) fail('missing-pdf', 'The agreement file is missing — please try again.');
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    if (meta.contentType !== 'application/pdf' || size <= 0 || size > MAX_PDF_BYTES) fail('invalid-pdf', 'Invalid agreement file.');
    const [buf] = await file.download();
    const pdfSha256 = createHash('sha256').update(buf).digest('hex');

    const nowMs = Date.now();
    const staff = typeof d.staffName === 'string' && d.staffName.trim()
      ? d.staffName.trim().slice(0, 80)
      : String(request.auth?.token.name || request.auth?.token.email || 'staff');

    // Earlier agreements of these reservations (a "Sign again") are kept, marked superseded.
    const previous = [...new Set(rows.map(r => r.data.agreementId as string | undefined).filter((x): x is string => !!x))];

    const batch = db.batch();
    batch.set(ref, {
      orderId, renterId, reservationIds: ids, method, pdfPath, pdfSha256, pdfBytes: size,
      templateVersion: AGREEMENT_TEMPLATE_VERSION,
      termsEffectiveDate: LEGAL_EFFECTIVE_DATE,
      signedAt: FieldValue.serverTimestamp(),
    });
    batch.set(ref.collection('internal').doc('audit'), {
      staffUid: adminUid, staffName: staff, createdAt: FieldValue.serverTimestamp(),
    });
    for (const p of previous) {
      batch.set(db.collection('rentalAgreements').doc(p), { supersededAt: FieldValue.serverTimestamp(), supersededBy: agreementId }, { merge: true });
    }
    for (const r of rows) {
      batch.update(r.ref, { agreementId, agreementSignedAt: FieldValue.serverTimestamp(), agreementMethod: method });
    }
    await batch.commit();
    logger.info('[agreement] finalized', { agreementId, orderId, method, items: ids.length, bytes: size });

    // Email the PDF (attachment — a Storage link would be a secret URL in an inbox).
    const orderLabel = orderId;
    const result = await sendAccountEmail(renterId, (shop, recipient) => rentalAgreementEmail(shop, {
      firstName: recipient.firstName || recipient.name || 'there',
      orderLabel,
      items: rows.map(r => ({
        name: String(r.data.productName ?? ''),
        quantity: Number(r.data.quantity ?? 1),
        pickupLabel: String(r.data.pickupLabel ?? ''),
        returnLabel: String(r.data.returnLabel ?? ''),
      })),
      signedLabel: vteReservationLabel(nowMs),
      paper: method === 'paper',
      firstReservationId: rows[0].id,
      attachment: { name: `LANCHAI-agreement-${orderLabel}.pdf`, content: buf.toString('base64') },
    }), 'rental-agreement');
    const emailed = result === 'sent';
    await ref.set({ emailResult: String(result), ...(emailed ? { emailSentAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });

    return { agreementId, signedAtMs: nowMs, emailed };
  },
);
