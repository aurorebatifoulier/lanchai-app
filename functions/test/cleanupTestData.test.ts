import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { clearFirestore, db } from './helpers';
import { planCleanup, runCleanup, describePlan } from '../scripts/cleanupTestData';

// Pre-beta cleanup tool (scripts/cleanupTestData.ts): the dry run changes nothing, the run
// deletes every non-admin account + activity data and keeps the catalogue / config /
// admins. Emulators only.

const ADMIN = 'adminCln1';
const A = 'renterCln1';
const GUEST = 'guestCln1';
const bucket = () => admin.storage().bucket();

async function clearAuth() {
  const { users } = await admin.auth().listUsers(1000);
  if (users.length) await admin.auth().deleteUsers(users.map(u => u.uid));
}
async function put(path: string) {
  await bucket().file(path).save(Buffer.from('x'), { contentType: 'image/jpeg' });
}
async function exists(path: string) {
  return (await bucket().file(path).exists())[0];
}

before(async () => {
  await clearFirestore();
  await clearAuth();
  await bucket().deleteFiles({ force: true }).catch(() => {});
  const d = db();
  await admin.auth().createUser({ uid: ADMIN, email: 'admin@example.com', password: 'secret123' });
  await admin.auth().createUser({ uid: A, email: 'renter@example.com', password: 'secret123' });
  await admin.auth().createUser({ uid: GUEST }); // anonymous guest: no provider, no email
  await d.doc(`admins/${ADMIN}`).set({ role: 'admin' });
  await d.doc(`users/${ADMIN}`).set({ firstName: 'Ada', phone: '+85620000000', loyaltyPoints: 120, inviteCode: 'ADA-123' });
  await d.doc(`users/${ADMIN}/favorites/p1`).set({ at: 1 });
  await d.doc(`users/${A}`).set({ firstName: 'Ren', loyaltyPoints: 40 });
  await d.doc(`users/${A}/bag/i1`).set({ productId: 'p1' });
  await d.doc('reservations/LNC-1_1').set({ renterId: A, status: 'returned' });
  await d.doc(`notifications/${A}/items/n1`).set({ title: 'Hi' }); // parent doc never created
  await d.doc(`conversations/${A}/messages/m1`).set({ text: 'hello' });
  await d.doc('reviews/p1/reviews/LNC-1_1').set({ rating: 5 });
  await d.doc('inviteCodes/ADA-123').set({ uid: ADMIN });
  await d.doc('products/p1').set({ name: 'Speaker', rentalCount: 3, reviewCount: 1, averageRating: 5, lostUnits: 1, pendingSettlementUnits: 0, rentalsByMonth: { '2026-10': 3 } });
  await d.doc('products/p2').set({ name: 'Tent' }); // untouched product
  await d.doc('promoCodes/WELCOME').set({ usedCount: 2, discountGivenLak: 50000, active: true });
  await d.doc(`promoCodes/WELCOME/uses/${A}`).set({ count: 1 });
  await d.doc('config/shop').set({ openTime: '09:00' });
  await d.doc('collections/c1').set({ title: 'Camping' });
  await put(`chat-images/${A}/1.jpg`);
  await put(`idDocs/${A}/id_1.jpg`);
  await put(`profile-photos/${A}/me.jpg`);
  await put(`profile-photos/${ADMIN}/me.jpg`);
  await put('products/p1/photo.jpg');
});

