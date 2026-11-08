// Catalogue + admin-managed + server-only collections: products, stock log, collections,
// slides, config, broadcasts, admin tasks, saved replies, reviews, promo codes / uses /
// grants, invite codes, referrals, product locks, and the unmatched server collections.
import { describe, test } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, addDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, noRule, UID } from './env';

setupRulesEnv();
const db = (p: keyof typeof as) => as[p]().firestore();

describe('products + stock log', () => {
  test('products: any session reads (guests browse); only admins write', async () => {
    const P = 'fs:products/{productId}';
    await ok(P, getDocs(collection(db('guest'), 'products')));
    await ok(P, updateDoc(doc(db('admin'), 'products/p1'), { pricePerDay: 12 }));
    await no(P, getDocs(collection(db('unauth'), 'products')));
    await no(P, updateDoc(doc(db('A'), 'products/p1'), { pricePerDay: 0 }));
    await no(P, updateDoc(doc(db('biz'), 'products/p1'), { stockLeft: 99 }));
    await no(P, setDoc(doc(db('A'), 'products/mine'), { name: 'Free stuff' }));
  });
  test('products: categories = list of 1–5 known ids, no duplicate, main = category', async () => {
    const P = 'fs:products/{productId}';
    const admin = db('admin');
    const put = (id: string, data: Record<string, unknown>) => setDoc(doc(admin, `products/${id}`), { name: 'X', ...data });
    // Valid
    await ok(P, put('n1', { categories: ['games'] }));
    await ok(P, put('n2', { categories: ['tools', 'home'], category: 'tools' }));
    await ok(P, put('n3', { categories: ['tools', 'home', 'kids', 'outdoor', 'games'] }));
    await ok(P, put('n4', { categories: ['other'] }));
    await ok(P, updateDoc(doc(admin, 'products/p2'), { categories: ['home', 'tools'], category: 'home' }));
    // Legacy product (no `categories`) still editable; can be migrated
    await ok(P, updateDoc(doc(admin, 'products/p1'), { stockLeft: 3 }));
    await ok(P, updateDoc(doc(admin, 'products/p1'), { categories: ['outdoor'] }));
    // Invalid
    await no(P, put('x1', { category: 'tools' }));                       // create without categories
    await no(P, put('x2', { categories: [] }));
    await no(P, put('x3', { categories: ['tools', 'home', 'kids', 'outdoor', 'games', 'other'] }));
    await no(P, put('x4', { categories: ['tools', 'tools'] }));
    await no(P, put('x5', { categories: ['luxury'] }));
    await no(P, put('x6', { categories: ['fun'] }));
    await no(P, put('x7', { categories: 'tools' }));
    await no(P, put('x8', { categories: ['tools', 'home'], category: 'home' })); // mirror ≠ main
    await no(P, updateDoc(doc(admin, 'products/p2'), { categories: ['sports'] }));
    await no(P, updateDoc(doc(admin, 'products/p2'), { categories: [] }));
    // Renters never write
    await no(P, updateDoc(doc(db('A'), 'products/p2'), { categories: ['games'] }));
  });
  test('stock adjustments: admin append-only log', async () => {
    const S = 'fs:products/{productId}/stockAdjustments/{adjustmentId}';
    await ok(S, getDocs(collection(db('admin'), 'products/p1/stockAdjustments')));
    await ok(S, addDoc(collection(db('admin'), 'products/p1/stockAdjustments'), { field: 'inRepairUnits', delta: 1 }));
    await no(S, getDocs(collection(db('A'), 'products/p1/stockAdjustments')));
    await no(S, updateDoc(doc(db('admin'), 'products/p1/stockAdjustments/s1'), { delta: 0 }));
    await no(S, deleteDoc(doc(db('admin'), 'products/p1/stockAdjustments/s1')));
  });
});

describe('collections + home slides (drafts hidden)', () => {
  for (const [name, block, pub, draft] of [
    ['collections', 'fs:collections/{collectionId}', 'c1', 'c2'],
    ['homeSlides', 'fs:homeSlides/{slideId}', 'h1', 'h2'],
  ] as const) {
    test(name, async () => {
      await ok(block, getDoc(doc(db('guest'), `${name}/${pub}`)));
      await ok(block, getDocs(query(collection(db('A'), name), where('published', '==', true))));
      await ok(block, getDoc(doc(db('admin'), `${name}/${draft}`)));
      await no(block, getDoc(doc(db('A'), `${name}/${draft}`)));
      await no(block, getDocs(collection(db('A'), name))); // must filter on published
      await no(block, updateDoc(doc(db('A'), `${name}/${pub}`), { published: false }));
      await ok(block, updateDoc(doc(db('admin'), `${name}/${draft}`), { published: true }));
    });
  }
});

