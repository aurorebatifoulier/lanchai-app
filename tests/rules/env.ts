// Shared setup for the security-rules tests (Firestore + Storage emulators, started by
// `firebase emulators:exec --config firebase.test.json`, project demo-lanchai).
//   • personas: unauth, guest (anonymous), renter A, renter B, business account, admin;
//   • seed(): one realistic document per collection, written with rules DISABLED;
//   • ok() / no(): assertSucceeds / assertFails that also record which rule block was
//     exercised (allow / deny) — tests/rules/coverage.ts fails the run if a block of
//     firestore.rules or storage.rules is missing either.
import fs from 'node:fs';
import path from 'node:path';
import { after, before } from 'node:test';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment, type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

setLogLevel('silent'); // expected PERMISSION_DENIED errors would flood the output

const ROOT = path.resolve(__dirname, '../..');
export const COVERAGE_DIR = path.join(ROOT, 'tests/.coverage');

export let env: RulesTestEnvironment;

export const UID = { A: 'renterA', B: 'renterB', BIZ: 'bizC', ADMIN: 'admin1', GUEST: 'guest1' } as const;
const account = { firebase: { sign_in_provider: 'password' as const } };

export const as = {
  unauth: (): RulesTestContext => env.unauthenticatedContext(),
  guest: (): RulesTestContext => env.authenticatedContext(UID.GUEST, { firebase: { sign_in_provider: 'anonymous' } }),
  A: (): RulesTestContext => env.authenticatedContext(UID.A, { ...account, email: 'a@example.com' }),
  B: (): RulesTestContext => env.authenticatedContext(UID.B, { ...account, email: 'b@example.com' }),
  biz: (): RulesTestContext => env.authenticatedContext(UID.BIZ, account),
  admin: (): RulesTestContext => env.authenticatedContext(UID.ADMIN, account),
};
export type Persona = keyof typeof as;

// ── Coverage bookkeeping ────────────────────────────────────────────────────────
const hits: Record<string, { allow: number; deny: number }> = {};
function cover(block: string, kind: 'allow' | 'deny') {
  (hits[block] ??= { allow: 0, deny: 0 })[kind]++;
}
/** The operation must be ALLOWED by `block` (path as written in the rules file, e.g.
 *  "fs:users/{userId}/bag/{itemId}" or "st:idDocs/{uid}/{fileName}"). */
export async function ok<T>(block: string, p: Promise<T>): Promise<T> {
  cover(block, 'allow');
  return assertSucceeds(p);
}
/** The operation must be DENIED by `block`. */
export async function no(block: string, p: Promise<unknown>): Promise<void> {
  cover(block, 'deny');
  await assertFails(p);
}

// ── Seed data (rules disabled) ──────────────────────────────────────────────────
export const T0 = Timestamp.fromMillis(Date.UTC(2026, 10, 14, 3));

