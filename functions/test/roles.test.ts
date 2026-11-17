// Admin roles (phase 2): requireRole on admin callables + the Team callables.
// Legacy admin docs (no role) are owners; a deactivated member is refused everywhere.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { fns, call, rejects, set, db, clearFirestore, UID } from './helpers';

const OWNER = 'ownerOooo1';
const STAFF = 'staffSsss1';
const STAFF_OFF = 'staffOff01';

async function resetAuth() {
  const { users } = await admin.auth().listUsers(1000);
  if (users.length) await admin.auth().deleteUsers(users.map(u => u.uid));
}

beforeEach(async () => {
  await clearFirestore();
  await resetAuth();
  await set(`admins/${UID.ADMIN}`, {}); // legacy: no role → owner
  await set(`admins/${OWNER}`, { role: 'owner', active: true, name: 'Olga' });
  await set(`admins/${STAFF}`, { role: 'staff', active: true, name: 'Sam' });
  await set(`admins/${STAFF_OFF}`, { role: 'staff', active: false, name: 'Old' });
  await admin.auth().createUser({ uid: 'newbie0001', email: 'newbie@example.com', password: 'secret123', displayName: 'Nina' });
});

test('owner-only callables refuse staff (owner-only) and deactivated staff (admins-only)', async () => {
  await rejects(call(fns.teamList, {}, STAFF), 'permission-denied', 'owner-only');
  await rejects(call(fns.teamList, {}, STAFF_OFF), 'permission-denied', 'admins-only');
  await rejects(call(fns.teamList, {}, UID.A), 'permission-denied', 'admins-only');
  await rejects(call(fns.reviewResidency, { uid: UID.A, decision: 'approve' }, STAFF), 'permission-denied', 'owner-only');
  await rejects(call(fns.adminGrantPromo, { code: 'X', uids: [UID.A] }, STAFF), 'permission-denied', 'owner-only');
  await rejects(call(fns.sendTestEmails, {}, STAFF), 'permission-denied', 'owner-only');
});

test('legacy admin (no role) is an owner', async () => {
  const r = await call(fns.teamList, {}, UID.ADMIN);
  assert.ok(r.members.length >= 4);
});

test('declining an ID is owner-only; staff pass the role check for counter photos', async () => {
  await rejects(call(fns.adminIdentityAction, { renterId: UID.A, action: 'reject', reason: 'unreadable' }, STAFF), 'permission-denied', 'owner-only');
  // Staff: past the role check → fails later on the (missing) files, not on permissions.
  await rejects(call(fns.adminIdentityAction, { renterId: UID.A, action: 'set', docType: 'passport', files: [] }, STAFF), ['invalid-argument', 'failed-precondition']);
  await rejects(call(fns.adminIdentityAction, { renterId: UID.A, action: 'set', docType: 'passport', files: [] }, STAFF_OFF), 'permission-denied', 'admins-only');
});

test('team: add by email (existing account), change role, deactivate', async () => {
  await rejects(call(fns.teamAddMember, { email: 'nobody@example.com', role: 'staff' }, OWNER), 'not-found', 'no-account');
  const { uid } = await call(fns.teamAddMember, { email: 'Newbie@Example.com', role: 'staff' }, OWNER);
  const doc = (await db().doc(`admins/${uid}`).get()).data()!;
  assert.equal(doc.role, 'staff');
  assert.equal(doc.active, true);
  assert.equal(doc.name, 'Nina');
  await rejects(call(fns.teamAddMember, { email: 'newbie@example.com', role: 'staff' }, OWNER), 'failed-precondition', 'already-member');

  await call(fns.teamUpdateMember, { uid, active: false }, OWNER);
  assert.equal((await db().doc(`admins/${uid}`).get()).get('active'), false);
  // Deactivated → refused at once by every admin callable.
  await rejects(call(fns.adminRenterProfile, { renterId: UID.A, action: 'get' }, uid), 'permission-denied', 'admins-only');

  const audit = await db().collection('auditLog').where('targetUid', '==', uid).get();
  assert.equal(audit.size, 2);
  assert.ok(audit.docs.every(d => d.get('byUid') === OWNER && d.get('byRole') === 'owner'));
});

test('team: always one active owner; no self-demotion / self-deactivation', async () => {
  await rejects(call(fns.teamUpdateMember, { uid: OWNER, role: 'staff' }, OWNER), 'failed-precondition', 'self');
  await rejects(call(fns.teamUpdateMember, { uid: OWNER, active: false }, OWNER), 'failed-precondition', 'self');
  // Two owners (OWNER + legacy ADMIN): one can demote the other…
  await call(fns.teamUpdateMember, { uid: UID.ADMIN, role: 'staff' }, OWNER);
  // …but the last remaining owner can't be removed by anyone left (staff can't call it).
  await rejects(call(fns.teamUpdateMember, { uid: OWNER, role: 'staff' }, UID.ADMIN), 'permission-denied', 'owner-only');
  await rejects(call(fns.teamUpdateMember, { uid: STAFF, role: 'owner' }, STAFF), 'permission-denied', 'owner-only');
});

test('alerts go to ACTIVE admins only (deactivated staff gets nothing)', async () => {
  await set('requests/q1', { text: 'Paddle board', renterId: UID.A, renterName: 'Ann', status: 'new' });
  const wrapped = (await import('./helpers')).fft.wrap(fns.onItemRequestCreated) as unknown as (e: unknown) => Promise<void>;
  const snap = await db().doc('requests/q1').get();
  await wrapped({ data: snap, params: { requestId: 'q1' } });
  const got = async (uid: string) => (await db().collection(`notifications/${uid}/items`).get()).size;
  assert.equal(await got(STAFF), 1);
  assert.equal(await got(OWNER), 1);
  assert.equal(await got(STAFF_OFF), 0);
});
