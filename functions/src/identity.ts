import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { sendAccountEmail, idVerifiedEmail, idDeclinedEmail } from './email/triggers';
import { BREVO_API_KEY } from './email/config';
import { getRetentionConfig } from './retention';
import {
  isIdDocType, idDocPrefix, idCheckNeeded, ID_MAX_PAGES, ID_MAX_BYTES, PRE_PICKUP_STATUSES, ID_REJECTION_REASONS,
} from './shared/identity';

// Identity document (required to rent) — see functions/src/shared/identity.ts.
// Paths only (never download URLs); files are uploaded by the app to idDocs/{uid}/ and
// validated here (prefix, existence, image type, size). Never logs paths or content.

const REGION = 'asia-southeast1';
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'unauthenticated' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};

/** Checks every path is the user's own, exists, is an image under the size limit. */
export async function validateIdFiles(uid: string, files: unknown): Promise<string[]> {
  if (!Array.isArray(files) || files.length === 0 || files.length > ID_MAX_PAGES) {
    fail('invalid-files', `Add between 1 and ${ID_MAX_PAGES} photos.`, 'invalid-argument');
  }
  const paths = (files as unknown[]).map(f => (typeof f === 'string' ? f : ''));
  const prefix = idDocPrefix(uid);
  if (paths.some(p => !p.startsWith(prefix) || p.includes('..') || p.length > 300)) {
    fail('invalid-files', 'Invalid document.', 'invalid-argument');
  }
  const bucket = admin.storage().bucket();
  for (const p of paths) {
    const [exists] = await bucket.file(p).exists();
    if (!exists) fail('invalid-files', 'A photo is missing — please add it again.', 'invalid-argument');
    const [meta] = await bucket.file(p).getMetadata();
    if (!String(meta.contentType ?? '').startsWith('image/') || Number(meta.size ?? 0) > ID_MAX_BYTES) {
      fail('invalid-files', 'Photos only, 10 MB max each.', 'invalid-argument');
    }
  }
  return [...new Set(paths)];
}

/**
 * Registers a NEW identity document for `uid` (renter upload, or staff photo at the
 * counter later): status on_file, version + 1 (the first-pick-up check is tied to the
 * version), previous files kept in `supersededFiles` for the retention job — never
 * deleted here (an older document may still protect an open rental).
 */
export async function registerIdentityDocument(
  uid: string,
  input: { docType: unknown; files: string[]; source: 'renter' | 'counter' },
): Promise<number> {
  if (!isIdDocType(input.docType)) fail('invalid-doc-type', 'Choose the type of document.', 'invalid-argument');
  const db = admin.firestore();
  const ref = db.collection('identityChecks').doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const prev = snap.data() ?? {};
    const version = (typeof prev.version === 'number' ? prev.version : 0) + 1;
    const prevFiles: string[] = Array.isArray(prev.files) ? prev.files : [];
    const superseded: string[] = Array.isArray(prev.supersededFiles) ? prev.supersededFiles : [];
    const newlySuperseded = prevFiles.filter(f => !input.files.includes(f));
    tx.set(ref, {
      status: 'on_file',
      docType: input.docType,
      files: input.files,
      source: input.source,
      version,
      uploadedAt: FieldValue.serverTimestamp(),
      rejection: FieldValue.delete(),
      supersededFiles: [...new Set([...superseded, ...newlySuperseded])],
      // Retention clock for replaced files (functions/src/retention.ts).
      ...(newlySuperseded.length ? { supersededAt: FieldValue.serverTimestamp() } : {}),
      purgeDueAt: FieldValue.delete(),
      filesPurgedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(db.collection('users').doc(uid), { idOnFile: true, idDocVersion: version }, { merge: true });
    return version;
  });
}

/**
 * Keeps reservation.firstRentalIdCheck in line with the renter's CURRENT state, on every
 * upcoming pick-up: true while idCheckNeeded (no document, or a document not yet checked
 * in person — e.g. a new one registered after a booking), false once checked. Drives the
 * "First rental — check ID" badge, the admin alerts and the blocking checklist section.
 */