describe('config/{docId}', () => {
  const C = 'fs:config/{docId}';
  test('public flags before sign-in; shop for sessions; internal docs admin-only', async () => {
    await ok(C, getDoc(doc(db('unauth'), 'config/features')));
    await ok(C, getDoc(doc(db('unauth'), 'config/legalPublic')));
    await ok(C, getDoc(doc(db('guest'), 'config/shop')));
    await ok(C, getDoc(doc(db('admin'), 'config/latePolicy')));
    await ok(C, updateDoc(doc(db('admin'), 'config/shop'), { openTime: '08:30' }));
    await no(C, getDoc(doc(db('unauth'), 'config/shop')));
    for (const internal of ['latePolicy', 'emailSettings', 'emailHealth', 'residency']) {
      await no(C, getDoc(doc(db('A'), `config/${internal}`)));
    }
    await no(C, updateDoc(doc(db('A'), 'config/shop'), { openTime: '00:00' }));
    await no(C, setDoc(doc(db('A'), 'config/pricing'), { exchangeRate: 1 })); // no price tampering
    await no(C, setDoc(doc(db('A'), 'config/loyalty'), { couponPercentByTier: { silver: 100 } }));
  });
});

describe('broadcasts, adminTasks, savedReplies', () => {
  test('broadcasts: sessions read, admins write', async () => {
    const B = 'fs:broadcasts/{id}';
    await ok(B, getDocs(collection(db('guest'), 'broadcasts')));
    await ok(B, addDoc(collection(db('admin'), 'broadcasts'), { title: 'Hi' }));
    await no(B, getDocs(collection(db('unauth'), 'broadcasts')));
    await no(B, addDoc(collection(db('A'), 'broadcasts'), { title: 'Spam' }));
  });
  test('admin tasks + saved replies: admin only', async () => {
    for (const [col, block] of [['adminTasks', 'fs:adminTasks/{taskId}'], ['savedReplies', 'fs:savedReplies/{replyId}']] as const) {
      await ok(block, getDocs(collection(db('admin'), col)));
      await ok(block, addDoc(collection(db('admin'), col), { text: 'x' }));
      await no(block, getDocs(collection(db('A'), col)));
      await no(block, addDoc(collection(db('biz'), col), { text: 'x' }));
    }
  });
});

describe('jobHealth (scheduled jobs)', () => {
  test('admin reads; nobody writes (no faking a healthy job)', async () => {
    const J = 'fs:jobHealth/{jobName}';
    await ok(J, getDocs(collection(db('admin'), 'jobHealth')));
    await no(J, getDoc(doc(db('A'), 'jobHealth/lateReturnAlerts')));
    await no(J, setDoc(doc(db('admin'), 'jobHealth/lateReturnAlerts'), { lastOkAt: 1 }));
  });
});

