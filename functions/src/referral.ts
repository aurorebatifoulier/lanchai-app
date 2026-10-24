import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { isLoyaltyExcluded } from './shared/loyalty';

// Referral programme — invite codes (inviteCodes/{code} → uid, users.inviteCode) and
// links (users.referredBy + referrals/{referredUid}), all server-written (rules deny
// clients). The reward itself (both sides, after the referred renter's FIRST returned
// rental) is credited by applyLoyaltyPoints → creditReferralIfAny (functions/src/index.ts).

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'unauthenticated' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};

const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** "Aurore" → "AURORE"; accents stripped, letters only, 8 max; fallback LANCHAI. */
function codeStem(firstName: unknown): string {
  const stem = String(firstName ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
  return stem.length >= 2 ? stem : 'LANCHAI';
}

const normalizeCode = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

// ── getMyInviteCode() — creates the renter's code on first request ──────────────
export const getMyInviteCode = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const userRef = db().collection('users').doc(uid!);
  const user = (await userRef.get()).data() ?? {};
  if (isLoyaltyExcluded(user)) fail('not-eligible', 'Business accounts aren’t part of the referral programme.');
  if (typeof user.inviteCode === 'string' && user.inviteCode) return { code: user.inviteCode };

  const stem = codeStem(user.firstName || String(user.displayName ?? '').split(' ')[0]);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Array.from({ length: 3 }, () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)]).join('');
    const code = `${stem}-${suffix}`;
    const created = await db().runTransaction(async tx => {
      const [codeSnap, freshUser] = await Promise.all([tx.get(db().collection('inviteCodes').doc(code)), tx.get(userRef)]);
      if (freshUser.get('inviteCode')) return freshUser.get('inviteCode') as string;
      if (codeSnap.exists) return null;
      tx.set(codeSnap.ref, { uid, createdAt: FieldValue.serverTimestamp() });
      tx.set(userRef, { inviteCode: code }, { merge: true });
      return code;
    });
    if (created) return { code: created };
  }
  return fail('internal', 'Could not create your code. Please try again.');
});

// ── applyInviteCode({ code }) — a new renter, before their first booking ─────────
// Checks: code exists; not their own (uid, phone or email); no booking ever created
// (even cancelled); no referrer yet; neither side excluded (business / BtoB).
export const applyInviteCode = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const code = normalizeCode((request.data as { code?: unknown } | undefined)?.code);
  if (!/^[A-Z]{2,8}-[A-Z0-9]{3}$/.test(code)) fail('invalid-code', 'This invite code doesn’t exist.', 'invalid-argument');

  const [userSnap, codeSnap, bookings] = await Promise.all([
    db().collection('users').doc(uid!).get(),
    db().collection('inviteCodes').doc(code).get(),
    db().collection('reservations').where('renterId', '==', uid).limit(1).get(),
  ]);
  const user = userSnap.data() ?? {};
  if (isLoyaltyExcluded(user)) fail('not-eligible', 'Business accounts aren’t part of the referral programme.');
  if (user.referredBy) fail('already-referred', 'You’ve already used an invite code.');
  if (!bookings.empty) fail('too-late', 'Invite codes can only be used before your first booking.');
  if (!codeSnap.exists) fail('invalid-code', 'This invite code doesn’t exist.');
  const referrerUid = codeSnap.get('uid') as string;
  if (referrerUid === uid) fail('own-code', 'You can’t use your own invite code.');

  const [referrerSnap, me, referrerAuth] = await Promise.all([
    db().collection('users').doc(referrerUid).get(),
    admin.auth().getUser(uid!).catch(() => null),
    admin.auth().getUser(referrerUid).catch(() => null),
  ]);
  const referrer = referrerSnap.data() ?? {};
  if (!referrerSnap.exists || isLoyaltyExcluded(referrer)) fail('invalid-code', 'This invite code doesn’t exist.');
  const myPhone = digits(user.phoneNumber ?? user.phone);
  const theirPhone = digits(referrer.phoneNumber ?? referrer.phone);
  const sameEmail = !!me?.email && me.email.toLowerCase() === referrerAuth?.email?.toLowerCase();
  if ((myPhone.length >= 6 && myPhone === theirPhone) || sameEmail) {
    fail('own-code', 'You can’t use your own invite code.');
  }

  await db().runTransaction(async tx => {
    const fresh = await tx.get(userSnap.ref);
    if (fresh.get('referredBy')) fail('already-referred', 'You’ve already used an invite code.');
    tx.set(userSnap.ref, { referredBy: { uid: referrerUid, code, at: FieldValue.serverTimestamp() } }, { merge: true });
    tx.set(db().collection('referrals').doc(uid!), {
      referrerUid, code, status: 'pending', createdAt: FieldValue.serverTimestamp(),
    });
  });
  logger.info('[referral] code applied', { uid, referrerUid });
  return { ok: true, referrerFirstName: String(referrer.firstName ?? '') || null };
});
