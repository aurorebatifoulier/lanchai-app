import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { isIdDocType, idDocPrefix, ID_MAX_PAGES, ID_MAX_BYTES } from './shared/identity';

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
    tx.set(ref, {
      status: 'on_file',
      docType: input.docType,
      files: input.files,
      source: input.source,
      version,
      uploadedAt: FieldValue.serverTimestamp(),
      rejection: FieldValue.delete(),
      supersededFiles: [...new Set([...superseded, ...prevFiles.filter(f => !input.files.includes(f))])],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(db.collection('users').doc(uid), { idOnFile: true, idDocVersion: version }, { merge: true });
    return version;
  });
}

// ── submitIdentityDocument({ docType, files }) — renter's own document ──────────
export const submitIdentityDocument = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Please sign in again.', 'unauthenticated');
  const d = (request.data ?? {}) as { docType?: unknown; files?: unknown };
  const files = await validateIdFiles(uid!, d.files);
  const version = await registerIdentityDocument(uid!, { docType: d.docType, files, source: 'renter' });
  logger.info('[identity] document registered', { uid, version, pages: files.length });
  return { ok: true };
});
