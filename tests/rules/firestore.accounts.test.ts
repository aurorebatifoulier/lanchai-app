// users (+ favorites, bag, loyaltyHistory), admins, reservations, occupancy, booking
// holds, notifications, recent views — as guest / renter A / renter B / business / admin.
import { describe, test } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, addDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, UID, env } from './env';

setupRulesEnv();
const db = (p: keyof typeof as) => as[p]().firestore();

describe('admins/{uid}', () => {
  test('only my own admin doc is readable; nobody writes it (no self-promotion)', async () => {
    await ok('fs:admins/{uid}', getDoc(doc(db('admin'), `admins/${UID.ADMIN}`)));
    await ok('fs:admins/{uid}', getDoc(doc(db('A'), `admins/${UID.A}`))); // "am I admin?" → empty
    await no('fs:admins/{uid}', getDoc(doc(db('A'), `admins/${UID.ADMIN}`)));
    await no('fs:admins/{uid}', getDocs(collection(db('A'), 'admins')));
    await no('fs:admins/{uid}', setDoc(doc(db('A'), `admins/${UID.A}`), { since: 1 }));
    await no('fs:admins/{uid}', setDoc(doc(db('admin'), `admins/${UID.B}`), { since: 1 }));
  });
});

describe('users/{userId}', () => {
  const U = 'fs:users/{userId}';
  test('read: owner and admin only; no listing', async () => {
    await ok(U, getDoc(doc(db('A'), `users/${UID.A}`)));
    await ok(U, getDoc(doc(db('admin'), `users/${UID.A}`)));
    await no(U, getDoc(doc(db('B'), `users/${UID.A}`)));
    await no(U, getDoc(doc(db('guest'), `users/${UID.A}`)));
    await no(U, getDoc(doc(db('unauth'), `users/${UID.A}`)));
    await no(U, getDocs(collection(db('A'), 'users')));
  });

  test('create: own profile, allow-listed fields only; guests never', async () => {
    const fresh = as.A().firestore();
    await no(U, setDoc(doc(db('guest'), `users/${UID.GUEST}`), { firstName: 'G' }));
    await no(U, setDoc(doc(db('B'), `users/someoneElse`), { firstName: 'X' }));
    // A's doc exists already → creating ANOTHER profile with server fields is refused.
    await no(U, setDoc(doc(fresh, 'users/renterNew'), { firstName: 'N' })); // not my uid
  });

  test('create (new account): server-only fields refused, plain profile allowed', async () => {
    const newbie = env.authenticatedContext('newbie', { firebase: { sign_in_provider: 'password' } }).firestore();
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', loyaltyPoints: 9999 }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', loyaltyTier: 'platinum' }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', customerType: 'resident' }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', phoneVerified: true }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', btobStatus: 'approved' }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', isAdmin: true }));
    await no(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', role: 'admin' }));
    await ok(U, setDoc(doc(newbie, 'users/newbie'), { firstName: 'N', lastName: 'Ew', accountType: 'btoc', createdAt: serverTimestamp() }));
  });

  test('update: protected fields on my own doc are refused', async () => {
    const me = doc(db('A'), `users/${UID.A}`);
    for (const field of [
      { loyaltyPoints: 99999 }, { loyaltyTier: 'platinum' }, { coupons: [{ percent: 50 }] },
      { customerType: 'resident' }, { residencyValidUntil: 1 }, { residencyBasis: 'visa' },
      { accountType: 'btob' }, { btobStatus: 'approved' }, { idOnFile: true }, { idCheckedVersion: 3 },
      { inviteCode: 'ANN-ZZZ' }, { referredBy: UID.B }, { referralCount: 50 }, { firstRentalDate: 1 },
      { role: 'admin' }, { isAdmin: true }, { phoneVerified: true },
      { celebratedTier: 'gold' },     // beyond my current tier (silver)
      { celebratedTier: 'bronze' },   // not a real celebration tier
      { marketingOptIn: 'yes' },      // must be a boolean
      { marketingOptInAt: 1 },        // must be server time
      { btobDocumentUrl: 'https://x' }, // individual account
    ]) {
      await no(U, updateDoc(me, field));
    }
  });

  test('update: my profile fields, current-tier celebration, consent with server time', async () => {
    const me = doc(db('A'), `users/${UID.A}`);
    await ok(U, updateDoc(me, { firstName: 'Anna', phone: '+8562000000009', phoneVerified: false, updatedAt: serverTimestamp() }));
    await ok(U, updateDoc(me, { celebratedTier: 'silver' }));
    await ok(U, updateDoc(me, { marketingOptIn: true, marketingOptInAt: serverTimestamp() }));
    await no(U, updateDoc(doc(db('B'), `users/${UID.A}`), { firstName: 'Hacked' }));
    await no(U, updateDoc(doc(db('guest'), `users/${UID.A}`), { firstName: 'Hacked' }));
  });

  test('update: name locked once the ID was checked (B), staff can still edit it', async () => {
    await no(U, updateDoc(doc(db('B'), `users/${UID.B}`), { firstName: 'Robert' }));
    await ok(U, updateDoc(doc(db('B'), `users/${UID.B}`), { whatsapp: '+8562000000002' }));
    await ok(U, updateDoc(doc(db('admin'), `users/${UID.B}`), { firstName: 'Robert', phoneVerified: true }));
  });

  test('update: an approved business account cannot replace its document', async () => {
    await no(U, updateDoc(doc(db('biz'), `users/${UID.BIZ}`), { btobDocumentUrl: 'https://x/other.jpg' }));
    await no(U, updateDoc(doc(db('biz'), `users/${UID.BIZ}`), { customerType: 'tourist' }));
  });

  test('delete: never from the client (even the owner, even an admin)', async () => {
    await no(U, deleteDoc(doc(db('A'), `users/${UID.A}`)));
    await no(U, deleteDoc(doc(db('admin'), `users/${UID.B}`)));
  });
});