export async function syncFirstRentalIdFlags(uid: string): Promise<void> {
  const db = admin.firestore();
  const [userSnap, resSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('reservations').where('renterId', '==', uid).get(),
  ]);
  const needed = idCheckNeeded(userSnap.data());
  const batch = db.batch();
  let n = 0;
  for (const d of resSnap.docs) {
    if (!(PRE_PICKUP_STATUSES as readonly string[]).includes(d.get('status'))) continue;
    if ((d.get('firstRentalIdCheck') === true) === needed) continue;
    batch.update(d.ref, { firstRentalIdCheck: needed });
    n++;
  }
  if (n > 0) await batch.commit();
}

async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const isAdmin = (await admin.firestore().collection('admins').doc(uid!).get()).exists;
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admins only.', { code: 'admins-only' });
  return uid!;
}

const staffName = (token: Record<string, unknown> | undefined) =>
  String(token?.name || token?.email || 'staff');

// ── submitIdentityDocument({ docType, files }) — renter's own document ──────────
export const submitIdentityDocument = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const d = (request.data ?? {}) as { docType?: unknown; files?: unknown };
  const files = await validateIdFiles(uid!, d.files);
  const version = await registerIdentityDocument(uid!, { docType: d.docType, files, source: 'renter' });
  await syncFirstRentalIdFlags(uid!); // a new document must be checked again in person
  logger.info('[identity] document registered', { uid, version, pages: files.length });
  return { ok: true };
});

// ── recordIdCheck — staff, at the first pick-up (handover checklist) ─────────────
// { renterId, matchesPerson: true, nameMatches: true, counterPhoto?: { docType, files } }
// counterPhoto = staff photographed the ID at the counter (renter chose "at the shop",
// or no document on file) → registered as a new document (source 'counter') first.
// Ties the check to the CURRENT document version (idCheckedVersion); idCheckedAt/By
// stay as history. Clears firstRentalIdCheck on the renter's upcoming pick-ups.
export const recordIdCheck = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const adminUid = await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as {
    renterId?: unknown; matchesPerson?: unknown; nameMatches?: unknown;
    counterPhoto?: { docType?: unknown; files?: unknown };
  };
  const renterId = typeof d.renterId === 'string' ? d.renterId : '';
  if (!renterId) fail('invalid-request', 'Missing renter.', 'invalid-argument');
  if (d.matchesPerson !== true || d.nameMatches !== true) {
    fail('confirmations-required', 'Both checks must be confirmed.', 'invalid-argument');
  }
  const db = admin.firestore();
  if (d.counterPhoto) {
    const files = await validateIdFiles(renterId, d.counterPhoto.files);
    await registerIdentityDocument(renterId, { docType: d.counterPhoto.docType, files, source: 'counter' });
  }
  const identity = (await db.collection('identityChecks').doc(renterId).get()).data();
  if (identity?.status !== 'on_file' || typeof identity.version !== 'number') {
    fail('no-document', 'Take a photo of the ID first.');
  }
  await db.collection('users').doc(renterId).set({
    idCheckedVersion: identity!.version,
    idCheckedAt: FieldValue.serverTimestamp(),
    idCheckedBy: staffName(request.auth?.token),
  }, { merge: true });
  await syncFirstRentalIdFlags(renterId);
  // "ID verified" email — once per document version (claimed in a transaction).
  const idRef = db.collection('identityChecks').doc(renterId);
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(idRef);
    if (snap.get('verifiedEmailVersion') === identity!.version) return false;
    tx.set(idRef, { verifiedEmailVersion: identity!.version }, { merge: true });
    return true;
  });
  if (claimed) {
    const { idRetentionMonths } = await getRetentionConfig();
    await sendAccountEmail(renterId, (shop, r) => idVerifiedEmail(shop, { firstName: r.firstName, idRetentionMonths }), 'id-verified');
  }
  logger.info('[identity] checked in person', { renterId, version: identity!.version, by: adminUid });
  return { ok: true };
});

