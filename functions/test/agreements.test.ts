// finalizeRentalAgreement: staff only; refuses without the uploaded PDF.
import { test, beforeEach } from 'node:test';
import { fns, call, rejects, set, UID, seedBookingWorld } from './helpers';

beforeEach(async () => {
  await seedBookingWorld();
  await set('reservations/LNC-20261114-ABCD_1', { renterId: UID.A, orderId: 'LNC-20261114-ABCD', status: 'confirmed', productId: 'kayak' });
});

const req = { agreementId: 'LNC-20261114-ABCD-k1', reservationIds: ['LNC-20261114-ABCD_1'], method: 'signature' };

test('renter (even the one renting) cannot finalize their own agreement', async () => {
  await rejects(call(fns.finalizeRentalAgreement, req, UID.A), 'permission-denied');
});

test('admin: refused while the PDF is missing in Storage', async () => {
  await rejects(call(fns.finalizeRentalAgreement, req, UID.ADMIN), ['failed-precondition', 'invalid-argument', 'not-found']);
});
