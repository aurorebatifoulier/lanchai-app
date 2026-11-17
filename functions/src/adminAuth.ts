import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

// Admin roles (phase 2): admins/{uid} = { role: 'owner' | 'staff', active, name, email }.
// Missing role = owner, missing active = true (admins created before roles keep every
// right — no data migration). firestore.rules / storage.rules apply the SAME defaults
// (isAdmin / isShopOwner). Every admin callable goes through requireRole().

export type AdminRole = 'owner' | 'staff';
export interface AdminCaller { uid: string; role: AdminRole; name: string }

const db = () => admin.firestore();

/** Role of an admins/{uid} doc's data, with the legacy default. */
export function roleOf(data: FirebaseFirestore.DocumentData | undefined): AdminRole {
  return data?.role === 'staff' ? 'staff' : 'owner';
}
/** Active unless explicitly deactivated. */
export function isActive(data: FirebaseFirestore.DocumentData | undefined): boolean {
  return data?.active !== false;
}

/** The caller's admin profile, or null (not an admin / deactivated). */
export async function adminCaller(uid: string | undefined, token?: Record<string, unknown>): Promise<AdminCaller | null> {
  if (!uid) return null;
  const snap = await db().collection('admins').doc(uid).get();
  if (!snap.exists || !isActive(snap.data())) return null;
  const name = String(snap.get('name') || token?.name || token?.email || 'Staff');
  return { uid, role: roleOf(snap.data()), name };
}

/**
 * Throws unless the caller is an ACTIVE admin with at least `min` ('staff' = any role,
 * 'owner' = owners only). details.code: unauthenticated | admins-only | owner-only.
 */
export async function requireRole(
  request: { auth?: { uid?: string; token?: Record<string, unknown> } | null },
  min: AdminRole,
): Promise<AdminCaller> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const caller = await adminCaller(uid, request.auth?.token as Record<string, unknown> | undefined);
  if (!caller) throw new HttpsError('permission-denied', 'Admins only.', { code: 'admins-only' });
  if (min === 'owner' && caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only an owner can do this.', { code: 'owner-only' });
  }
  return caller;
}

/** Active admin uids — every role, or only one. Used for in-app alert fan-outs. */
export async function adminUids(opts: { role?: AdminRole } = {}): Promise<string[]> {
  const snap = await db().collection('admins').get();
  return snap.docs
    .filter(d => isActive(d.data()) && (!opts.role || roleOf(d.data()) === opts.role))
    .map(d => d.id);
}

/** Is this uid an ACTIVE owner (booking exemptions in createReservations)? */
export async function isActiveOwner(uid: string): Promise<boolean> {
  const snap = await db().collection('admins').doc(uid).get();
  return snap.exists && isActive(snap.data()) && roleOf(snap.data()) === 'owner';
}