describe('users/{userId}/favorites, bag, loyaltyHistory', () => {
  const FAV = 'fs:users/{userId}/favorites/{productId}';
  const BAG = 'fs:users/{userId}/bag/{itemId}';
  const LH = 'fs:users/{userId}/loyaltyHistory/{entryId}';
  test('favorites + bag: owner only, guests read-nothing write-nothing', async () => {
    await ok(FAV, getDocs(collection(db('A'), `users/${UID.A}/favorites`)));
    await ok(FAV, setDoc(doc(db('A'), `users/${UID.A}/favorites/p2`), { productId: 'p2' }));
    await no(FAV, getDocs(collection(db('B'), `users/${UID.A}/favorites`)));
    await no(FAV, setDoc(doc(db('B'), `users/${UID.A}/favorites/p3`), { productId: 'p3' }));
    await no(FAV, setDoc(doc(db('guest'), `users/${UID.GUEST}/favorites/p1`), { productId: 'p1' }));
    await ok(BAG, getDocs(collection(db('A'), `users/${UID.A}/bag`)));
    await ok(BAG, addDoc(collection(db('A'), `users/${UID.A}/bag`), { productId: 'p1', quantity: 1 }));
    await no(BAG, getDocs(collection(db('B'), `users/${UID.A}/bag`)));
    await no(BAG, deleteDoc(doc(db('B'), `users/${UID.A}/bag/b1`)));
    await no(BAG, addDoc(collection(db('guest'), `users/${UID.GUEST}/bag`), { productId: 'p1' }));
  });
  test('loyalty history: owner/admin read, nobody writes (no self-credited points)', async () => {
    await ok(LH, getDocs(collection(db('A'), `users/${UID.A}/loyaltyHistory`)));
    await ok(LH, getDocs(collection(db('admin'), `users/${UID.A}/loyaltyHistory`)));
    await no(LH, getDocs(collection(db('B'), `users/${UID.A}/loyaltyHistory`)));
    await no(LH, addDoc(collection(db('A'), `users/${UID.A}/loyaltyHistory`), { amount: 1000, source: 'rental' }));
    await no(LH, addDoc(collection(db('admin'), `users/${UID.A}/loyaltyHistory`), { amount: 1000 }));
  });
});

describe('reservations/{reservationId}', () => {
  const R = 'fs:reservations/{reservationId}';
  test('read: own reservations and admin; not another renter, not a guest; no global listing', async () => {
    await ok(R, getDoc(doc(db('A'), 'reservations/rA')));
    await ok(R, getDocs(query(collection(db('A'), 'reservations'), where('renterId', '==', UID.A))));
    await ok(R, getDoc(doc(db('B'), 'reservations/doesNotExist'))); // order-id probe
    await ok(R, getDocs(collection(db('admin'), 'reservations')));
    await no(R, getDoc(doc(db('B'), 'reservations/rA')));
    await no(R, getDoc(doc(db('guest'), 'reservations/rA')));
    await no(R, getDocs(collection(db('A'), 'reservations')));
    await no(R, getDocs(query(collection(db('B'), 'reservations'), where('renterId', '==', UID.A))));
  });
  test('create: never by a renter / business / guest (prices are server-computed)', async () => {
    const body = (uid: string) => ({ renterId: uid, productId: 'p1', status: 'pending_payment', total: 1, deposit: 0, pricePerDay: 1 });
    await no(R, setDoc(doc(db('A'), 'reservations/fakeA'), body(UID.A)));
    await no(R, setDoc(doc(db('biz'), 'reservations/fakeC'), body(UID.BIZ)));
    await no(R, setDoc(doc(db('guest'), 'reservations/fakeG'), body(UID.GUEST)));
    await no(R, setDoc(doc(db('A'), 'reservations/fakeA2'), { ...body(UID.A), status: 'confirmed' }));
    await ok(R, setDoc(doc(db('admin'), 'reservations/adminOwn'), body(UID.ADMIN)));
  });
  test('update: a renter can only cancel (renter, server time) a pending / confirmed booking', async () => {
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { total: 1 }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { deposit: 0 }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { status: 'returned' }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { status: 'cancelled', cancelledBy: 'admin', cancelledAt: serverTimestamp() }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { status: 'cancelled', cancelledBy: 'renter', cancelledAt: new Date(0) }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rA'), { status: 'cancelled', cancelledBy: 'renter', cancelledAt: serverTimestamp(), total: 0 }));
    await no(R, updateDoc(doc(db('A'), 'reservations/rAact'), { status: 'cancelled', cancelledBy: 'renter', cancelledAt: serverTimestamp() }));
    await no(R, updateDoc(doc(db('B'), 'reservations/rA'), { status: 'cancelled', cancelledBy: 'renter', cancelledAt: serverTimestamp() }));
    await ok(R, updateDoc(doc(db('A'), 'reservations/rA'), { status: 'cancelled', cancelledBy: 'renter', cancelledAt: serverTimestamp() }));
    await ok(R, updateDoc(doc(db('admin'), 'reservations/rB'), { total: 250_000 }));
  });
  test('delete: admin only', async () => {
    await no(R, deleteDoc(doc(db('A'), 'reservations/rAret')));
    await ok(R, deleteDoc(doc(db('admin'), 'reservations/adminOwn')));
  });
});

