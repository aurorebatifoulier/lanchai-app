import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import { validateIdFiles } from './identity';
import { vteEndOfDayMs, vteDay } from './shared/dates';
import {
  basisFor, validUntilRequired, isResidencyRejectionKey, RESIDENCY_REJECTION_REASONS,
  RESIDENCY_MAX_PAGES, LEGACY_RESIDENT_GRACE_DAYS,
  type ResidencyPath, type ResidencyProofType,
} from './shared/residency';

// Residency verification — see functions/src/shared/residency.ts. Never logs paths or
// document content. Proof files are Storage PATHS under idDocs/{uid}/ (validated by
// validateIdFiles); the identity document itself lives in identityChecks/{uid}.
// Deposits change only for bookings created after a decision (frozen per reservation).

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'unauthenticated' | 'permission-denied' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};

async function requireAdmin(uid: string | undefined): Promise<void> {
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  if (!(await db().collection('admins').doc(uid!).get()).exists) fail('admins-only', 'Admins only.', 'permission-denied');
}

const staffName = (token: Record<string, unknown> | undefined) => String(token?.name || token?.email || 'staff');

async function notify(uid: string, p: { title: string; body: string; icon: string; iconColor: string; deepLink: string; type?: string }) {
  const { type = 'account', ...rest } = p;
  await db().collection('notifications').doc(uid).collection('items').add({
    type, ...rest, createdAt: FieldValue.serverTimestamp(), readAt: null,
  });
}

async function notifyAdmins(p: { title: string; body: string; deepLink: string }) {
  const admins = (await db().collection('admins').get()).docs.map(d => d.id);
  await Promise.all(admins.map(uid => notify(uid, { ...p, icon: 'alert', iconColor: 'amber' })));
}

/** Deletes Storage files (missing ones ignored). Paths only, never logged. */
export async function deleteStorageFiles(paths: string[]): Promise<number> {
  const bucket = admin.storage().bucket();
  let n = 0;
  for (const p of paths) {
    try { await bucket.file(p).delete(); n++; } catch { /* already gone */ }
  }
  return n;
}

