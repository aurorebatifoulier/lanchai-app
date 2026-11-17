import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireRole, roleOf, isActive, type AdminRole } from './adminAuth';
import { writeAudit } from './audit';

// Admin → Team (owner only). admins/{uid} is never client-writable: these callables are
// the only way to add a member, change a role or deactivate someone. Deactivation is
// instant — firestore.rules / storage.rules / requireRole read `active` on every request.
// Guard: there is always at least one ACTIVE owner, and an owner can't demote or
// deactivate themselves.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'not-found' = 'failed-precondition'): never => {
  throw new HttpsError(status, message, { code });
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: AdminRole[] = ['owner', 'staff'];

export interface TeamMember { uid: string; name: string; email: string; role: AdminRole; active: boolean }

// teamList() → { members } — every admin, legacy docs shown with their default role.
export const teamList = onCall({ region: REGION }, async request => {
  await requireRole(request, 'owner');
  const snap = await db().collection('admins').get();
  const members: TeamMember[] = await Promise.all(snap.docs.map(async d => {
    let email = String(d.get('email') ?? '');
    let name = String(d.get('name') ?? '');
    if (!email || !name) {
      const u = await admin.auth().getUser(d.id).catch(() => null);
      email ||= u?.email ?? '';
      name ||= u?.displayName ?? '';
    }
    return { uid: d.id, name: name || email || d.id, email, role: roleOf(d.data()), active: isActive(d.data()) };
  }));
  members.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1));
  return { members };
});

// teamAddMember({ email, role, name? }) — the person must already have an account.
export const teamAddMember = onCall({ region: REGION }, async request => {
  const caller = await requireRole(request, 'owner');
  const d = (request.data ?? {}) as { email?: unknown; role?: unknown; name?: unknown };
  const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) fail('invalid-email', 'Enter a valid email address.', 'invalid-argument');
  const role = ROLES.includes(d.role as AdminRole) ? (d.role as AdminRole) : fail('invalid-role', 'Choose a role.', 'invalid-argument');
  const user = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!user) fail('no-account', 'No account with this email. Ask them to sign up in the app first.', 'not-found');
  if (user!.providerData.length === 0) fail('no-account', 'This is a guest session, not an account.', 'not-found');
  const ref = db().collection('admins').doc(user!.uid);
  if ((await ref.get()).exists) fail('already-member', 'This person is already in the team.');
  const name = (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : user!.displayName || email).slice(0, 80);
  await ref.set({
    role, active: true, name, email,
    addedAt: FieldValue.serverTimestamp(), addedBy: caller.uid,
  });
  await writeAudit(caller, { action: 'team.add', note: `${name} · ${role}`, targetUid: user!.uid });
  logger.info('[team] member added', { by: caller.uid, uid: user!.uid, role });
  return { uid: user!.uid };
});

// teamUpdateMember({ uid, role?, active?, name? })
export const teamUpdateMember = onCall({ region: REGION }, async request => {
  const caller = await requireRole(request, 'owner');
  const d = (request.data ?? {}) as { uid?: unknown; role?: unknown; active?: unknown; name?: unknown };
  const uid = typeof d.uid === 'string' ? d.uid : '';
  if (!uid) fail('invalid-request', 'Missing member.', 'invalid-argument');
  const ref = db().collection('admins').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) fail('not-member', 'This person is not in the team.', 'not-found');

  const patch: Record<string, unknown> = {};
  if (d.role !== undefined) {
    if (!ROLES.includes(d.role as AdminRole)) fail('invalid-role', 'Choose a role.', 'invalid-argument');
    patch.role = d.role;
  }
  if (d.active !== undefined) {
    if (typeof d.active !== 'boolean') fail('invalid-request', 'Invalid status.', 'invalid-argument');
    patch.active = d.active;
  }
  if (typeof d.name === 'string' && d.name.trim()) patch.name = d.name.trim().slice(0, 80);
  if (Object.keys(patch).length === 0) return { ok: true };

  const losesOwner = roleOf(snap.data()) === 'owner' && isActive(snap.data())
    && (patch.role === 'staff' || patch.active === false);
  if (losesOwner) {
    if (uid === caller.uid) fail('self', 'You can’t remove your own owner access. Ask another owner.');
    const owners = (await db().collection('admins').get()).docs
      .filter(x => x.id !== uid && isActive(x.data()) && roleOf(x.data()) === 'owner');
    if (owners.length === 0) fail('last-owner', 'There must always be at least one active owner.');
  }
  if (uid === caller.uid && patch.active === false) fail('self', 'You can’t deactivate yourself.');

  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid }, { merge: true });
  const what = [patch.role && `role ${patch.role}`, patch.active === false && 'deactivated', patch.active === true && 'reactivated', patch.name && 'renamed']
    .filter(Boolean).join(', ');
  await writeAudit(caller, { action: 'team.update', note: `${String(snap.get('name') ?? uid)}: ${what}`, targetUid: uid });
  logger.info('[team] member updated', { by: caller.uid, uid, patch: Object.keys(patch) });
  return { ok: true };
});
