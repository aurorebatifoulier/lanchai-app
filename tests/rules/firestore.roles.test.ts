// Admin roles (phase 2): owner vs staff vs deactivated staff vs legacy admin (no role =
// owner). Staff serve one customer at the counter; everything that changes prices,
// fees, settlements, catalogue, marketing or settings is owner-only — and a deactivated
// member is refused everywhere.
import { describe, test } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, getDocs, addDoc, collection, query, where,
} from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, UID } from './env';

setupRulesEnv();
const db = (p: keyof typeof as) => as[p]().firestore();

describe('admins', () => {
  test('own doc for everyone; owners read the team; staff never read others', async () => {
    const P = 'fs:admins/{uid}';
    await ok(P, getDoc(doc(db('staff'), `admins/${UID.STAFF}`)));
    await ok(P, getDoc(doc(db('owner'), `admins/${UID.STAFF}`)));
    await ok(P, getDocs(collection(db('owner'), 'admins')));
    await ok(P, getDocs(collection(db('admin'), 'admins'))); // legacy admin = owner
    await no(P, getDoc(doc(db('staff'), `admins/${UID.OWNER}`)));
    await no(P, getDocs(collection(db('staff'), 'admins')));
    await no(P, setDoc(doc(db('owner'), `admins/${UID.A}`), { role: 'staff' })); // Team callables only
    await no(P, updateDoc(doc(db('staff'), `admins/${UID.STAFF}`), { role: 'owner' }));
  });
});

describe('catalogue, marketing, settings = owner', () => {
  test('products: staff read, never edit; owner edits', async () => {
    const P = 'fs:products/{productId}';
    await ok(P, getDoc(doc(db('staff'), 'products/p1')));
    await ok(P, updateDoc(doc(db('owner'), 'products/p1'), { pricePerDay: 11 }));
    await no(P, updateDoc(doc(db('staff'), 'products/p1'), { pricePerDay: 1 }));
    await no(P, updateDoc(doc(db('staff'), 'products/p1'), { deposit: 0 }));
    await no(P, setDoc(doc(db('staff'), 'products/s1'), { name: 'X', categories: ['tools'] }));
  });
  test('stock log: staff read; manual adjustments = owner', async () => {
    const P = 'fs:products/{productId}/stockAdjustments/{adjustmentId}';
    await ok(P, getDocs(collection(db('staff'), 'products/p1/stockAdjustments')));
    await ok(P, addDoc(collection(db('owner'), 'products/p1/stockAdjustments'), { field: 'lostUnits', delta: 1 }));
    await no(P, addDoc(collection(db('staff'), 'products/p1/stockAdjustments'), { field: 'lostUnits', delta: 1 }));
    await no(P, getDocs(collection(db('staffOff'), 'products/p1/stockAdjustments')));
  });
  test('collections, home slides, broadcasts, promo codes', async () => {
    await ok('fs:collections/{collectionId}', updateDoc(doc(db('owner'), 'collections/c1'), { title: 'W' }));
    await no('fs:collections/{collectionId}', updateDoc(doc(db('staff'), 'collections/c1'), { title: 'W' }));
    await ok('fs:homeSlides/{slideId}', updateDoc(doc(db('owner'), 'homeSlides/h1'), { order: 2 }));
    await no('fs:homeSlides/{slideId}', updateDoc(doc(db('staff'), 'homeSlides/h1'), { order: 2 }));
    await ok('fs:broadcasts/{id}', setDoc(doc(db('owner'), 'broadcasts/b9'), { title: 'Hi' }));
    await no('fs:broadcasts/{id}', setDoc(doc(db('staff'), 'broadcasts/b9'), { title: 'Hi' }));
    await ok('fs:promoCodes/{code}', getDoc(doc(db('owner'), 'promoCodes/SUMMER10')));
    await no('fs:promoCodes/{code}', getDoc(doc(db('staff'), 'promoCodes/SUMMER10')));
    await no('fs:promoCodes/{code}/uses/{uid}', getDoc(doc(db('staff'), `promoCodes/USEDONE/uses/${UID.A}`)));
    await no('fs:promoGrants/{grantId}', getDoc(doc(db('staff'), `promoGrants/SUMMER10_${UID.A}`)));
  });
  test('config: staff read the late policy only; writes = owner', async () => {
    const P = 'fs:config/{docId}';
    await ok(P, getDoc(doc(db('staff'), 'config/latePolicy')));
    await ok(P, getDoc(doc(db('owner'), 'config/emailSettings')));
    await ok(P, setDoc(doc(db('owner'), 'config/shop'), { openTime: '08:30' }, { merge: true }));
    await no(P, getDoc(doc(db('staff'), 'config/emailSettings')));
    await no(P, getDoc(doc(db('staff'), 'config/residency')));
    await no(P, setDoc(doc(db('staff'), 'config/pricing'), { exchangeRate: 1 }, { merge: true }));
    await no(P, setDoc(doc(db('staff'), 'config/latePolicy'), { graceHours: 0 }, { merge: true }));
    await no(P, getDoc(doc(db('staffOff'), 'config/latePolicy')));
  });
  test('owner-only reads: loyalty history, residency, deletion log, referrals, job health', async () => {
    await ok('fs:users/{userId}/loyaltyHistory/{entryId}', getDocs(collection(db('owner'), `users/${UID.A}/loyaltyHistory`)));
    await no('fs:users/{userId}/loyaltyHistory/{entryId}', getDocs(collection(db('staff'), `users/${UID.A}/loyaltyHistory`)));
    await ok('fs:residencyRequests/{uid}', getDoc(doc(db('owner'), `residencyRequests/${UID.A}`)));
    await no('fs:residencyRequests/{uid}', getDoc(doc(db('staff'), `residencyRequests/${UID.A}`)));
    await no('fs:docDeletionLog/{entryId}', getDocs(collection(db('staff'), 'docDeletionLog')));
    await no('fs:referrals/{referredUid}', getDoc(doc(db('staff'), `referrals/${UID.B}`)));
    await no('fs:jobHealth/{jobName}', getDocs(collection(db('staff'), 'jobHealth')));
  });
  test('reviews moderation and claim decisions = owner', async () => {
    const R = 'fs:reviews/{productId}/reviews/{reservationId}';
    await ok(R, updateDoc(doc(db('owner'), 'reviews/p1/reviews/rAold'), { adminReply: 'Thanks!' }));
    await no(R, updateDoc(doc(db('staff'), 'reviews/p1/reviews/rAold'), { adminReply: 'Thanks!' }));
    const C = 'fs:claims/{claimId}';
    await ok(C, getDoc(doc(db('staff'), 'claims/cl1')));
    await ok(C, updateDoc(doc(db('owner'), 'claims/cl1'), { status: 'in_review' }));
    await no(C, updateDoc(doc(db('staff'), 'claims/cl1'), { status: 'resolved', adminResponse: 'ok' }));
  });
});

