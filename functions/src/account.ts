import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

const REGION = 'asia-southeast1';

// ── syncProductRating ─────────────────────────────────────────────────────────
// products/{id}.averageRating + reviewCount are recomputed here on every review
// create/update/delete — renters can't write products (admin-only rule), so the old
// client-side recompute in submitReview failed for them ("Something went wrong").
export const syncProductRating = onDocumentWritten(
  { document: 'reviews/{productId}/reviews/{reservationId}', region: REGION },
  async event => {
    const productId = event.params.productId;
    const db = admin.firestore();
    try {
      const snap = await db.collection('reviews').doc(productId).collection('reviews').get();
      const ratings = snap.docs
        .map(d => d.get('rating'))
        .filter((r): r is number => typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5);
      const count = ratings.length;
      const avg = count > 0 ? ratings.reduce((s, r) => s + r, 0) / count : null;
      const productRef = db.collection('products').doc(productId);
      if (!(await productRef.get()).exists) return;
      await productRef.update({
        averageRating: avg === null ? admin.firestore.FieldValue.delete() : Math.round(avg * 10) / 10,
        reviewCount: count,
      });
    } catch (err) {
      logger.error('[syncProductRating] failed', { productId, err: String(err) });
    }
  },
);

// ── deleteMyAccount ───────────────────────────────────────────────────────────
// Server-side account deletion (the renter re-authenticates in the app first). Refuses
// while a rental is pending/confirmed/active (same rule as the app screen). Deletes the
// profile and its subcollections (favorites, bag, loyaltyHistory) then the Auth user;
// reservations are kept as business records (Privacy Policy). Server-side so no
// client ever needs to re-create a profile with server-only fields after a failure.
export const deleteMyAccount = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  // Recent sign-in (the app re-authenticates with the password right before calling).
  const authTime = Number(request.auth?.token.auth_time ?? 0) * 1000;
  if (!authTime || Date.now() - authTime > 10 * 60 * 1000) {
    throw new HttpsError('failed-precondition', 'Please confirm your password again.', { code: 'requires-recent-login' });
  }
  const db = admin.firestore();
  const blocking = await db.collection('reservations')
    .where('renterId', '==', uid)
    .where('status', 'in', ['pending_payment', 'confirmed', 'active'])
    .limit(1).get();
  if (!blocking.empty) {
    throw new HttpsError('failed-precondition', 'You still have an active or upcoming rental.', { code: 'has-active-rentals' });
  }
  await db.recursiveDelete(db.collection('users').doc(uid));
  await admin.auth().deleteUser(uid);
  logger.info('[deleteMyAccount] deleted', { uid });
  return { ok: true };
});

// ── resubmitBusinessApplication ───────────────────────────────────────────────
// After a FIXABLE rejection (btobRejectionFixable === true), the renter updates their
// company details / registration document and resubmits: status goes back to
// 'pending_approval' and admins are notified. Server-side because btobStatus and the
// company fields are not renter-writable (firestore.rules allow-list). A final
// rejection can't be resubmitted from the app. The document itself is uploaded by the
// app beforehand (btobDocumentUrl is renter-writable while not approved).
export const resubmitBusinessApplication = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const d = (request.data ?? {}) as Record<string, unknown>;
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const companyName = clean(d.companyName, 120);
  const licenseNumber = clean(d.licenseNumber, 80);
  const responsibleName = clean(d.responsibleName, 120);
  if (!companyName || !licenseNumber || !responsibleName) {
    throw new HttpsError('invalid-argument', 'Please fill in every company field.', { code: 'missing-fields' });
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const p = snap.data() ?? {};
  if (p.accountType !== 'btob' || p.btobStatus !== 'rejected') {
    throw new HttpsError('failed-precondition', 'There is no application to resubmit.', { code: 'not-rejected' });
  }
  if (p.btobRejectionFixable !== true) {
    throw new HttpsError('failed-precondition', 'This application can’t be resubmitted.', { code: 'final-rejection' });
  }
  if (!p.btobDocumentUrl) {
    throw new HttpsError('failed-precondition', 'Please upload your registration document first.', { code: 'document-required' });
  }

  const FieldValue = admin.firestore.FieldValue;
  await userRef.update({
    btobStatus: 'pending_approval',
    btobCompanyName: companyName,
    btobLicenseNumber: licenseNumber,
    btobResponsibleName: responsibleName,
    btobSubmittedAt: FieldValue.serverTimestamp(),
    btobResubmittedAt: FieldValue.serverTimestamp(),
    // Keep the last decision for the admin's context, clear the live rejection fields,
    // and reset the decision-email markers so the NEXT decision emails again.
    btobPreviousRejection: {
      reason: p.btobRejectionReason ?? null,
      text: p.btobRejectionText ?? null,
      reviewedBy: p.btobReviewedBy ?? null,
    },
    btobRejectionReason: FieldValue.delete(),
    btobRejectionText: FieldValue.delete(),
    btobRejectionFixable: FieldValue.delete(),
    emailBtobRejected: FieldValue.delete(),
    emailBtobApproved: FieldValue.delete(),
  });

  const admins = await db.collection('admins').get();
  await Promise.all(admins.docs.map(a =>
    db.collection('notifications').doc(a.id).collection('items').add({
      type: 'account',
      title: 'Business account resubmitted',
      body: `${companyName} updated their application after a rejection — ready for review.`,
      icon: 'briefcase',
      iconColor: 'amber',
      deepLink: `/admin/business-accounts/${uid}`,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }),
  ));
  logger.info('[resubmitBusinessApplication] resubmitted', { uid });
  return { ok: true };
});
