import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { auth } from './auth';
import { uploadIdPhotos } from './identity';
import { sanitizeRetention, type RetentionConfig } from '@/functions/src/shared/retention';
import type { ResidencyPath, ResidencyProofType, ResidencyStatus, ResidencyRejectionKey } from '@/functions/src/shared/residency';

export * from '@/functions/src/shared/residency';

// Residency verification — app side (renter screen + admin review). All writes go
// through callables (functions/src/residency.ts); proof photos are uploaded to
// idDocs/{uid}/ and referenced by PATH only.

export interface ResidencyRequestDoc {
  status: ResidencyStatus;
  path: ResidencyPath;
  proofType?: ResidencyProofType | null;
  proofFiles?: string[];
  identityDocType?: string | null;
  renterName?: string | null;
  rejection?: { reason: ResidencyRejectionKey; text?: string; fixable: boolean };
  submittedAt?: Timestamp;
  resubmittedAt?: Timestamp;
  decidedAt?: Timestamp;
  decidedBy?: string;
  record?: { basis: string; documentTypes: string[]; validUntil: Timestamp | null; verifiedAt: Timestamp; verifiedBy: string };
}

export interface MyResidency {
  loading: boolean;
  request: ResidencyRequestDoc | null;
  customerType: string | null;
  validUntil: Timestamp | null;
  basis: string | null;
}

/** Live: my residency request + the decision fields on users/{uid}. */
export function useMyResidency(): MyResidency {
  const [request, setRequest] = useState<ResidencyRequestDoc | null>(null);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState({ req: false, user: false });
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoaded({ req: true, user: true }); return; }
    const a = onSnapshot(doc(db, 'residencyRequests', uid),
      s => { setRequest(s.exists() ? (s.data() as ResidencyRequestDoc) : null); setLoaded(l => ({ ...l, req: true })); },
      () => setLoaded(l => ({ ...l, req: true })));
    const b = onSnapshot(doc(db, 'users', uid),
      s => { setUser(s.data() ?? null); setLoaded(l => ({ ...l, user: true })); },
      () => setLoaded(l => ({ ...l, user: true })));
    return () => { a(); b(); };
  }, []);
  return {
    loading: !loaded.req || !loaded.user,
    request,
    customerType: (user?.customerType as string) ?? null,
    validUntil: (user?.residencyValidUntil as Timestamp) ?? null,
    basis: (user?.residencyBasis as string) ?? null,
  };
}

const callErr = (err: unknown, fallback: string) =>
  new Error((err as { message?: string })?.message || fallback);

export async function submitResidency(path: ResidencyPath, proofType: ResidencyProofType | null, uris: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  const files = path === 'foreign' ? await uploadIdPhotos(uid, uris, `proof_${proofType}`) : [];
  try {
    await httpsCallable(functions, 'submitResidencyRequest')({ path, proofType, files });
  } catch (err) {
    throw callErr(err, 'Could not send your request. Please try again.');
  }
}

export async function withdrawMyResidency(): Promise<void> {
  try {
    await httpsCallable(functions, 'withdrawResidency')();
  } catch (err) {
    throw callErr(err, 'Could not update. Please try again.');
  }
}

// ── Retention durations (config/residency — admin only; read by the retention job) ──
export { RETENTION_DEFAULTS, type RetentionConfig } from '@/functions/src/shared/retention';

export async function getRetentionConfig(): Promise<RetentionConfig> {
  try {
    return sanitizeRetention((await getDoc(doc(db, 'config', 'residency'))).data());
  } catch {
    return sanitizeRetention(null);
  }
}

export async function saveRetentionConfig(cfg: RetentionConfig): Promise<void> {
  await setDoc(doc(db, 'config', 'residency'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true });
}
