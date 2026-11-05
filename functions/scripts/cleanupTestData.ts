// Pre-beta cleanup of TEST data — the logic (the CLI is scripts/cleanup-test-data.ts).
// KEEPS: the catalogue (products, with their counters reset), configuration (config/*),
// collections, home slides, saved replies, promo codes (usage counters reset), job health,
// and ADMIN accounts (Auth user + profile fields only).
// DELETES: every other account (Auth + users doc, anonymous guests included) and all
// activity data: reservations + mirrors, chats, notifications, reviews, claims, item
// requests, ID / residency records, rental agreements, loyalty / referral / promo
// wallets, watches, recent views, rate-limit docs, broadcasts, admin tasks, and the
// matching Storage files (chat, claims, business documents, ID documents, agreements,
// checklist photos, non-admin profile photos). Product photos, home slides and onboarding
// photos stay.
// planCleanup() only READS (dry run); runCleanup() applies the plan it is given.
import * as admin from 'firebase-admin';

type Db = admin.firestore.Firestore;

/** Top-level collections deleted entirely (with every subcollection). */
export const WIPE_COLLECTIONS = [
  'reservations', 'reservationOccupancy', 'bookingHolds', 'bookingRequests', 'productLocks',
  'conversations', 'notifications', 'reviews', 'claims', 'requests',
  'identityChecks', 'residencyRequests', 'rentalAgreements', 'docDeletionLog',
  'promoGrants', 'promoAttempts', 'referrals', 'inviteCodes',
  'recentViews', 'availabilityWatches', 'categoryWatches', 'authEmailLimits',
  'broadcasts', 'adminTasks',
] as const;

/** Kept as they are (listed so the dry run says so). */
export const KEEP_COLLECTIONS = ['products', 'config', 'collections', 'homeSlides', 'savedReplies', 'promoCodes', 'admins', 'jobHealth'] as const;

/** Storage folders deleted (non-admin profile photos are handled separately). */
export const WIPE_STORAGE_PREFIXES = [
  'chat-images/', 'chat-videos/', 'claim-photos/', 'claim-videos/', 'businessDocs/',
  'idDocs/', 'rentalAgreements/', 'reservations/',
] as const;

/** Profile fields an admin keeps; every other field on users/{adminUid} is removed. */
export const ADMIN_PROFILE_FIELDS = new Set([
  'firstName', 'lastName', 'displayName', 'phone', 'phoneNumber', 'phoneVerified', 'whatsapp',
  'whatsappSameAsPhone', 'address', 'photoURL', 'emailRemindersOptOut', 'marketingOptIn',
  'marketingOptInAt', 'marketingOptOutAt', 'accountType', 'createdAt', 'updatedAt',
]);

/** Product counters fed by rentals / reviews / returns — back to zero. */
const PRODUCT_RESET = {
  rentalCount: 0, reviewCount: 0, averageRating: 0,
  pendingSettlementUnits: 0, lostUnits: 0, inRepairUnits: 0,
} as const;
const PRODUCT_DELETE_FIELDS = ['rentalsByMonth'] as const;
const STOCK_FIELDS = ['pendingSettlementUnits', 'lostUnits', 'inRepairUnits'] as const;

export interface CleanupPlan {
  projectId: string;
  admins: string[];
  authUsersToDelete: { uid: string; kind: 'anonymous' | 'account' }[];
  usersDocsToDelete: string[];
  adminFieldsToRemove: { uid: string; fields: string[] }[];
  adminSubcollections: { uid: string; collections: string[] }[];
  collections: { name: string; docs: number }[];
  storage: { prefix: string; files: number }[];
  profilePhotosToDelete: number;
  products: { id: string; name: string; changes: Record<string, unknown> }[];
  promoCodes: { code: string; usedCount: number; discountGivenLak: number; uses: number }[];
  kept: string[];
}

async function countDocs(db: Db, name: string): Promise<number> {
  // listDocuments also returns "missing" parents (e.g. notifications/{uid} that only hold
  // items) — those are what recursiveDelete walks, so count them.
  const [agg, refs] = await Promise.all([db.collection(name).count().get(), db.collection(name).listDocuments()]);
  return Math.max(agg.data().count, refs.length);
}

