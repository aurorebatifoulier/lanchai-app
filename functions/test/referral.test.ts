// applyInviteCode anti-abuse.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { fns, call, rejects, db, set, UID, seedBookingWorld } from './helpers';

const apply = (uid: string, code: string) => call(fns.applyInviteCode, { code }, uid);
const errCode = (code: string) => (e: { details?: { code?: string } }) => e.details?.code === code;

beforeEach(async () => {
  await seedBookingWorld();
  await set('inviteCodes/ANN-ABC', { uid: UID.A });
  await db().doc(`users/${UID.A}`).update({ inviteCode: 'ANN-ABC' });
  for (const [uid, email] of [[UID.A, 'ann@example.com'], [UID.B, 'bob@example.com']] as const) {
    await admin.auth().deleteUser(uid).catch(() => {});
    await admin.auth().createUser({ uid, email });
  }
});

describe('applyInviteCode', () => {
  test('success: link once + welcome code with the frozen %', async () => {
    const r = await apply(UID.B, 'ann-abc');
    assert.equal(r.ok, true);
    assert.equal((await db().doc(`referrals/${UID.B}`).get()).get('referrerUid'), UID.A);
    const grant = (await db().doc(`promoGrants/REFERRALWELCOME_${UID.B}`).get()).data()!;
    assert.deepEqual(grant.override, { type: 'percent', value: 10 });
    await assert.rejects(apply(UID.B, 'ANN-ABC'), errCode('already-referred'));
  });
  // (Same email as the referrer can't happen: Firebase Auth enforces one account per
  // email — the auth emulator refuses the duplicate; the server check stays as a guard.)
  test('own code, same phone → refused', async () => {
    await assert.rejects(apply(UID.A, 'ANN-ABC'), errCode('own-code'));
    const phone = (await db().doc(`users/${UID.A}`).get()).get('phone');
    await db().doc(`users/${UID.B}`).update({ phone });
    await assert.rejects(apply(UID.B, 'ANN-ABC'), errCode('own-code'));
  });
  test('after any booking (even cancelled), business accounts, unknown codes → refused', async () => {
    await set('reservations/x_1', { renterId: UID.B, status: 'cancelled' });
    await assert.rejects(apply(UID.B, 'ANN-ABC'), errCode('too-late'));
    await assert.rejects(apply(UID.BIZ, 'ANN-ABC'), errCode('not-eligible'));
    await rejects(apply(UID.A, 'ZZZ-999'), ['failed-precondition', 'invalid-argument']);
    await rejects(apply(UID.A, 'not a code'), 'invalid-argument');
  });
});