describe('counter work = staff', () => {
  test('reservations, chat, requests, saved replies, tasks: staff yes, deactivated no', async () => {
    await ok('fs:reservations/{reservationId}', getDoc(doc(db('staff'), 'reservations/rA')));
    await no('fs:reservations/{reservationId}', getDoc(doc(db('staffOff'), 'reservations/rA')));
    await ok('fs:conversations/{conversationId}', getDocs(collection(db('staff'), 'conversations')));
    await no('fs:conversations/{conversationId}', getDocs(collection(db('staffOff'), 'conversations')));
    await ok('fs:requests/{requestId}', getDocs(query(collection(db('staff'), 'requests'), where('status', '==', 'new'))));
    await no('fs:requests/{requestId}', getDocs(collection(db('staffOff'), 'requests')));
    await ok('fs:savedReplies/{replyId}', addDoc(collection(db('staff'), 'savedReplies'), { text: 'See you soon' }));
    await no('fs:savedReplies/{replyId}', addDoc(collection(db('staffOff'), 'savedReplies'), { text: 'x' }));
    await ok('fs:adminTasks/{taskId}', getDocs(collection(db('staff'), 'adminTasks')));
    await ok('fs:identityChecks/{uid}', getDoc(doc(db('staff'), `identityChecks/${UID.A}`)));
    await no('fs:identityChecks/{uid}', getDoc(doc(db('staffOff'), `identityChecks/${UID.A}`)));
  });
  test('users: staff only verify a phone in person; owner edits more', async () => {
    const P = 'fs:users/{userId}';
    await ok(P, getDoc(doc(db('staff'), `users/${UID.A}`)));
    await ok(P, updateDoc(doc(db('staff'), `users/${UID.A}`), { phoneVerified: true }));
    await ok(P, updateDoc(doc(db('owner'), `users/${UID.A}`), { customerType: 'resident' }));
    await no(P, updateDoc(doc(db('staff'), `users/${UID.A}`), { customerType: 'business' }));
    await no(P, updateDoc(doc(db('staff'), `users/${UID.A}`), { loyaltyPoints: 9999 }));
    await no(P, updateDoc(doc(db('staff'), `users/${UID.A}`), { phoneVerified: false }));
    await no(P, updateDoc(doc(db('staffOff'), `users/${UID.A}`), { phoneVerified: true }));
  });
});
