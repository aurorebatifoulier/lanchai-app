import {
  collection, doc, getDoc, serverTimestamp, writeBatch,
  type DocumentReference, type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './auth';
import type { MachineAction } from '@/functions/src/shared/reservationMachine';

// Audit trail of admin actions (who, role, when, what) — auditLog/{id}, append-only.
// firestore.rules pairs every admin write on reservations / claims / products with an
// entry written IN THE SAME BATCH: the written doc carries `lastAuditId`, and the rule
// checks existsAfter(auditLog/lastAuditId) with byUid == the caller. Use auditedWrite /
// addAudit for every admin write on those collections — a write without it is refused.
// Server actions (callables) write their own entries (functions/src/audit.ts).

export interface AuditRefs {
  reservationId?: string;
  orderId?: string | null;
  claimId?: string;
  incidentId?: string;
  productId?: string;
  renterId?: string;
}

let cached: { uid: string; name: string; role: 'owner' | 'staff' } | null = null;

/** The caller's admin identity (admins/{uid} is readable by its own uid). */
export async function adminIdentity(): Promise<{ uid: string; name: string; role: 'owner' | 'staff' }> {
  const u = auth.currentUser;
  if (!u) throw new Error('Please sign in again.');
  if (cached?.uid === u.uid) return cached;
  const snap = await getDoc(doc(db, 'admins', u.uid));
  cached = {
    uid: u.uid,
    name: String(snap.get('name') || u.displayName || u.email || 'Staff'),
    role: snap.get('role') === 'staff' ? 'staff' : 'owner',
  };
  return cached;
}
/** Forget the cached identity (sign-out / role change). */
export const resetAdminIdentity = () => { cached = null; };

/**
 * Adds an auditLog entry to `batch` and returns its id — put it as `lastAuditId` on
 * the document(s) written in the same batch.
 */
export async function addAudit(batch: WriteBatch, action: string, refs: AuditRefs, note?: string): Promise<string> {
  const me = await adminIdentity();
  const ref = doc(collection(db, 'auditLog'));
  const clean = Object.fromEntries(Object.entries(refs).filter(([, v]) => v != null && v !== ''));
  batch.set(ref, {
    action, ...clean,
    ...(note ? { note: note.slice(0, 500) } : {}),
    byUid: me.uid, byName: me.name, byRole: me.role,
    at: serverTimestamp(),
  });
  return ref.id;
}

/** One audited update of one document (reservation / claim / product). */
export async function auditedWrite(
  target: DocumentReference,
  fields: Record<string, unknown>,
  action: string,
  refs: AuditRefs,
  note?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const auditId = await addAudit(batch, action, refs, note);
  batch.update(target, { ...fields, updatedAt: serverTimestamp(), lastAuditId: auditId });
  await batch.commit();
}

/**
 * Audited update of a reservation through the STATE MACHINE: `action` is a machine
 * action (functions/src/shared/reservationMachine.ts) — written as `lastAction` and as
 * the audit action. firestore.rules allow it only from the reservation's current phase.
 */
export async function auditedReservationUpdate(
  r: { id: string; orderId?: string | null; productId?: string; renterId?: string },
  fields: Record<string, unknown>,
  action: MachineAction,
  note?: string,
): Promise<void> {
  await auditedWrite(doc(db, 'reservations', r.id), { ...fields, lastAction: action }, action,
    { reservationId: r.id, orderId: r.orderId ?? null, productId: r.productId, renterId: r.renterId }, note);
}
