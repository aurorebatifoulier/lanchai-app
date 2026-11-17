import { httpsCallable } from 'firebase/functions';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where,
  type Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db, functions, storage } from './firebase';
import { auth } from './auth';
import { auditedWrite } from './adminAudit';
import type { ChecklistRating } from '@/functions/src/shared/returnCharges';

// Staff counter operations (functions/src/returns.ts) + internal incidents and claim
// notes (firestore.rules incidents / claims/{id}/notes). The server decides every amount
// of a staff return; these wrappers only send the condition data.

const message = (err: unknown, fallback: string) => {
  const e = err as { message?: string; details?: { code?: string } };
  return e?.details?.code && e.message ? e.message : fallback;
};

export interface ReturnItemPayload {
  reservationId: string;
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  clientConfirmedByName: string;
  clientConfirmed: boolean;
  chargeUnits: number;
}
export interface ReturnResult {
  reservationId: string;
  outcome: 'clean' | 'late' | 'damage' | 'review';
  refund: number;
  outstanding: number;
  currency: 'LAK' | 'USD' | 'THB';
  settled: boolean;
}

export async function submitStaffReturn(items: ReturnItemPayload[], collectedBalance: boolean): Promise<ReturnResult[]> {
  try {
    const r = await httpsCallable(functions, 'submitReturn')({ items, collectedBalance });
    return (r.data as { results: ReturnResult[] }).results;
  } catch (err) {
    throw new Error(message(err, 'Couldn’t record the return. Please try again.'));
  }
}

export async function refusePickup(reservationIds: string[], reason: string, flagId: boolean): Promise<void> {
  try {
    await httpsCallable(functions, 'refusePickup')({ reservationIds, reason, flagId });
  } catch (err) {
    throw new Error(message(err, 'Couldn’t record the refusal. Please try again.'));
  }
}

export async function resolveOwnerAlert(kind: 'pickup' | 'id', id: string, note = ''): Promise<void> {
  try {
    await httpsCallable(functions, 'resolveOwnerAlert')({ kind, id, note });
  } catch (err) {
    throw new Error(message(err, 'Couldn’t update. Please try again.'));
  }
}

/** The signed-in admin's display name (history / notes). */
export function myAdminName(): string {
  const u = auth.currentUser;
  return u?.displayName || u?.email || 'Staff';
}

/** Compress + upload evidence photos (create-once paths) → download URLs. */
export async function uploadEvidence(folder: string, uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const c = await manipulateAsync(uris[i], [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
    const blob: Blob = await (await fetch(c.uri)).blob();
    const r = storageRef(storage, `${folder}/${Date.now()}_${i}.jpg`);
    await uploadBytes(r, blob, { contentType: 'image/jpeg' });
    out.push(await getDownloadURL(r));
  }
  return out;
}

// ── Incidents (internal, on a booking) ────────────────────────────────────────
export interface Incident {
  id: string;
  reservationId: string;
  orderId?: string | null;
  renterId: string;
  renterName?: string | null;
  productId: string;
  productName?: string | null;
  note: string;
  photos: string[];
  status: 'open' | 'closed';
  createdBy: string;
  createdByName?: string;
  createdAt?: Timestamp;
}
export interface StaffNote { id: string; text: string; photos?: string[]; byUid: string; byName: string; at?: Timestamp }

export async function createIncident(input: {
  reservationId: string; orderId?: string | null; renterId: string; renterName?: string | null;
  productId: string; productName?: string | null; note: string; photoUris: string[];
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  const ref = doc(collection(db, 'incidents'));
  const photos = await uploadEvidence(`incidents/${ref.id}`, input.photoUris);
  await setDoc(ref, {
    reservationId: input.reservationId,
    orderId: input.orderId ?? null,
    renterId: input.renterId,
    renterName: input.renterName ?? null,
    productId: input.productId,
    productName: input.productName ?? null,
    note: input.note.trim().slice(0, 2000),
    photos,
    status: 'open',
    createdBy: uid,
    createdByName: myAdminName(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchIncidents(onChange: (list: Incident[]) => void, filter?: { reservationId?: string }): () => void {
  const q = filter?.reservationId
    ? query(collection(db, 'incidents'), where('reservationId', '==', filter.reservationId))
    : query(collection(db, 'incidents'), where('status', '==', 'open'));
  return onSnapshot(q, s => onChange(
    s.docs.map(d => ({ id: d.id, ...d.data() } as Incident))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
  ), () => onChange([]));
}

export async function closeIncident(id: string, outcome: string): Promise<void> {
  // Owner decision, audited (lastAuditId + auditLog entry in one batch — firestore.rules).
  const snap = await getDoc(doc(db, 'incidents', id));
  await auditedWrite(doc(db, 'incidents', id), {
    status: 'closed', outcome: outcome.trim().slice(0, 2000), closedAt: serverTimestamp(), closedBy: myAdminName(),
  }, 'incident.closed', {
    incidentId: id, reservationId: snap.get('reservationId') ?? undefined, renterId: snap.get('renterId') ?? undefined,
  }, outcome.trim().slice(0, 200));
}

// ── Notes (incident or claim) ─────────────────────────────────────────────────
export async function addStaffNote(parent: 'incidents' | 'claims', parentId: string, text: string, photoUris: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  const photos = photoUris.length
    ? await uploadEvidence(parent === 'incidents' ? `incidents/${parentId}` : `claim-staff/${parentId}`, photoUris)
    : [];
  await addDoc(collection(db, parent, parentId, 'notes'), {
    text: text.trim().slice(0, 2000), photos, byUid: uid, byName: myAdminName(), at: serverTimestamp(),
  });
}

export async function getStaffNotes(parent: 'incidents' | 'claims', parentId: string): Promise<StaffNote[]> {
  const snap = await getDocs(query(collection(db, parent, parentId, 'notes'), orderBy('at', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffNote));
}