async function listAllAuthUsers(): Promise<admin.auth.UserRecord[]> {
  const out: admin.auth.UserRecord[] = [];
  let token: string | undefined;
  do {
    const page = await admin.auth().listUsers(1000, token);
    out.push(...page.users);
    token = page.pageToken;
  } while (token);
  return out;
}

export async function planCleanup(): Promise<CleanupPlan> {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const admins = (await db.collection('admins').listDocuments()).map(r => r.id);
  const isAdmin = new Set(admins);

  const authUsers = await listAllAuthUsers();
  const authUsersToDelete = authUsers.filter(u => !isAdmin.has(u.uid))
    .map(u => ({ uid: u.uid, kind: (u.providerData.length === 0 && !u.email ? 'anonymous' : 'account') as 'anonymous' | 'account' }));

  const userRefs = await db.collection('users').listDocuments();
  const usersDocsToDelete = userRefs.map(r => r.id).filter(id => !isAdmin.has(id));
  const adminFieldsToRemove: CleanupPlan['adminFieldsToRemove'] = [];
  const adminSubcollections: CleanupPlan['adminSubcollections'] = [];
  for (const uid of admins) {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const fields = snap.exists ? Object.keys(snap.data() ?? {}).filter(k => !ADMIN_PROFILE_FIELDS.has(k)).sort() : [];
    if (fields.length) adminFieldsToRemove.push({ uid, fields });
    const subs = (await ref.listCollections()).map(c => c.id).sort();
    if (subs.length) adminSubcollections.push({ uid, collections: subs });
  }

  const collections = [];
  for (const name of WIPE_COLLECTIONS) collections.push({ name, docs: await countDocs(db, name) });

  const storage = [];
  for (const prefix of WIPE_STORAGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    storage.push({ prefix, files: files.length });
  }
  const [photos] = await bucket.getFiles({ prefix: 'profile-photos/' });
  const profilePhotosToDelete = photos.filter(f => !isAdmin.has(f.name.split('/')[1] ?? '')).length;

  const products: CleanupPlan['products'] = [];
  for (const d of (await db.collection('products').get()).docs) {
    const p = d.data();
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(PRODUCT_RESET)) if (p[k] != null && p[k] !== v) changes[k] = `${p[k]} → ${v}`;
    for (const k of PRODUCT_DELETE_FIELDS) if (p[k] != null) changes[k] = 'removed';
    if (Object.keys(changes).length) products.push({ id: d.id, name: String(p.name ?? d.id), changes });
  }

  const promoCodes: CleanupPlan['promoCodes'] = [];
  for (const d of (await db.collection('promoCodes').get()).docs) {
    const uses = (await d.ref.collection('uses').count().get()).data().count;
    const usedCount = Number(d.get('usedCount') ?? 0);
    const discountGivenLak = Number(d.get('discountGivenLak') ?? 0);
    if (uses || usedCount || discountGivenLak) promoCodes.push({ code: d.id, usedCount, discountGivenLak, uses });
  }

  return {
    projectId: admin.app().options.projectId ?? process.env.GCLOUD_PROJECT ?? '?',
    admins, authUsersToDelete, usersDocsToDelete, adminFieldsToRemove, adminSubcollections,
    collections, storage, profilePhotosToDelete, products, promoCodes,
    kept: [...KEEP_COLLECTIONS, 'Storage: products/, homeSlides/, onboarding/, admin profile photos'],
  };
}

