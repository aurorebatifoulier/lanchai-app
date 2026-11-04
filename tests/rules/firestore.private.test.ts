// Private per-renter data: chat, ID / residency, deletion log, watches, rental
// agreements, claims, item requests.
import { describe, test } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, addDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, UID } from './env';

setupRulesEnv();
const db = (p: keyof typeof as) => as[p]().firestore();

describe('conversations + messages', () => {
  const CV = 'fs:conversations/{conversationId}';
  const MS = 'fs:conversations/{conversationId}/messages/{messageId}';
  test('read: my thread only; listing is staff-only (admin inbox)', async () => {
    await ok(CV, getDoc(doc(db('A'), `conversations/${UID.A}`)));
    await ok(CV, getDocs(collection(db('admin'), 'conversations')));
    await no(CV, getDoc(doc(db('B'), `conversations/${UID.A}`)));
    await no(CV, getDocs(collection(db('A'), 'conversations')));
    await ok(MS, getDocs(collection(db('A'), `conversations/${UID.A}/messages`)));
    await no(MS, getDocs(collection(db('B'), `conversations/${UID.A}/messages`)));
    await no(MS, getDocs(collection(db('guest'), `conversations/${UID.A}/messages`)));
  });
  test('create thread: mine only, as myself; never as a guest', async () => {
    await no(CV, setDoc(doc(db('B'), `conversations/${UID.A}x`), { renterId: UID.B }));
    await no(CV, setDoc(doc(db('B'), `conversations/${UID.B}`), { renterId: UID.A }));
    await no(CV, setDoc(doc(db('guest'), `conversations/${UID.GUEST}`), { renterId: UID.GUEST }));
    await ok(CV, setDoc(doc(db('B'), `conversations/${UID.B}`), { renterId: UID.B, renterName: 'Bob', unreadByBusiness: 0, unreadByRenter: 0 }));
  });
  test('update thread: only +1 unread for staff / clear my own unread', async () => {
    const t = doc(db('A'), `conversations/${UID.A}`);
    await ok(CV, updateDoc(t, { lastMessage: 'Hi', lastMessageAt: serverTimestamp(), lastSenderType: 'renter', unreadByBusiness: 3 }));
    await ok(CV, updateDoc(t, { unreadByRenter: 0 }));
    await no(CV, updateDoc(t, { unreadByBusiness: 0 }));                         // hide my messages from staff
    await no(CV, updateDoc(t, { lastSenderType: 'business', lastMessage: 'x', lastMessageAt: serverTimestamp(), unreadByBusiness: 4 }));
    await no(CV, updateDoc(t, { renterId: UID.B }));
    await no(CV, updateDoc(doc(db('B'), `conversations/${UID.A}`), { unreadByRenter: 0 }));
    await no(CV, deleteDoc(t));
  });
  test('messages: post as myself (or the fixed welcome); never as staff, never edited', async () => {
    const col = collection(db('A'), `conversations/${UID.A}/messages`);
    await ok(MS, addDoc(col, { senderId: UID.A, senderType: 'renter', text: 'Hello', imageUrl: null, videoUrl: null, createdAt: serverTimestamp(), read: false }));
    await ok(MS, setDoc(doc(col, 'welcome'), { senderId: 'lanchai-business', senderType: 'business', text: 'Hi! How can we help you today?', imageUrl: null, videoUrl: null, createdAt: serverTimestamp(), read: false }));
    await no(MS, addDoc(col, { senderId: 'lanchai-business', senderType: 'business', text: 'Your deposit was refunded', imageUrl: null, videoUrl: null }));
    await no(MS, addDoc(col, { senderId: UID.B, senderType: 'renter', text: 'spoofed' }));
    await no(MS, addDoc(collection(db('B'), `conversations/${UID.A}/messages`), { senderId: UID.B, senderType: 'renter', text: 'hi' }));
    await no(MS, updateDoc(doc(col, 'm1'), { text: 'edited' }));
    await no(MS, deleteDoc(doc(col, 'm1')));
    await ok(MS, addDoc(collection(db('admin'), `conversations/${UID.A}/messages`), { senderId: 'lanchai-business', senderType: 'business', text: 'Reply' }));
  });
});

