import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import {
  sanitizeRetention, deletionBlockers, rentalInProgress, identityPurgeDueMs, DAY_MS,
  type RetentionConfig, type RetentionReservation, type DeletionBlocker,
} from './shared/retention';

// Retention of identity + residency documents — rules in functions/src/shared/retention.ts.
// Every deletion (and every blocked attempt) is logged in docDeletionLog (admin read,
// server write): uid, document type, file count, reason — never paths or content.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const ms = (t: unknown) => (t instanceof admin.firestore.Timestamp ? t.toMillis() : null);

export type DeletionReason =
  | 'proof_retention' | 'rejection_retention' | 'replaced' | 'renter_request'
  | 'id_retention' | 'never_rented' | 'blocked';

export async function getRetentionConfig(): Promise<RetentionConfig> {
  const snap = await db().collection('config').doc('residency').get().catch(() => null);
  return sanitizeRetention(snap?.data());
}

/** The renter's reservations + claims, reduced to what the retention rules need. */
export async function loadRetentionContext(uid: string): Promise<{ reservations: RetentionReservation[]; blockers: DeletionBlocker[] }> {
  const [res, claims] = await Promise.all([
    db().collection('reservations').where('renterId', '==', uid).get(),
    db().collection('claims').where('userId', '==', uid).get(),
  ]);
  const reservations: RetentionReservation[] = res.docs.map(d => ({
    status: d.get('status'),
    returnedAtMs: ms(d.get('returnedAt')),
    returnAtMs: ms(d.get('returnAt')),
    updatedAtMs: ms(d.get('updatedAt')),
    outstandingBalance: d.get('outstandingBalance') ?? 0,
    outstandingSettled: d.get('outstandingSettled') === true,
    outstandingWrittenOff: d.get('outstandingWrittenOff') === true,
    hasNonReturn: !!d.get('nonReturnAt'),
    noShowHoldLifted: !!d.get('noShowHoldLiftedAt'),
  }));
  return { reservations, blockers: deletionBlockers(reservations, claims.docs.map(c => c.get('status'))) };
}

export async function logDeletion(entry: {
  uid: string; documentType: 'identity' | 'proof'; fileCount: number; reason: DeletionReason; blockers?: DeletionBlocker[];
}): Promise<void> {
  await db().collection('docDeletionLog').add({ ...entry, at: FieldValue.serverTimestamp() });
}

/** Deletes Storage files (missing ones ignored). Paths are never logged. */
export async function deleteFiles(paths: string[]): Promise<number> {
  const bucket = admin.storage().bucket();
  let n = 0;
  for (const p of paths) {
    try { await bucket.file(p).delete(); n++; } catch { /* already gone */ }
  }
  return n;
}

/** Deletes the current identity document now: status none, idOnFile false (the next
 *  booking asks again; idCheckedVersion stays, a new document needs a new check). */