/** Applies a plan made by planCleanup() just before. Returns a short log. */
export async function runCleanup(plan: CleanupPlan, log: (line: string) => void = () => {}): Promise<void> {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const isAdmin = new Set(plan.admins);
  const { FieldValue } = admin.firestore;

  for (const { name } of plan.collections) {
    await db.recursiveDelete(db.collection(name));
    log(`deleted collection ${name}`);
  }
  for (const uid of plan.usersDocsToDelete) await db.recursiveDelete(db.collection('users').doc(uid));
  log(`deleted ${plan.usersDocsToDelete.length} user profiles`);
  for (const { uid, collections } of plan.adminSubcollections) {
    for (const c of collections) await db.recursiveDelete(db.collection('users').doc(uid).collection(c));
  }
  for (const { uid, fields } of plan.adminFieldsToRemove) {
    await db.collection('users').doc(uid).update(Object.fromEntries(fields.map(f => [f, FieldValue.delete()])));
  }
  log(`reset ${plan.admins.length} admin profiles`);

  for (const p of plan.products) {
    const ref = db.collection('products').doc(p.id);
    const current = (await ref.get()).data() ?? {};
    const batch = db.batch();
    batch.update(ref, { ...PRODUCT_RESET, ...Object.fromEntries(PRODUCT_DELETE_FIELDS.map(k => [k, FieldValue.delete()])) });
    // Stock counts never change without an audit line, same shape as addStockAdjustmentToBatch
    // (lib/firestore.ts) — CLAUDE.md "Product stock condition".
    for (const field of STOCK_FIELDS) {
      const value = Number(current[field] ?? 0);
      if (!value) continue;
      batch.set(ref.collection('stockAdjustments').doc(), {
        field, delta: -value, reason: 'Pre-beta reset (test data cleanup)', adminName: 'cleanup-test-data',
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  log(`reset counters on ${plan.products.length} products`);

  for (const c of plan.promoCodes) {
    const ref = db.collection('promoCodes').doc(c.code);
    await db.recursiveDelete(ref.collection('uses'));
    await ref.update({ usedCount: 0, discountGivenLak: 0 });
  }
  log(`reset ${plan.promoCodes.length} promo codes`);

  for (const { prefix } of plan.storage) await bucket.deleteFiles({ prefix, force: true });
  const [photos] = await bucket.getFiles({ prefix: 'profile-photos/' });
  await Promise.all(photos.filter(f => !isAdmin.has(f.name.split('/')[1] ?? '')).map(f => f.delete({ ignoreNotFound: true })));
  log('deleted Storage files');

  // Auth last: if anything above fails, accounts still exist and the run can be repeated.
  const uids = plan.authUsersToDelete.map(u => u.uid);
  for (let i = 0; i < uids.length; i += 1000) {
    const res = await admin.auth().deleteUsers(uids.slice(i, i + 1000));
    if (res.failureCount) log(`auth: ${res.failureCount} users not deleted`);
  }
  log(`deleted ${uids.length} Auth users (admins kept: ${plan.admins.length})`);
}

/** Human summary of a plan (the dry run output). Never prints names, emails or phones. */
export function describePlan(plan: CleanupPlan): string {
  const anon = plan.authUsersToDelete.filter(u => u.kind === 'anonymous').length;
  const lines = [
    `Project: ${plan.projectId}`,
    `Admins kept: ${plan.admins.length} (${plan.admins.join(', ') || 'none!'})`,
    `Auth users to delete: ${plan.authUsersToDelete.length} (${anon} guests, ${plan.authUsersToDelete.length - anon} accounts)`,
    `User profiles to delete: ${plan.usersDocsToDelete.length}`,
    ...plan.adminFieldsToRemove.map(a => `Admin ${a.uid}: remove ${a.fields.join(', ')}`),
    ...plan.adminSubcollections.map(a => `Admin ${a.uid}: empty ${a.collections.join(', ')}`),
    'Collections to empty:',
    ...plan.collections.map(c => `  ${c.name.padEnd(22)} ${c.docs}`),
    'Storage to delete:',
    ...plan.storage.map(s => `  ${s.prefix.padEnd(22)} ${s.files} files`),
    `  profile-photos/ (non-admin) ${plan.profilePhotosToDelete} files`,
    `Products with counters reset: ${plan.products.length}`,
    ...plan.products.map(p => `  ${p.name}: ${Object.entries(p.changes).map(([k, v]) => `${k} ${v}`).join(', ')}`),
    `Promo codes reset: ${plan.promoCodes.length}`,
    ...plan.promoCodes.map(c => `  ${c.code}: used ${c.usedCount}, ${c.discountGivenLak} LAK given, ${c.uses} uses`),
    `Kept as is: ${plan.kept.join(', ')}`,
  ];
  return lines.join('\n');
}
