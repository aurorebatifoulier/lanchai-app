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
