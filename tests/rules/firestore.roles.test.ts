// Admin roles (phase 2): owner vs staff vs deactivated staff vs legacy admin (no role =
// owner). Staff serve one customer at the counter; everything that changes prices,
// fees, settlements, catalogue, marketing or settings is owner-only — and a deactivated
// member is refused everywhere.
import { describe, test } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, addDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, UID, auditedUpdate } from './env';

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
    await ok(C, auditedUpdate(db('owner'), UID.OWNER, 'owner', 'claims/cl1', { status: 'in_review' }));
    await no(C, auditedUpdate(db('staff'), UID.STAFF, 'staff', 'claims/cl1', { status: 'resolved', adminResponse: 'ok' }));
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

describe('staff counter writes on reservations (allow-list)', () => {
  const P = 'fs:reservations/{reservationId}';
  const at = () => serverTimestamp();
  test('confirm payment, hand over, cancel with a reason, no-show', async () => {
    const staff = (path: string, data: Record<string, unknown>) => auditedUpdate(db('staff'), UID.STAFF, 'staff', path, data);
    // Every admin write names its state-machine action (lastAction) — exhaustive
    // phase × action × role cases: tests/rules/reservationMachine.test.ts.
    await ok(P, staff('reservations/sPend', { status: 'confirmed', updatedAt: at(), lastAction: 'confirm_payment' }));
    // Handover = server only (submitHandover: state machine + unit physically in the shop).
    await no(P, staff('reservations/sConf', {
      status: 'active', handoverChecklist: { photos: [], depositCurrency: 'LAK', depositAmount: 500_000 }, updatedAt: at(), lastAction: 'handover',
    }));
    await ok(P, staff('reservations/rB', {
      status: 'cancelled', cancelledBy: 'admin', cancelReason: 'customer_request', cancelReasonText: '', cancelledAt: at(), updatedAt: at(), lastAction: 'cancel',
    }));
    await ok(P, staff('reservations/rA', {
      status: 'no_show', noShowAt: at(), noShowBy: UID.STAFF, noShowByName: 'Sam', updatedAt: at(), lastAction: 'no_show',
    }));
  });
  test('never a fee, waiver, deposit, settlement, price or release', async () => {
    // Even WITH a valid audit entry, these stay refused for staff.
    const staff = (path: string, data: Record<string, unknown>) => auditedUpdate(db('staff'), UID.STAFF, 'staff', path, data);
    await no(P, staff('reservations/sAct', { status: 'returned', lateChargeAmount: 0 }));
    await no(P, staff('reservations/sAct', { lateChargeWaived: true }));
    await no(P, staff('reservations/sAct', { depositReturned: true }));
    await no(P, staff('reservations/sAct', { outstandingWrittenOff: true }));
    await no(P, staff('reservations/sAct', { status: 'lost', chargeAmount: 1 }));
    await no(P, staff('reservations/rAact', { total: 1 }));
    await no(P, staff('reservations/rAact', { status: 'cancelled', cancelledBy: 'admin_release', cancelledAt: at() }));
    // Hand over + price change in the same write
    await no(P, staff('reservations/rAret', { status: 'active', total: 1 }));
    await no(P, deleteDoc(doc(db('staff'), 'reservations/rAret')));
    await no(P, updateDoc(doc(db('staffOff'), 'reservations/rAret'), { updatedAt: at() }));
  });
  test('owner: only what the state machine allows from the current phase', async () => {
    // rAret = returned, not settled → to_settle_refund: a refund closes it…
    await ok(P, auditedUpdate(db('owner'), UID.OWNER, 'owner', 'reservations/rAret',
      { depositReturned: true, depositReturnedBy: 'Olga', returnFinalizedAt: at(), lastAction: 'refund_deposit' }));
    // …and then nothing financial is possible any more (settled), not even for an owner.
    await no(P, auditedUpdate(db('owner'), UID.OWNER, 'owner', 'reservations/rAret', { lateChargeWaived: true, lastAction: 'undo_waiver' }));
    await no(P, auditedUpdate(db('owner'), UID.OWNER, 'owner', 'reservations/rAret',
      { status: 'lost', chargeAmount: 1, lastAction: 'report_lost' }));
  });
});