async function purgeIdentity(uid: string, files: string[], reason: DeletionReason): Promise<void> {
  const n = await deleteFiles(files);
  await db().collection('identityChecks').doc(uid).set({
    status: 'none', files: [], filesPurgedAt: FieldValue.serverTimestamp(),
    purgeDueAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db().collection('users').doc(uid).set({ idOnFile: false }, { merge: true });
  await logDeletion({ uid, documentType: 'identity', fileCount: n, reason });
}

/** Residency proof files of `uid`, now — unless blocked (then left for the daily job). */
export async function deleteProofFilesIfAllowed(uid: string, reason: DeletionReason): Promise<boolean> {
  const ref = db().collection('residencyRequests').doc(uid);
  const snap = await ref.get();
  const files = [...(snap.get('proofFiles') ?? []), ...(snap.get('supersededFiles') ?? [])] as string[];
  if (files.length === 0) return true;
  const { blockers } = await loadRetentionContext(uid);
  if (blockers.length > 0) return false;
  const n = await deleteFiles(files);
  await ref.set({ proofFiles: [], supersededFiles: [], proofFilesDeletedAt: FieldValue.serverTimestamp() }, { merge: true });
  await logDeletion({ uid, documentType: 'proof', fileCount: n, reason });
  return true;
}

// ── documentRetentionDaily — 04:00 Vientiane ─────────────────────────────────────
// Equality-free collection scans (small collections) + per-renter equality queries —
// no composite index. Also refreshes identityChecks.purgeDueAt (shown in My ID).
export const documentRetentionDaily = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'Asia/Vientiane', region: REGION },
  async () => {
    const now = Date.now();
    const cfg = await getRetentionConfig();
    const proofMs = cfg.proofRetentionDays * DAY_MS;
    const [ids, reqs] = await Promise.all([
      db().collection('identityChecks').get(),
      db().collection('residencyRequests').get(),
    ]);
    const uids = new Set<string>([...ids.docs.map(d => d.id), ...reqs.docs.map(d => d.id)]);

    for (const uid of uids) {
      try {
        const idDoc = ids.docs.find(d => d.id === uid);
        const reqDoc = reqs.docs.find(d => d.id === uid);
        const idFiles: string[] = idDoc?.get('status') === 'on_file' ? idDoc.get('files') ?? [] : [];
        const idSuperseded: string[] = idDoc?.get('supersededFiles') ?? [];
        const proofFiles: string[] = reqDoc?.get('proofFiles') ?? [];
        const proofSuperseded: string[] = reqDoc?.get('supersededFiles') ?? [];
        if (!idFiles.length && !idSuperseded.length && !proofFiles.length && !proofSuperseded.length) continue;

        const { reservations, blockers } = await loadRetentionContext(uid);
        const blocked = async (documentType: 'identity' | 'proof') => {
          await logDeletion({ uid, documentType, fileCount: 0, reason: 'blocked', blockers });
        };

        // Current identity document.
        if (idDoc && idFiles.length) {
          const dueMs = identityPurgeDueMs({ uploadedAtMs: ms(idDoc.get('uploadedAt')), reservations, cfg });
          const stored = ms(idDoc.get('purgeDueAt'));
          if (dueMs !== stored) {
            await idDoc.ref.set({ purgeDueAt: dueMs != null ? admin.firestore.Timestamp.fromMillis(dueMs) : FieldValue.delete() }, { merge: true });
          }
          if (dueMs != null && now >= dueMs) {
            if (blockers.length) await blocked('identity');
            else await purgeIdentity(uid, idFiles,
              reservations.some(r => r.status === 'returned' || r.status === 'lost') ? 'id_retention' : 'never_rented');
          }
        }
        // Replaced / declined identity files.
        if (idDoc && idSuperseded.length) {
          const since = ms(idDoc.get('supersededAt')) ?? 0;
          if (now >= since + proofMs) {
            if (blockers.length) await blocked('identity');
            else {
              const n = await deleteFiles(idSuperseded);
              await idDoc.ref.set({ supersededFiles: [] }, { merge: true });
              await logDeletion({ uid, documentType: 'identity', fileCount: n, reason: 'replaced' });
            }
          }
        }
        // Residency proof files.
        if (reqDoc && (proofFiles.length || proofSuperseded.length)) {
          const status = reqDoc.get('status');
          const decided = ms(reqDoc.get('decidedAt'));
          const reason: DeletionReason | null = status === 'withdrawn' ? 'renter_request'
            : status === 'approved' || status === 'expired' ? (decided != null && now >= decided + proofMs ? 'proof_retention' : null)
            : status === 'rejected' ? (decided != null && now >= decided + proofMs ? 'rejection_retention' : null)
            : null; // pending: under review
          const toDelete = reason ? [...proofFiles, ...proofSuperseded] : proofSuperseded;
          if (toDelete.length) {
            if (blockers.length) await blocked('proof');
            else {
              const n = await deleteFiles(toDelete);
              await reqDoc.ref.set({
                ...(reason ? { proofFiles: [], proofFilesDeletedAt: FieldValue.serverTimestamp() } : {}),
                supersededFiles: [],
              }, { merge: true });
              await logDeletion({ uid, documentType: 'proof', fileCount: n, reason: reason ?? 'replaced' });
            }
          }
        }
      } catch (err) {
        logger.error('[retention] failed for a renter', { uid, err: String(err) });
      }
    }
  },
);

// ── deleteMyIdentityDocument() — renter asks to delete their ID (My ID) ──────────
// Deleted now only when the retention rule already allows it and nothing blocks it;
// otherwise returns the planned date (or "kept while a rental is in progress").
export const deleteMyIdentityDocument = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const ref = db().collection('identityChecks').doc(uid);
  const snap = await ref.get();
  const files: string[] = snap.get('status') === 'on_file' ? snap.get('files') ?? [] : [];
  if (files.length === 0) return { deleted: true };
  const cfg = await getRetentionConfig();
  const { reservations, blockers } = await loadRetentionContext(uid);
  const neverRented = !reservations.some(r => ['returned', 'lost', 'active'].includes(r.status));
  const inProgress = rentalInProgress(reservations);
  if (!blockers.length && !inProgress && neverRented) {
    await purgeIdentity(uid, files, 'renter_request');
    return { deleted: true };
  }
  const dueMs = identityPurgeDueMs({ uploadedAtMs: ms(snap.get('uploadedAt')), reservations, cfg });
  if (!blockers.length && dueMs != null && Date.now() >= dueMs) {
    await purgeIdentity(uid, files, 'renter_request');
    return { deleted: true };
  }
  return {
    deleted: false,
    keptUntilMs: dueMs,
    reason: blockers.length ? 'blocked' : inProgress ? 'rental_in_progress' : 'retention',
    months: cfg.idRetentionMonths,
  };
});
