import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { AdminCaller } from './adminAuth';

// auditLog/{id} — append-only trail of every staff / owner action (who, role, when,
// what). Client writes are paired with the document they change (firestore.rules:
// lastAuditId + existsAfter); server actions (callables) write here directly.
// The reservation detail "History" card reads it by reservationId (equality only).

export interface AuditFields {
  action: string;
  reservationId?: string;
  orderId?: string;
  claimId?: string;
  incidentId?: string;
  productId?: string;
  renterId?: string;
  targetUid?: string;
  note?: string;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/** New auditLog doc ref (so a caller can put it in its own batch / transaction). */
export const newAuditRef = () => admin.firestore().collection('auditLog').doc();

export function auditData(by: Pick<AdminCaller, 'uid' | 'name' | 'role'>, f: AuditFields): Record<string, unknown> {
  return clean({
    ...f,
    note: f.note ? f.note.slice(0, 500) : undefined,
    byUid: by.uid, byName: by.name, byRole: by.role,
    at: FieldValue.serverTimestamp(),
  });
}

/** Writes one audit entry (never throws — an audit failure doesn't undo the action). */
export async function writeAudit(by: Pick<AdminCaller, 'uid' | 'name' | 'role'>, f: AuditFields): Promise<void> {
  await newAuditRef().set(auditData(by, f)).catch(() => {});
}