describe('stock: staff mark units in repair only', () => {
  test('products in-repair count + its audit line', async () => {
    const staff = (data: Record<string, unknown>) => auditedUpdate(db('staff'), UID.STAFF, 'staff', 'products/p1', data);
    await ok('fs:products/{productId}', staff({ inRepairUnits: 1 }));
    await no('fs:products/{productId}', updateDoc(doc(db('staff'), 'products/p1'), { inRepairUnits: 2 })); // no audit entry
    await no('fs:products/{productId}', staff({ lostUnits: 1 }));
    await no('fs:products/{productId}', staff({ inRepairUnits: -1 }));
    // Owner: a unit count needs its audit entry too; a plain catalogue edit doesn't.
    await ok('fs:products/{productId}', auditedUpdate(db('owner'), UID.OWNER, 'owner', 'products/p1', { lostUnits: 1 }));
    await no('fs:products/{productId}', updateDoc(doc(db('owner'), 'products/p1'), { lostUnits: 2 }));
    await ok('fs:products/{productId}', updateDoc(doc(db('owner'), 'products/p1'), { name: 'Big tent' }));
    await ok('fs:products/{productId}/stockAdjustments/{adjustmentId}',
      addDoc(collection(db('staff'), 'products/p1/stockAdjustments'), { field: 'inRepairUnits', delta: 1, reason: 'Broken zip' }));
  });
});

describe('incidents + claim notes', () => {
  test('staff open an incident and add notes; closing = owner', async () => {
    const I = 'fs:incidents/{incidentId}';
    await ok(I, addDoc(collection(db('staff'), 'incidents'), {
      reservationId: 'sAct', renterId: UID.A, productId: 'p1', note: 'Tear on the side', photos: [], status: 'open', createdBy: UID.STAFF, createdAt: serverTimestamp(),
    }));
    await no(I, addDoc(collection(db('staff'), 'incidents'), {
      reservationId: 'sAct', note: 'x', photos: [], status: 'closed', createdBy: UID.STAFF, createdAt: serverTimestamp(),
    }));
    await no(I, addDoc(collection(db('A'), 'incidents'), { note: 'x', photos: [], status: 'open', createdBy: UID.A, createdAt: serverTimestamp() }));
    await no(I, getDoc(doc(db('A'), 'incidents/i1')));
    await no(I, auditedUpdate(db('staff'), UID.STAFF, 'staff', 'incidents/i1', { status: 'closed' }));
    await ok(I, auditedUpdate(db('owner'), UID.OWNER, 'owner', 'incidents/i1', { status: 'closed' }));
    const N = 'fs:incidents/{incidentId}/notes/{noteId}';
    await ok(N, addDoc(collection(db('staff'), 'incidents/i1/notes'), { text: 'Renter agrees', byUid: UID.STAFF, byName: 'Sam', at: serverTimestamp() }));
    await no(N, addDoc(collection(db('staff'), 'incidents/i1/notes'), { text: 'Fake', byUid: UID.OWNER, byName: 'Olga', at: serverTimestamp() }));
  });
  test('claim notes: staff add, renters never see them', async () => {
    const N = 'fs:claims/{claimId}/notes/{noteId}';
    await ok(N, addDoc(collection(db('staff'), 'claims/cl1/notes'), { text: 'Photos taken', photos: [], byUid: UID.STAFF, byName: 'Sam', at: serverTimestamp() }));
    await no(N, getDocs(collection(db('A'), 'claims/cl1/notes')));
    await no(N, addDoc(collection(db('staffOff'), 'claims/cl1/notes'), { text: 'x', byUid: UID.STAFF_OFF, at: serverTimestamp() }));
  });
});

describe('audit log', () => {
  const A = 'fs:auditLog/{entryId}';
  test('own entry, real role, server time; append-only; renters never', async () => {
    await ok(A, addDoc(collection(db('staff'), 'auditLog'), { action: 'x', byUid: UID.STAFF, byName: 'Sam', byRole: 'staff', at: serverTimestamp() }));
    await ok(A, getDocs(query(collection(db('staff'), 'auditLog'), where('reservationId', '==', 'rA'))));
    // Forged author / role / time
    await no(A, addDoc(collection(db('staff'), 'auditLog'), { action: 'x', byUid: UID.OWNER, byName: 'Olga', byRole: 'owner', at: serverTimestamp() }));
    await no(A, addDoc(collection(db('staff'), 'auditLog'), { action: 'x', byUid: UID.STAFF, byName: 'Sam', byRole: 'owner', at: serverTimestamp() }));
    await no(A, addDoc(collection(db('staffOff'), 'auditLog'), { action: 'x', byUid: UID.STAFF_OFF, byName: 'Old', byRole: 'staff', at: serverTimestamp() }));
    await no(A, getDocs(collection(db('A'), 'auditLog')));
  });
  test('a write paired with someone else\'s entry is refused', async () => {
    await no('fs:reservations/{reservationId}',
      auditedUpdate(db('owner'), UID.OWNER, 'owner', 'reservations/rAact',
        { status: 'lost', chargeAmount: 1, outstandingBalance: 0, lastAction: 'report_lost' }, { byUid: UID.STAFF, byRole: 'staff' }));
  });
});