describe('identity, residency, deletion log (server-written)', () => {
  for (const [col, block] of [['identityChecks', 'fs:identityChecks/{uid}'], ['residencyRequests', 'fs:residencyRequests/{uid}']] as const) {
    test(col, async () => {
      await ok(block, getDoc(doc(db('A'), `${col}/${UID.A}`)));
      await ok(block, getDoc(doc(db('admin'), `${col}/${UID.A}`)));
      await no(block, getDoc(doc(db('B'), `${col}/${UID.A}`)));
      await no(block, getDocs(collection(db('A'), col)));
      await no(block, updateDoc(doc(db('A'), `${col}/${UID.A}`), { status: 'approved' }));
      await no(block, setDoc(doc(db('B'), `${col}/${UID.B}`), { status: 'on_file' }));
      await no(block, setDoc(doc(db('admin'), `${col}/${UID.B}`), { status: 'on_file' }));
    });
  }
  test('docDeletionLog: admin read only', async () => {
    const D = 'fs:docDeletionLog/{entryId}';
    await ok(D, getDocs(collection(db('admin'), 'docDeletionLog')));
    await no(D, getDocs(collection(db('A'), 'docDeletionLog')));
    await no(D, deleteDoc(doc(db('admin'), 'docDeletionLog/d1')));
  });
});

describe('watches', () => {
  test('availability watches: my own, exact shape and id', async () => {
    const W = 'fs:availabilityWatches/{watchId}';
    await ok(W, getDocs(query(collection(db('A'), 'availabilityWatches'), where('uid', '==', UID.A))));
    await ok(W, setDoc(doc(db('A'), `availabilityWatches/${UID.A}_p2`), { uid: UID.A, productId: 'p2', createdAt: serverTimestamp() }));
    await ok(W, deleteDoc(doc(db('A'), `availabilityWatches/${UID.A}_p2`)));
    await no(W, getDocs(collection(db('A'), 'availabilityWatches')));
    await no(W, getDoc(doc(db('B'), `availabilityWatches/${UID.A}_p1`)));
    await no(W, setDoc(doc(db('B'), `availabilityWatches/${UID.A}_p3`), { uid: UID.A, productId: 'p3' }));
    await no(W, setDoc(doc(db('A'), `availabilityWatches/${UID.A}_zz`), { uid: UID.A, productId: 'p4' }));
    await no(W, setDoc(doc(db('guest'), `availabilityWatches/${UID.GUEST}_p1`), { uid: UID.GUEST, productId: 'p1' }));
    await no(W, deleteDoc(doc(db('B'), `availabilityWatches/${UID.A}_p1`)));
    await no(W, updateDoc(doc(db('A'), `availabilityWatches/${UID.A}_p1`), { productId: 'p9' }));
  });
  test('category watches: my own, exact shape and id', async () => {
    const W = 'fs:categoryWatches/{watchId}';
    await ok(W, setDoc(doc(db('A'), `categoryWatches/${UID.A}_tools`), { uid: UID.A, category: 'tools', createdAt: serverTimestamp() }));
    await ok(W, getDoc(doc(db('A'), `categoryWatches/${UID.A}_fun`)));
    await no(W, getDoc(doc(db('B'), `categoryWatches/${UID.A}_fun`)));
    await no(W, setDoc(doc(db('B'), `categoryWatches/${UID.A}_kids`), { uid: UID.A, category: 'kids' }));
    await no(W, setDoc(doc(db('guest'), `categoryWatches/${UID.GUEST}_fun`), { uid: UID.GUEST, category: 'fun' }));
    await no(W, setDoc(doc(db('A'), `categoryWatches/${UID.A}_${'x'.repeat(31)}`), { uid: UID.A, category: 'x'.repeat(31) }));
  });
});