describe('reviews', () => {
  const RP = 'fs:reviews/{productId}';
  const RV = 'fs:reviews/{productId}/reviews/{reservationId}';
  const review = (over: Record<string, unknown> = {}) => ({
    userId: UID.A, reviewerName: 'Ann', rating: 5, text: 'Great tent, thank you!', productId: 'p1',
    reservationId: 'rAret', productName: 'Camping tent', createdAt: serverTimestamp(), ...over,
  });
  test('placeholder doc: read only', async () => {
    await ok(RP, getDoc(doc(db('guest'), 'reviews/p1')));
    await no(RP, setDoc(doc(db('admin'), 'reviews/p1'), { x: 1 }));
  });
  test('create: only for my RETURNED reservation of that product, valid shape', async () => {
    await no(RV, setDoc(doc(db('B'), 'reviews/p1/reviews/rAret'), review({ userId: UID.B })));   // not my rental
    await no(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rA'), review({ reservationId: 'rA' }))); // not returned
    await no(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rAret'), review({ rating: 6 })));
    await no(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rAret'), review({ text: 'short' })));
    await no(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rAret'), review({ createdAt: new Date(0) })));
    await no(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rAret'), review({ adminReply: { text: 'Thanks!' } })));
    await no(RV, setDoc(doc(db('guest'), 'reviews/p1/reviews/rAret'), review({ userId: UID.GUEST })));
    await ok(RV, setDoc(doc(db('A'), 'reviews/p1/reviews/rAret'), review()));
    await ok(RV, getDocs(collection(db('guest'), 'reviews/p1/reviews')));
  });
  test('edit / delete: admin only (no rating changes afterwards)', async () => {
    await no(RV, updateDoc(doc(db('A'), 'reviews/p1/reviews/rAold'), { rating: 1 }));
    await no(RV, deleteDoc(doc(db('A'), 'reviews/p1/reviews/rAold')));
    await ok(RV, updateDoc(doc(db('admin'), 'reviews/p1/reviews/rAold'), { adminReply: { text: 'Thanks' } }));
    await no(RV, getDocs(collection(db('unauth'), 'reviews/p1/reviews')));
  });
});

describe('promo codes, uses, grants', () => {
  const PC = 'fs:promoCodes/{code}';
  const US = 'fs:promoCodes/{code}/uses/{uid}';
  const PG = 'fs:promoGrants/{grantId}';
  test('promo codes: renters never read or write them; admin rules on counters', async () => {
    await no(PC, getDoc(doc(db('A'), 'promoCodes/SUMMER10')));
    await no(PC, getDocs(collection(db('biz'), 'promoCodes')));
    await no(PC, setDoc(doc(db('A'), 'promoCodes/MINE100'), { code: 'MINE100', usedCount: 0, discountGivenLak: 0, value: 100 }));
    await ok(PC, getDocs(collection(db('admin'), 'promoCodes')));
    await ok(PC, setDoc(doc(db('admin'), 'promoCodes/NEWCODE'), { code: 'NEWCODE', type: 'percent', value: 5, active: true, usedCount: 0, discountGivenLak: 0 }));
    await no(PC, setDoc(doc(db('admin'), 'promoCodes/bad-id'), { code: 'bad-id', usedCount: 0, discountGivenLak: 0 }));
    await no(PC, setDoc(doc(db('admin'), 'promoCodes/PRELOAD'), { code: 'PRELOAD', usedCount: 5, discountGivenLak: 0 }));
    await no(PC, updateDoc(doc(db('admin'), 'promoCodes/USEDONE'), { usedCount: 0 }));
    await ok(PC, updateDoc(doc(db('admin'), 'promoCodes/USEDONE'), { active: false }));
    await no(PC, deleteDoc(doc(db('admin'), 'promoCodes/USEDONE'))); // used → deactivate only
    await ok(PC, deleteDoc(doc(db('admin'), 'promoCodes/NEWCODE')));
  });
  test('uses: admin read, server write', async () => {
    await ok(US, getDoc(doc(db('admin'), `promoCodes/USEDONE/uses/${UID.A}`)));
    await no(US, getDoc(doc(db('A'), `promoCodes/USEDONE/uses/${UID.A}`)));
    await no(US, deleteDoc(doc(db('A'), `promoCodes/USEDONE/uses/${UID.A}`))); // "reset my uses"
    await no(US, setDoc(doc(db('admin'), `promoCodes/USEDONE/uses/${UID.B}`), { count: 0 }));
  });
  test('grants (wallet): read my own only (uid filter), nobody writes', async () => {
    await ok(PG, getDocs(query(collection(db('A'), 'promoGrants'), where('uid', '==', UID.A))));
    await ok(PG, getDocs(collection(db('admin'), 'promoGrants')));
    await no(PG, getDocs(collection(db('A'), 'promoGrants')));
    await no(PG, getDoc(doc(db('B'), `promoGrants/SUMMER10_${UID.A}`)));
    await no(PG, updateDoc(doc(db('A'), `promoGrants/SUMMER10_${UID.A}`), { used: false }));
    await no(PG, setDoc(doc(db('B'), `promoGrants/SUMMER10_${UID.B}`), { uid: UID.B, code: 'SUMMER10' }));
  });
});

describe('referral + server-only collections', () => {
  test('invite codes: nobody (no enumeration of other renters codes)', async () => {
    await no('fs:inviteCodes/{code}', getDoc(doc(db('A'), 'inviteCodes/ANN-ABC')));
    await no('fs:inviteCodes/{code}', setDoc(doc(db('B'), 'inviteCodes/BOB-XYZ'), { uid: UID.B }));
    await no('fs:inviteCodes/{code}', getDocs(collection(db('admin'), 'inviteCodes')));
  });
  test('referrals: admin read, server write', async () => {
    const RF = 'fs:referrals/{referredUid}';
    await ok(RF, getDoc(doc(db('admin'), `referrals/${UID.B}`)));
    await no(RF, getDoc(doc(db('B'), `referrals/${UID.B}`)));
    await no(RF, updateDoc(doc(db('A'), `referrals/${UID.B}`), { status: 'credited' }));
  });
  test('product locks: nobody', async () => {
    await no('fs:productLocks/{productId}', getDoc(doc(db('admin'), 'productLocks/p1')));
    await no('fs:productLocks/{productId}', setDoc(doc(db('A'), 'productLocks/p1'), { at: 1 }));
  });
  test('collections without a rule block are denied to everyone (default deny)', async () => {
    for (const persona of ['A', 'admin'] as const) {
      await noRule(getDoc(doc(db(persona), `bookingRequests/${UID.A}_req1`)));
      await noRule(setDoc(doc(db(persona), `bookingRequests/${UID.A}_req2`), { orderId: 'x' }));
      await noRule(deleteDoc(doc(db(persona), `promoAttempts/${UID.A}`))); // reset my rate limit
      await noRule(getDocs(collection(db(persona), 'authEmailLimits')));
    }
  });
});