const SEED: Record<string, Record<string, unknown>> = {
  [`admins/${UID.ADMIN}`]: { since: T0 },
  [`users/${UID.A}`]: { firstName: 'Ann', lastName: 'A', phone: '+8562000000001', accountType: 'btoc', customerType: 'tourist', loyaltyPoints: 150, loyaltyTier: 'silver', coupons: [] },
  [`users/${UID.B}`]: { firstName: 'Bob', lastName: 'B', accountType: 'btoc', customerType: 'resident', loyaltyPoints: 10, loyaltyTier: 'bronze', idCheckedVersion: 1, idDocVersion: 1 },
  [`users/${UID.BIZ}`]: { firstName: 'Cy', accountType: 'btob', btobStatus: 'approved', customerType: 'business', btobDocumentUrl: 'https://x/doc.jpg' },
  [`users/${UID.A}/favorites/p1`]: { productId: 'p1', addedAt: T0 },
  [`users/${UID.A}/bag/b1`]: { productId: 'p1', quantity: 1 },
  [`users/${UID.A}/loyaltyHistory/l1`]: { amount: 20, source: 'rental' },
  // p1 = single-category product, p2 = multi-category product, p3 = legacy product
  // (single `category`, never migrated — admin updates refused until it gets `categories`).
  'products/p1': { name: 'Camping tent', categories: ['outdoor'], category: 'outdoor', status: 'published', pricePerDay: 10, stockLeft: 2 },
  'products/p2': { name: 'Ladder', categories: ['tools', 'home'], category: 'tools', status: 'published', pricePerDay: 5, stockLeft: 1 },
  'products/p3': { name: 'Old drill', category: 'tools', status: 'published', pricePerDay: 4, stockLeft: 1 },
  'products/p1/stockAdjustments/s1': { field: 'lostUnits', delta: 1 },
  'collections/c1': { title: 'Weekend', published: true },
  'collections/c2': { title: 'Draft', published: false },
  'homeSlides/h1': { placement: 'hero', published: true },
  'homeSlides/h2': { placement: 'hero', published: false },
  'reservations/rA': { renterId: UID.A, productId: 'p1', status: 'confirmed', total: 300_000, deposit: 500_000, pricePerDay: 100_000 },
  'reservations/rAret': { renterId: UID.A, productId: 'p1', status: 'returned', total: 300_000 },
  'reservations/rAact': { renterId: UID.A, productId: 'p1', status: 'active', total: 300_000 },
  'reservations/rB': { renterId: UID.B, productId: 'p1', status: 'confirmed', total: 300_000 },
  'reservationOccupancy/rA': { productId: 'p1', quantity: 1, status: 'confirmed' },
  'requests/q1': { text: 'Paddle board', renterId: UID.A, status: 'new' },
  [`conversations/${UID.A}`]: { renterId: UID.A, renterName: 'Ann', unreadByBusiness: 2, unreadByRenter: 1, lastSenderType: 'business' },
  [`conversations/${UID.A}/messages/m1`]: { senderId: UID.A, senderType: 'renter', text: 'Hi', imageUrl: null, videoUrl: null, read: false },
  [`identityChecks/${UID.A}`]: { status: 'on_file', files: ['idDocs/renterA/x.jpg'], version: 1 },
  [`residencyRequests/${UID.A}`]: { status: 'pending' },
  'docDeletionLog/d1': { uid: UID.A, type: 'id', count: 2 },
  'inviteCodes/ANN-ABC': { uid: UID.A },
  [`referrals/${UID.B}`]: { referrerUid: UID.A, status: 'pending' },
  'promoCodes/SUMMER10': { code: 'SUMMER10', type: 'percent', value: 10, active: true, usedCount: 0, discountGivenLak: 0 },
  'promoCodes/USEDONE': { code: 'USEDONE', type: 'percent', value: 10, active: true, usedCount: 3, discountGivenLak: 90_000 },
  [`promoCodes/USEDONE/uses/${UID.A}`]: { count: 1 },
  [`availabilityWatches/${UID.A}_p1`]: { uid: UID.A, productId: 'p1' },
  [`categoryWatches/${UID.A}_fun`]: { uid: UID.A, category: 'fun' },
  [`recentViews/${UID.A}`]: { items: [], updatedAt: T0 },
  'savedReplies/s1': { text: 'Hello' },
  'jobHealth/lateReturnAlerts': { lastOkAt: T0, durationMs: 1200 },
  [`promoGrants/SUMMER10_${UID.A}`]: { uid: UID.A, code: 'SUMMER10', used: false },
  'rentalAgreements/ag1': { renterId: UID.A, orderId: 'LNC-1' },
  'rentalAgreements/ag1/internal/audit': { staffName: 'Staff' },
  'config/shop': { openTime: '09:00' },
  'config/features': { businessAccounts: false },
  'config/legalPublic': { idRetentionMonths: 6 },
  'config/latePolicy': { graceHours: 2 },
  'config/emailSettings': { live: false },
  'config/emailHealth': { lastAlertAt: T0 },
  'config/residency': { proofRetentionDays: 30 },
  'productLocks/p1': { at: T0 },
  [`bookingHolds/${UID.A}`]: { reasons: ['overdue'] },
  [`notifications/${UID.A}/items/n1`]: { title: 'Hi', body: 'x', readAt: null },
  'broadcasts/br1': { title: 'News' },
  'adminTasks/t1': { title: 'Task' },
  'reviews/p1': {},
  'reviews/p1/reviews/rAold': { userId: UID.A, rating: 5, text: 'Great tent, thanks!' },
  'claims/cl1': { userId: UID.A, reservationId: 'rAret', productId: 'p1', status: 'open', type: 'other' },
  // Server-only collections with NO rule block (denied by default).
  [`bookingRequests/${UID.A}_req1`]: { orderId: 'LNC-1' },
  [`promoAttempts/${UID.A}`]: { count: 1 },
  'authEmailLimits/k1': { count: 1 },
};

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FILES: Record<string, string> = {
  'products/p1/k1.jpg': 'image/jpeg',
  [`chat-images/${UID.A}/1.jpg`]: 'image/jpeg',
  [`chat-videos/${UID.A}/1.mp4`]: 'video/mp4',
  'reservations/rA/handover/1.jpg': 'image/jpeg',
  'rentalAgreements/ag1/agreement.pdf': 'application/pdf',
  [`claim-photos/${UID.A}/1_0.jpg`]: 'image/jpeg',
  [`claim-videos/${UID.A}/1_0.mp4`]: 'video/mp4',
  [`profile-photos/${UID.A}/1.jpg`]: 'image/jpeg',
  [`businessDocs/${UID.BIZ}/1.jpg`]: 'image/jpeg',
  [`idDocs/${UID.A}/id_1_1.jpg`]: 'image/jpeg',
  'homeSlides/h1/1.jpg': 'image/jpeg',
  'onboarding/s1p1/1.jpg': 'image/jpeg',
  'misc/other.txt': 'text/plain',
};

async function seed(withStorage: boolean) {
  await env.clearFirestore();
  if (withStorage) await env.clearStorage();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await Promise.all(Object.entries(SEED).map(([p, data]) => setDoc(doc(db, p), data)));
    if (withStorage) {
      const st = ctx.storage();
      await Promise.all(Object.entries(FILES).map(([p, contentType]) => uploadBytes(ref(st, p), PNG, { contentType })));
    }
  });
}

/** Call at the top of each test file: starts the env once, reseeds before the file. */
export function setupRulesEnv(opts: { storage?: boolean } = {}) {
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-lanchai',
      firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
      storage: { rules: fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8') },
    });
    await seed(!!opts.storage);
  });
  after(async () => {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVERAGE_DIR, `${process.pid}.json`), JSON.stringify(hits));
    await env.cleanup();
  });
}

/** Re-seed between tests that mutate shared docs. */
export const reseed = (withStorage = false) => seed(withStorage);

/** For server-only collections with NO rule block: must be denied (not counted). */
export async function noRule(p: Promise<unknown>): Promise<void> {
  await assertFails(p);
}