describe('rental agreements', () => {
  test('renter reads own agreement; staff audit admin-only; nobody writes', async () => {
    const AG = 'fs:rentalAgreements/{agreementId}';
    const IN = 'fs:rentalAgreements/{agreementId}/internal/{docId}';
    await ok(AG, getDoc(doc(db('A'), 'rentalAgreements/ag1')));
    await ok(AG, getDoc(doc(db('admin'), 'rentalAgreements/ag1')));
    await no(AG, getDoc(doc(db('B'), 'rentalAgreements/ag1')));
    await no(AG, updateDoc(doc(db('admin'), 'rentalAgreements/ag1'), { renterId: UID.B }));
    await ok(IN, getDoc(doc(db('admin'), 'rentalAgreements/ag1/internal/audit')));
    await no(IN, getDoc(doc(db('A'), 'rentalAgreements/ag1/internal/audit'))); // staff name
    await no(IN, setDoc(doc(db('admin'), 'rentalAgreements/ag1/internal/audit'), { staffName: 'x' }));
  });
});

describe('claims', () => {
  const CL = 'fs:claims/{claimId}';
  const claim = (over: Record<string, unknown> = {}) => ({
    userId: UID.A, reservationId: 'rAret', productId: 'p1', type: 'other', description: 'Missing strap',
    photos: [], status: 'open', adminResponse: null, createdAt: serverTimestamp(), ...over,
  });
  test('create: on MY reservation, open, no admin reply', async () => {
    await ok(CL, addDoc(collection(db('A'), 'claims'), claim()));
    await no(CL, addDoc(collection(db('B'), 'claims'), claim({ userId: UID.B })));              // A's reservation
    await no(CL, addDoc(collection(db('A'), 'claims'), claim({ status: 'resolved' })));
    await no(CL, addDoc(collection(db('A'), 'claims'), claim({ adminResponse: 'Refund approved' })));
    await no(CL, addDoc(collection(db('A'), 'claims'), claim({ productId: 'other' })));
    await no(CL, addDoc(collection(db('guest'), 'claims'), claim({ userId: UID.GUEST })));
  });
  test('read own / admin; update + delete admin only', async () => {
    await ok(CL, getDoc(doc(db('A'), 'claims/cl1')));
    await ok(CL, updateDoc(doc(db('admin'), 'claims/cl1'), { status: 'in_review' }));
    await no(CL, getDoc(doc(db('B'), 'claims/cl1')));
    await no(CL, getDocs(collection(db('A'), 'claims')));
    await no(CL, updateDoc(doc(db('A'), 'claims/cl1'), { status: 'resolved' }));
    await no(CL, deleteDoc(doc(db('A'), 'claims/cl1')));
  });
});

describe('requests ("Ask for an item")', () => {
  const RQ = 'fs:requests/{requestId}';
  const req = (over: Record<string, unknown> = {}) => ({
    text: 'Stand-up paddle board', contact: null, category: 'sports', renterId: UID.A, renterName: 'Ann',
    status: 'new', createdAt: serverTimestamp(), ...over,
  });
  test('create as myself, status new, server time, valid category', async () => {
    await ok(RQ, addDoc(collection(db('A'), 'requests'), req()));
    await no(RQ, addDoc(collection(db('A'), 'requests'), req({ renterId: UID.B })));
    await no(RQ, addDoc(collection(db('A'), 'requests'), req({ status: 'added' })));
    await no(RQ, addDoc(collection(db('A'), 'requests'), req({ category: 'weapons' })));
    await no(RQ, addDoc(collection(db('A'), 'requests'), req({ createdAt: new Date(0) })));
    await no(RQ, addDoc(collection(db('A'), 'requests'), req({ text: 'x'.repeat(1001) })));
    await no(RQ, addDoc(collection(db('guest'), 'requests'), req({ renterId: UID.GUEST })));
  });
  test('read / update: admin only', async () => {
    await ok(RQ, getDocs(collection(db('admin'), 'requests')));
    await ok(RQ, updateDoc(doc(db('admin'), 'requests/q1'), { status: 'ordered' }));
    await no(RQ, getDoc(doc(db('A'), 'requests/q1')));
    await no(RQ, updateDoc(doc(db('A'), 'requests/q1'), { status: 'added', productId: 'p1' }));
  });
});