test('dry run lists the data and changes nothing', async () => {
  const plan = await planCleanup();
  assert.deepEqual(plan.admins, [ADMIN]);
  assert.deepEqual(plan.authUsersToDelete.map(u => `${u.uid}:${u.kind}`).sort(), [`${A}:account`, `${GUEST}:anonymous`].sort());
  assert.deepEqual(plan.usersDocsToDelete, [A]);
  assert.deepEqual(plan.adminFieldsToRemove, [{ uid: ADMIN, fields: ['inviteCode', 'loyaltyPoints'] }]);
  assert.deepEqual(plan.adminSubcollections, [{ uid: ADMIN, collections: ['favorites'] }]);
  const docs = Object.fromEntries(plan.collections.map(c => [c.name, c.docs]));
  assert.equal(docs.reservations, 1);
  assert.equal(docs.notifications, 1, 'a parent that only holds items still counts');
  assert.equal(docs.conversations, 1);
  assert.equal(Object.fromEntries(plan.storage.map(s => [s.prefix, s.files]))['chat-images/'], 1);
  assert.equal(plan.profilePhotosToDelete, 1);
  assert.deepEqual(plan.products.map(p => p.id), ['p1']);
  assert.deepEqual(plan.promoCodes, [{ code: 'WELCOME', usedCount: 2, discountGivenLak: 50000, uses: 1 }]);
  assert.doesNotMatch(describePlan(plan), /renter@example\.com|Ren\b/, 'the summary never shows personal data');
  // Nothing changed
  assert.ok((await db().doc('reservations/LNC-1_1').get()).exists);
  assert.equal((await admin.auth().listUsers()).users.length, 3);
  assert.ok(await exists(`chat-images/${A}/1.jpg`));
});

test('run deletes test data and keeps catalogue, config and admins', async () => {
  await runCleanup(await planCleanup());
  const d = db();
  // Accounts
  assert.deepEqual((await admin.auth().listUsers()).users.map(u => u.uid), [ADMIN]);
  assert.equal((await d.doc(`users/${A}`).get()).exists, false);
  assert.equal((await d.collection(`users/${A}/bag`).get()).size, 0);
  const adminDoc = (await d.doc(`users/${ADMIN}`).get()).data();
  assert.deepEqual(adminDoc, { firstName: 'Ada', phone: '+85620000000' });
  assert.equal((await d.collection(`users/${ADMIN}/favorites`).get()).size, 0);
  assert.ok((await d.doc(`admins/${ADMIN}`).get()).exists);
  // Activity
  for (const path of ['reservations', `notifications/${A}/items`, `conversations/${A}/messages`, 'reviews/p1/reviews', 'inviteCodes']) {
    assert.equal((await d.collection(path).get()).size, 0, path);
  }
  // Catalogue / config kept, counters reset with an audit line
  const p1 = (await d.doc('products/p1').get()).data()!;
  assert.equal(p1.name, 'Speaker');
  assert.equal(p1.rentalCount, 0); assert.equal(p1.lostUnits, 0); assert.equal(p1.averageRating, 0);
  assert.equal(p1.rentalsByMonth, undefined);
  const audit = (await d.collection('products/p1/stockAdjustments').get()).docs.map(x => x.data());
  assert.deepEqual(audit.map(a => [a.field, a.delta]), [['lostUnits', -1]]);
  assert.deepEqual((await d.doc('products/p2').get()).data(), { name: 'Tent' });
  const promo = (await d.doc('promoCodes/WELCOME').get()).data()!;
  assert.equal(promo.usedCount, 0); assert.equal(promo.active, true);
  assert.equal((await d.collection('promoCodes/WELCOME/uses').get()).size, 0);
  assert.ok((await d.doc('config/shop').get()).exists);
  assert.ok((await d.doc('collections/c1').get()).exists);
  // Storage
  assert.equal(await exists(`chat-images/${A}/1.jpg`), false);
  assert.equal(await exists(`idDocs/${A}/id_1.jpg`), false);
  assert.equal(await exists(`profile-photos/${A}/me.jpg`), false);
  assert.ok(await exists(`profile-photos/${ADMIN}/me.jpg`));
  assert.ok(await exists('products/p1/photo.jpg'));
  // A second dry run finds nothing left to delete
  const again = await planCleanup();
  assert.equal(again.authUsersToDelete.length, 0);
  assert.ok(again.collections.every(c => c.docs === 0));
  assert.equal(again.products.length, 0);
});
