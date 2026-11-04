// Every exported callable refuses unauthenticated, guest (anonymous) and — for staff
// callables — non-admin calls, BEFORE doing anything.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fns, call, rejects, UID, seedBookingWorld } from './helpers';

const ADMIN_ONLY = [
  'finalizeRentalAgreement', 'adminGrantPromo', 'adminRevokeGrant', 'recordIdCheck', 'adminIdentityAction',
  'adminRenterProfile', 'reviewResidency', 'adminLegacyResident', 'sendTestEmails',
];
const PUBLIC = ['requestPasswordReset']; // no account by design (always { ok: true }, rate-limited)

 
const callables = Object.entries(fns).filter(([, f]) => (f as any)?.__trigger?.callableTrigger || (f as any)?.__endpoint?.callableTrigger)
  .map(([name]) => name).sort();

before(seedBookingWorld);

test('the callable list is what this suite expects (a new callable must be added here)', () => {
  assert.deepEqual(callables, [
    'adminGrantPromo', 'adminIdentityAction', 'adminLegacyResident', 'adminRenterProfile', 'adminRevokeGrant',
    'applyInviteCode', 'createReservations', 'deleteMyAccount', 'deleteMyIdentityDocument', 'evaluateMyCodes',
    'finalizeRentalAgreement', 'getMyInviteCode', 'recordIdCheck', 'requestEmailVerification', 'requestPasswordReset',
    'resubmitBusinessApplication', 'reviewResidency', 'savePromoCode', 'sendTestEmails', 'sendWelcomeEmail',
    'submitIdentityDocument', 'submitResidencyRequest', 'validatePromoCode', 'withdrawResidency',
  ]);
});

describe('refusals', () => {
  for (const name of callables.filter(n => !PUBLIC.includes(n))) {
    const fn = (fns as Record<string, unknown>)[name];
    test(`${name}: unauthenticated and guest refused`, async () => {
      await rejects(call(fn, {}, null), 'unauthenticated');
      // Staff callables check the admins doc: a guest is simply not an admin.
      await rejects(call(fn, {}, UID.GUEST, 'anonymous'), ADMIN_ONLY.includes(name) ? ['unauthenticated', 'permission-denied'] : 'unauthenticated');
    });
    if (ADMIN_ONLY.includes(name)) {
      test(`${name}: renter and business account refused (admins only)`, async () => {
        await rejects(call(fn, {}, UID.A), 'permission-denied');
        await rejects(call(fn, {}, UID.BIZ), 'permission-denied');
      });
    }
  }
  test('requestPasswordReset is public but never reveals whether an account exists', async () => {
    const r = await call(fns.requestPasswordReset, { email: 'nobody-here@example.com' }, null);
    assert.deepEqual(r, { ok: true });
  });
});