// ── adminIdentityAction — staff: add/replace a photo at the counter, or decline ───
// { renterId, action: 'set', docType, files } | { renterId, action: 'reject', reason, text? }
// A decline blocks new bookings until a new document is sent (createReservations).
export const adminIdentityAction = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const adminUid = await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as {
    renterId?: unknown; action?: unknown; docType?: unknown; files?: unknown; reason?: unknown; text?: unknown;
  };
  const renterId = typeof d.renterId === 'string' ? d.renterId : '';
  if (!renterId) fail('invalid-request', 'Missing renter.', 'invalid-argument');
  const db = admin.firestore();
  if (d.action === 'set') {
    const files = await validateIdFiles(renterId, d.files);
    await registerIdentityDocument(renterId, { docType: d.docType, files, source: 'counter' });
  } else if (d.action === 'reject') {
    const preset = ID_REJECTION_REASONS.find(r => r.key === d.reason);
    if (!preset) fail('invalid-reason', 'Choose a reason.', 'invalid-argument');
    const text = typeof d.text === 'string' && d.text.trim() ? d.text.trim().slice(0, 500) : preset!.text;
    const ref = db.collection('identityChecks').doc(renterId);
    const snap = await ref.get();
    if (snap.get('status') !== 'on_file') fail('no-document', 'There is no document to decline.');
    const files: string[] = snap.get('files') ?? [];
    const superseded: string[] = snap.get('supersededFiles') ?? [];
    await ref.set({
      status: 'rejected',
      rejection: { reason: preset!.key, text },
      files: [],
      supersededFiles: [...new Set([...superseded, ...files])],
      supersededAt: FieldValue.serverTimestamp(),
      purgeDueAt: FieldValue.delete(),
      rejectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('users').doc(renterId).set({ idOnFile: false }, { merge: true });
    await db.collection('notifications').doc(renterId).collection('items').add({
      type: 'account', icon: 'alert', iconColor: 'coral',
      title: 'Please add a new ID',
      body: `${text} New bookings are paused until then.`,
      deepLink: '/profile/identity', createdAt: FieldValue.serverTimestamp(), readAt: null,
    });
    await sendAccountEmail(renterId, (shop, r) => idDeclinedEmail(shop, { firstName: r.firstName, text }), 'id-declined');
  } else {
    fail('invalid-request', 'Unknown action.', 'invalid-argument');
  }
  await syncFirstRentalIdFlags(renterId);
  logger.info('[identity] admin action', { renterId, action: d.action, by: adminUid });
  return { ok: true };
});

// ── adminRenterProfile — staff: contact details next to the ID, and name fix ──────
// { renterId, action: 'get' } → { firstName, lastName, displayName, phone, email }
//   (email from Firebase Auth — users docs don't store it).
// { renterId, action: 'setName', firstName, lastName } → users first/last/displayName +
//   nameEditedAt/By (internal), Auth displayName, and renterName on upcoming pick-ups.
// Renters can't change their own name once an ID has been checked (firestore.rules).
export const adminRenterProfile = onCall({ region: REGION }, async request => {
  const adminUid = await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as { renterId?: unknown; action?: unknown; firstName?: unknown; lastName?: unknown };
  const renterId = typeof d.renterId === 'string' ? d.renterId : '';
  if (!renterId) fail('invalid-request', 'Missing renter.', 'invalid-argument');
  const db = admin.firestore();
  const userRef = db.collection('users').doc(renterId);

  if (d.action === 'setName') {
    const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : '');
    const firstName = clean(d.firstName);
    const lastName = clean(d.lastName);
    if (!firstName || !lastName) fail('invalid-name', 'First and last name are required.', 'invalid-argument');
    const displayName = `${firstName} ${lastName}`;
    await userRef.set({
      firstName, lastName, displayName,
      nameEditedAt: FieldValue.serverTimestamp(),
      nameEditedBy: staffName(request.auth?.token),
    }, { merge: true });
    await admin.auth().updateUser(renterId, { displayName }).catch(() => {});
    const res = await db.collection('reservations').where('renterId', '==', renterId).get();
    const batch = db.batch();
    let n = 0;
    for (const r of res.docs) {
      if (!(PRE_PICKUP_STATUSES as readonly string[]).includes(r.get('status'))) continue;
      batch.update(r.ref, { renterName: displayName });
      n++;
    }
    if (n > 0) await batch.commit();
    logger.info('[identity] renter name edited', { renterId, by: adminUid });
  } else if (d.action !== 'get') {
    fail('invalid-request', 'Unknown action.', 'invalid-argument');
  }

  const [user, authUser] = await Promise.all([
    userRef.get(),
    admin.auth().getUser(renterId).catch(() => null),
  ]);
  const u = user.data() ?? {};
  return {
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    displayName: u.displayName ?? authUser?.displayName ?? '',
    phone: u.phoneNumber ?? u.phone ?? '',
    email: authUser?.email ?? '',
  };
});