// ── submitResidencyRequest({ path, proofType?, files? }) — renter ───────────────
export const submitResidencyRequest = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const d = (request.data ?? {}) as { path?: unknown; proofType?: unknown; files?: unknown };
  const path = d.path === 'lao_national' || d.path === 'foreign' ? (d.path as ResidencyPath) : null;
  if (!path) fail('invalid-path', 'Choose Lao national or foreign resident.', 'invalid-argument');

  const [userSnap, idSnap, reqSnap] = await Promise.all([
    db().collection('users').doc(uid!).get(),
    db().collection('identityChecks').doc(uid!).get(),
    db().collection('residencyRequests').doc(uid!).get(),
  ]);
  const user = userSnap.data() ?? {};
  if (user.customerType === 'business' || user.accountType === 'btob') {
    fail('business-account', 'Business accounts don’t need resident status.');
  }
  if (idSnap.get('status') !== 'on_file') fail('id-required', 'Add your ID document first (My ID).');
  if (path === 'lao_national' && idSnap.get('docType') !== 'lao_id') {
    fail('lao-id-required', 'Add your Lao ID card as your ID document first (My ID).');
  }
  const prev = reqSnap.data() ?? {};
  if (prev.status === 'pending') fail('already-pending', 'Your request is already being reviewed.');
  if (prev.status === 'rejected' && prev.rejection?.fixable === false) {
    fail('final-rejection', 'This request can’t be sent again. Please message us.');
  }

  let proofType: ResidencyProofType | null = null;
  let proofFiles: string[] = [];
  if (path === 'foreign') {
    proofType = d.proofType === 'visa_permit' || d.proofType === 'lease' ? d.proofType : null;
    if (!proofType) fail('invalid-proof', 'Choose your proof of residence.', 'invalid-argument');
    if (Array.isArray(d.files) && d.files.length > RESIDENCY_MAX_PAGES) fail('invalid-files', 'Too many photos.', 'invalid-argument');
    proofFiles = await validateIdFiles(uid!, d.files);
  }
  const prevProof: string[] = Array.isArray(prev.proofFiles) ? prev.proofFiles : [];
  const superseded: string[] = Array.isArray(prev.supersededFiles) ? prev.supersededFiles : [];
  const resubmitted = prev.status === 'rejected';
  const renterName = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

  await db().collection('residencyRequests').doc(uid!).set({
    status: 'pending',
    path,
    proofType,
    proofFiles,
    identityDocType: idSnap.get('docType') ?? null,
    identityVersion: idSnap.get('version') ?? null,
    renterName,
    supersededFiles: [...new Set([...superseded, ...prevProof.filter(f => !proofFiles.includes(f))])],
    rejection: FieldValue.delete(),
    decidedAt: FieldValue.delete(),
    decidedBy: FieldValue.delete(),
    ...(resubmitted ? { resubmittedAt: FieldValue.serverTimestamp() } : { submittedAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db().collection('users').doc(uid!).set({ residencyStatus: 'pending' }, { merge: true });
  await notifyAdmins({
    title: resubmitted ? 'Residency request resubmitted' : 'New residency request',
    body: `${renterName ?? 'A renter'} asks for resident status (${path === 'lao_national' ? 'Lao national' : 'foreign resident'}).`,
    deepLink: `/admin/residency/${uid}`,
  });
  logger.info('[residency] request submitted', { uid, path, resubmitted });
  return { ok: true };
});

/** "YYYY-MM-DD" (Vientiane) → end of that day, ms — or null when invalid. */
function parseValidUntil(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const noonUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 5); // 12:00 Vientiane
  const check = new Date(noonUtc);
  if (check.getUTCMonth() !== Number(m[2]) - 1) return null;
  return vteEndOfDayMs(noonUtc) - 1;
}

// ── reviewResidency — staff decision ─────────────────────────────────────────────
// { uid, decision: 'approve', validUntil?: 'YYYY-MM-DD' }
// { uid, decision: 'reject', reason, text?, fixable? (only for 'other') }
export const reviewResidency = onCall({ region: REGION }, async request => {
  await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as {
    uid?: unknown; decision?: unknown; validUntil?: unknown; reason?: unknown; text?: unknown; fixable?: unknown;
  };
  const uid = typeof d.uid === 'string' ? d.uid : '';
  if (!uid) fail('invalid-request', 'Missing renter.', 'invalid-argument');
  const reqRef = db().collection('residencyRequests').doc(uid);
  const [reqSnap, userSnap] = await Promise.all([reqRef.get(), db().collection('users').doc(uid).get()]);
  const req = reqSnap.data();
  if (!req || req.status !== 'pending') fail('not-pending', 'This request is not waiting for a decision.');
  const verifiedBy = staffName(request.auth?.token);

  if (d.decision === 'approve') {
    if (userSnap.get('customerType') === 'business') fail('business-account', 'Business accounts can’t be residents.');
    const path = req!.path as ResidencyPath;
    const validUntilMs = d.validUntil ? parseValidUntil(d.validUntil) : null;
    if (d.validUntil && validUntilMs == null) fail('invalid-date', 'Use the date format YYYY-MM-DD.', 'invalid-argument');
    if (validUntilRequired(path) && validUntilMs == null) fail('date-required', '"Valid until" is required for foreign residents.', 'invalid-argument');
    if (validUntilMs != null && validUntilMs < Date.now()) fail('date-past', 'This date is already over.', 'invalid-argument');
    const basis = basisFor(path, req!.proofType);
    const validUntil = validUntilMs != null ? admin.firestore.Timestamp.fromMillis(validUntilMs) : null;
    await db().collection('users').doc(uid).set({
      customerType: 'resident',
      residencyStatus: 'approved',
      residencyBasis: basis,
      residencyValidUntil: validUntil ?? FieldValue.delete(),
      residencyVerifiedAt: FieldValue.serverTimestamp(),
      residencyVerifiedBy: verifiedBy,
    }, { merge: true });
    await reqRef.set({
      status: 'approved',
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: verifiedBy,
      record: {
        basis,
        documentTypes: [req!.identityDocType, req!.proofType].filter(Boolean),
        validUntil,
        verifiedAt: admin.firestore.Timestamp.now(),
        verifiedBy,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await notify(uid, {
      title: 'You’re verified as a resident',
      body: `Your reduced deposit applies to your next bookings${validUntil ? ` — valid until ${vteDay(validUntil.toMillis())}` : ''}.`,
      icon: 'check', iconColor: 'green', deepLink: '/profile/residency',
    });
  } else if (d.decision === 'reject') {
    if (!isResidencyRejectionKey(d.reason)) fail('invalid-reason', 'Choose a reason.', 'invalid-argument');
    const preset = RESIDENCY_REJECTION_REASONS[d.reason as keyof typeof RESIDENCY_REJECTION_REASONS];
    const text = typeof d.text === 'string' ? d.text.trim().slice(0, 500) : '';
    if (preset.textRequired && !text) fail('text-required', 'Add a short explanation.', 'invalid-argument');
    const fixable = preset.fixable ?? d.fixable === true;
    await reqRef.set({
      status: 'rejected',
      rejection: { reason: d.reason, text, fixable },
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: verifiedBy,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db().collection('users').doc(uid).set({ residencyStatus: 'rejected' }, { merge: true });
    await notify(uid, {
      title: fixable ? 'Resident status: one more thing' : 'Resident status not approved',
      body: fixable ? 'Please update your documents — see what we need.' : 'We couldn’t approve your resident status.',
      icon: 'alert', iconColor: 'amber', deepLink: '/profile/residency',
    });
  } else {
    fail('invalid-request', 'Unknown decision.', 'invalid-argument');
  }
  logger.info('[residency] decision', { uid, decision: d.decision });
  return { ok: true };
});

// ── withdrawResidency() — renter: withdraw a pending request, or give up resident
// status and delete the proof of residence now (the ID document follows its own
// retention — identityChecks). Back to tourist for FUTURE bookings only.
export const withdrawResidency = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const reqRef = db().collection('residencyRequests').doc(uid!);
  const [reqSnap, userSnap] = await Promise.all([reqRef.get(), db().collection('users').doc(uid!).get()]);
  const req = reqSnap.data() ?? {};
  const files = [...(req.proofFiles ?? []), ...(req.supersededFiles ?? [])] as string[];
  const deleted = await deleteStorageFiles(files);
  if (reqSnap.exists) {
    await reqRef.set({
      status: 'withdrawn', proofFiles: [], supersededFiles: [],
      proofFilesDeletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  const isResident = userSnap.get('customerType') === 'resident';
  await db().collection('users').doc(uid!).set({
    ...(isResident ? { customerType: 'tourist' } : {}),
    residencyStatus: FieldValue.delete(),
    residencyValidUntil: FieldValue.delete(),
    residencyBasis: FieldValue.delete(),
  }, { merge: true });
  logger.info('[residency] withdrawn by renter', { uid, filesDeleted: deleted });
  return { ok: true };
});

// ── adminLegacyResident — staff: residents set before verification existed ──────
// { uid, action: 'ask' }     → stays resident for LEGACY_RESIDENT_GRACE_DAYS, asked to verify
// { uid, action: 'tourist' } → back to tourist now
export const adminLegacyResident = onCall({ region: REGION }, async request => {
  await requireAdmin(request.auth?.uid);
  const d = (request.data ?? {}) as { uid?: unknown; action?: unknown };
  const uid = typeof d.uid === 'string' ? d.uid : '';
  if (!uid) fail('invalid-request', 'Missing renter.', 'invalid-argument');
  const ref = db().collection('users').doc(uid);
  if ((await ref.get()).get('customerType') !== 'resident') fail('not-resident', 'This account isn’t a resident.');
  if (d.action === 'ask') {
    const until = admin.firestore.Timestamp.fromMillis(vteEndOfDayMs(Date.now() + LEGACY_RESIDENT_GRACE_DAYS * 86_400_000) - 1);
    await ref.set({ residencyStatus: 'approved', residencyBasis: 'legacy', residencyValidUntil: until }, { merge: true });
    await notify(uid, {
      title: 'Please verify your resident status',
      body: `Send your documents by ${vteDay(until.toMillis())} to keep your reduced deposit.`,
      icon: 'alert', iconColor: 'amber', deepLink: '/profile/residency',
    });
  } else if (d.action === 'tourist') {
    await ref.set({
      customerType: 'tourist', residencyStatus: FieldValue.delete(),
      residencyBasis: FieldValue.delete(), residencyValidUntil: FieldValue.delete(),
    }, { merge: true });
  } else {
    fail('invalid-request', 'Unknown action.', 'invalid-argument');
  }
  logger.info('[residency] legacy action', { uid, action: d.action });
  return { ok: true };
});

// ── residencyDaily — 03:00 Vientiane: expired resident status → tourist ─────────
// Equality-only query (no composite index), date filtered in code. In-app notice now;
// the "expired" email comes with the emails phase. Retention purge joins this job later.
export const residencyDaily = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Vientiane', region: REGION },
  async () => {
    const now = Date.now();
    const snap = await db().collection('users').where('customerType', '==', 'resident').get();
    for (const u of snap.docs) {
      const until: admin.firestore.Timestamp | undefined = u.get('residencyValidUntil');
      if (!until || until.toMillis() >= now) continue;
      await u.ref.set({ customerType: 'tourist', residencyStatus: 'expired' }, { merge: true });
      const reqRef = db().collection('residencyRequests').doc(u.id);
      if ((await reqRef.get()).exists) await reqRef.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await notify(u.id, {
        title: 'Your resident status has expired',
        body: 'Update your documents to keep the reduced deposit on your next bookings.',
        icon: 'alert', iconColor: 'amber', deepLink: '/profile/residency',
      });
      logger.info('[residency] expired', { uid: u.id });
    }
  },
);
