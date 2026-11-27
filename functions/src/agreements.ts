import * as admin from 'firebase-admin';
import { requireRole } from './adminAuth';
import { writeAudit } from './audit';
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

// ── Shared with submitHandover (the Pick-up flow records the agreement in its own
// transaction) ─────────────────────────────────────────────────────────────────

export interface VerifiedPdf { pdfPath: string; buf: Buffer; size: number; pdfSha256: string }

/** The uploaded PDF: right place, really a PDF, not too big → SHA-256 as integrity evidence. */
export async function verifyAgreementPdf(agreementId: string, method: AgreementMethod, orderId: string): Promise<VerifiedPdf> {
  if (!isAgreementIdFor(agreementId, orderId)) fail('invalid-request', 'Invalid agreement.', 'invalid-argument');
  const pdfPath = agreementPdfPath(agreementId, method);
  const file = admin.storage().bucket().file(pdfPath);
  const [exists] = await file.exists();
  if (!exists) fail('missing-pdf', 'The agreement file is missing — please try again.');
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  if (meta.contentType !== 'application/pdf' || size <= 0 || size > MAX_PDF_BYTES) fail('invalid-pdf', 'Invalid agreement file.');
  const [buf] = await file.download();
  return { pdfPath, buf, size, pdfSha256: createHash('sha256').update(buf).digest('hex') };
}

/** The agreement record + its admin-only staff subdocument (batch or transaction). */
export function agreementRecordWrites(
  w: { set: (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, opts?: FirebaseFirestore.SetOptions) => unknown },
  a: { agreementId: string; orderId: string; renterId: string; reservationIds: string[]; method: AgreementMethod; pdf: VerifiedPdf;
    staffUid: string; staffName: string; previous: string[] },
): void {
  const db = admin.firestore();
  const ref = db.collection('rentalAgreements').doc(a.agreementId);
  w.set(ref, {
    orderId: a.orderId, renterId: a.renterId, reservationIds: a.reservationIds, method: a.method,
    pdfPath: a.pdf.pdfPath, pdfSha256: a.pdf.pdfSha256, pdfBytes: a.pdf.size,
    templateVersion: AGREEMENT_TEMPLATE_VERSION,
    termsEffectiveDate: LEGAL_EFFECTIVE_DATE,
    signedAt: FieldValue.serverTimestamp(),
  });
  w.set(ref.collection('internal').doc('audit'), {
    staffUid: a.staffUid, staffName: a.staffName, createdAt: FieldValue.serverTimestamp(),
  });
  for (const p of a.previous) {
    w.set(db.collection('rentalAgreements').doc(p), { supersededAt: FieldValue.serverTimestamp(), supersededBy: a.agreementId }, { merge: true });
  }
}

/** Email the signed PDF as an ATTACHMENT (a Storage link would be a secret URL in an inbox). */
export async function emailAgreement(a: {
  agreementId: string; orderId: string; renterId: string; method: AgreementMethod; buf: Buffer; signedAtMs: number;
  rows: { id: string; data: FirebaseFirestore.DocumentData }[];
}): Promise<boolean> {
  const result = await sendAccountEmail(a.renterId, (shop, recipient) => rentalAgreementEmail(shop, {
    firstName: recipient.firstName || recipient.name || 'there',
    orderLabel: a.orderId,
    items: a.rows.map(r => ({
      name: String(r.data.productName ?? ''),
      quantity: Number(r.data.quantity ?? 1),
      pickupLabel: String(r.data.pickupLabel ?? ''),
      returnLabel: String(r.data.returnLabel ?? ''),
    })),
    signedLabel: vteReservationLabel(a.signedAtMs),
    paper: a.method === 'paper',
    firstReservationId: a.rows[0].id,
    attachment: { name: `LANCHAI-agreement-${a.orderId}.pdf`, content: a.buf.toString('base64') },
  }), 'rental-agreement');
  const emailed = result === 'sent';
  await admin.firestore().collection('rentalAgreements').doc(a.agreementId)
    .set({ emailResult: String(result), ...(emailed ? { emailSentAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  return emailed;
}

// finalizeRentalAgreement — kept for app builds older than the Pick-up flow (2026-11-27),
// which sign the agreement BEFORE calling submitHandover. New builds don't call it.
// { agreementId, reservationIds, method, staffName? } → { agreementId, signedAtMs, emailed }
export const finalizeRentalAgreement = onCall(
  // invoker 'public': Cloud Run lets every request reach the function, which then checks
  // Firebase Auth + admin itself (a missing invoker binding shows as a bare 401/403).
  { region: REGION, secrets: [BREVO_API_KEY], memory: '512MiB', invoker: 'public' },
  async request => {
    const caller = await requireRole(request, 'staff');
    const adminUid = caller.uid;
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
    const ref = db.collection('rentalAgreements').doc(agreementId);
    if ((await ref.get()).exists) fail('already-finalized', 'This agreement is already recorded.');
    const pdf = await verifyAgreementPdf(agreementId, method!, orderId);

    const nowMs = Date.now();
    const staff = typeof d.staffName === 'string' && d.staffName.trim()
      ? d.staffName.trim().slice(0, 80)
      : String(request.auth?.token.name || request.auth?.token.email || 'staff');

    // Earlier agreements of these reservations (a "Sign again") are kept, marked superseded.
    const previous = [...new Set(rows.map(r => r.data.agreementId as string | undefined).filter((x): x is string => !!x))];

    const batch = db.batch();
    agreementRecordWrites(batch, { agreementId, orderId, renterId, reservationIds: ids, method: method!, pdf, staffUid: adminUid, staffName: staff, previous });
    for (const r of rows) {
      batch.update(r.ref, { agreementId, agreementSignedAt: FieldValue.serverTimestamp(), agreementMethod: method });
    }
    await batch.commit();
    logger.info('[agreement] finalized', { agreementId, orderId, method, items: ids.length, bytes: pdf.size });
    await Promise.all(ids.map(rid => writeAudit(caller, { action: 'agreement.signed', reservationId: rid, orderId, note: `${method} · ${agreementId}` })));
    const emailed = await emailAgreement({ agreementId, orderId, renterId, method: method!, buf: pdf.buf, signedAtMs: nowMs, rows });

    return { agreementId, signedAtMs: nowMs, emailed };
  },
);