describe('reservationOccupancy, bookingHolds', () => {
  test('occupancy: readable by any session (no PII), never written by clients', async () => {
    const O = 'fs:reservationOccupancy/{reservationId}';
    await ok(O, getDocs(collection(db('guest'), 'reservationOccupancy')));
    await no(O, getDocs(collection(db('unauth'), 'reservationOccupancy')));
    await no(O, setDoc(doc(db('admin'), 'reservationOccupancy/x'), { quantity: 0 }));
    await no(O, deleteDoc(doc(db('A'), 'reservationOccupancy/rA')));
  });
  test('booking holds: owner/admin read, nobody lifts their own hold', async () => {
    const H = 'fs:bookingHolds/{uid}';
    await ok(H, getDoc(doc(db('A'), `bookingHolds/${UID.A}`)));
    await ok(H, getDoc(doc(db('admin'), `bookingHolds/${UID.A}`)));
    await no(H, getDoc(doc(db('B'), `bookingHolds/${UID.A}`)));
    await no(H, deleteDoc(doc(db('A'), `bookingHolds/${UID.A}`)));
    await no(H, setDoc(doc(db('admin'), `bookingHolds/${UID.B}`), { reasons: [] }));
  });
});

describe('notifications/{userId}/items', () => {
  const N = 'fs:notifications/{userId}/items/{notifId}';
  test('read + mark as read: owner only; never another renter', async () => {
    await ok(N, getDocs(collection(db('A'), `notifications/${UID.A}/items`)));
    await ok(N, updateDoc(doc(db('A'), `notifications/${UID.A}/items/n1`), { readAt: serverTimestamp() }));
    await no(N, getDocs(collection(db('B'), `notifications/${UID.A}/items`)));
    await no(N, updateDoc(doc(db('A'), `notifications/${UID.A}/items/n1`), { title: 'Edited' }));
    await no(N, deleteDoc(doc(db('B'), `notifications/${UID.A}/items/n1`)));
  });
  test('create: never into ANOTHER renter inbox (no fake messages); admins can', async () => {
    await no(N, addDoc(collection(db('B'), `notifications/${UID.A}/items`), { title: 'Your deposit is lost', body: 'pay now' }));
    await no(N, addDoc(collection(db('guest'), `notifications/${UID.GUEST}/items`), { title: 'x' }));
    await ok(N, addDoc(collection(db('admin'), `notifications/${UID.A}/items`), { title: 'Hello', readAt: null }));
    await ok(N, deleteDoc(doc(db('A'), `notifications/${UID.A}/items/n1`)));
  });
});

describe('recentViews/{uid}', () => {
  const RV = 'fs:recentViews/{uid}';
  test('owner (guests too) read/write, ≤ 10 items; never another uid', async () => {
    await ok(RV, getDoc(doc(db('A'), `recentViews/${UID.A}`)));
    await ok(RV, setDoc(doc(db('guest'), `recentViews/${UID.GUEST}`), { items: ['p1'], updatedAt: serverTimestamp() }));
    await no(RV, getDoc(doc(db('B'), `recentViews/${UID.A}`)));
    await no(RV, setDoc(doc(db('B'), `recentViews/${UID.A}`), { items: [], updatedAt: 1 }));
    await no(RV, setDoc(doc(db('A'), `recentViews/${UID.A}`), { items: Array.from({ length: 11 }, (_, i) => `p${i}`), updatedAt: 1 }));
    await no(RV, setDoc(doc(db('A'), `recentViews/${UID.A}`), { items: [], updatedAt: 1, extra: true }));
  });
});
