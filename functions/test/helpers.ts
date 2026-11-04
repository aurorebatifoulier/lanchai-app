import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import * as fns from '../src/index'; // initialises the Admin SDK (demo-lanchai, emulators)

export { fns };
export const fft = functionsTest({ projectId: 'demo-lanchai' });
export const db = () => admin.firestore();

export const UID = { A: 'renterAaaa', B: 'renterBbbb', BIZ: 'bizCcccc', ADMIN: 'adminXyz1', GUEST: 'guestQqq1' } as const;

type Provider = 'password' | 'anonymous' | 'google.com';
export function authOf(uid: string | null, provider: Provider = 'password') {
  if (!uid) return undefined;
  return { uid, token: { uid, firebase: { sign_in_provider: provider }, email: `${uid}@example.com`, name: uid } };
}

 
type AnyFn = any;
/** Calls a v2 callable in-process: call(fns.createReservations, data, UID.A). */
export function call(fn: AnyFn, data: unknown, uid: string | null, provider: Provider = 'password'): Promise<AnyFn> {
  const wrapped = fft.wrap(fn) as unknown as (req: unknown) => Promise<unknown>;
  return wrapped({ data, auth: authOf(uid, provider), rawRequest: { headers: {}, ip: '127.0.0.1' } }) as Promise<AnyFn>;
}

/** Asserts the promise rejects with an HttpsError of that code (and optional details.code). */
export async function rejects(p: Promise<unknown>, code: string | string[], detailsCode?: string) {
  const codes = Array.isArray(code) ? code : [code];
  await assert.rejects(p, (err: { code?: string; details?: { code?: string } }) => {
    assert.ok(codes.includes(String(err.code)), `expected ${codes.join('|')}, got ${err.code} (${JSON.stringify(err.details)})`);
    if (detailsCode) assert.equal(err.details?.code, detailsCode);
    return true;
  });
}

/** Deletes every Firestore doc of the emulator project (between test files). */
export async function clearFirestore() {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-lanchai/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clear failed ${res.status}`);
}

export async function set(path: string, data: Record<string, unknown>) {
  await db().doc(path).set(data);
}

// ── Booking fixtures ─────────────────────────────────────────────────────────────
const VTE = 7 * 3_600_000;
/** `days` days from today at HH:MM Vientiane time (always a valid opening-hours slot). */
export function vteSlot(daysAhead: number, hhmm = '10:00'): number {
  const now = new Date(Date.now() + VTE);
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, h, m) - VTE;
}

export const RATE = 20_000; // LAK per USD
export const PRODUCT = {
  name: 'Camping tent', category: 'outdoor', status: 'published', available: true,
  pricePerDay: 10, price3to6: 8, price7to13: 6, price14to29: 5, price30plus: 4, deposit: 50, stockLeft: 1,
};

export async function seedBookingWorld() {
  await clearFirestore();
  await set('config/pricing', { exchangeRate: RATE });
  await set('config/shop', { openTime: '09:00', closeTime: '20:00', lastPickupOffsetMin: 30 });
  await set('config/loyalty', {
    depositPercentByType: { business: 100, resident: 50, residentPlatinum: 25, tourist: 100 },
    couponPercentByTier: { silver: 5, gold: 10, platinum: 15 },
    thresholds: { silver: 100, gold: 300, platinum: 600 },
  });
  await set('products/tent', PRODUCT);
  await set('products/kayak', { ...PRODUCT, name: 'Kayak', stockLeft: 3 });
  await set('products/goldOnly', { ...PRODUCT, name: 'Drone', accessMode: 'exclusive', minTierRequired: 'gold' });
  await set(`admins/${UID.ADMIN}`, {});
  const idOnFile = { status: 'on_file', docType: 'passport', files: ['idDocs/x/1.jpg'], version: 1 };
  for (const [uid, extra] of [
    [UID.A, { customerType: 'tourist', loyaltyTier: 'silver', coupons: [{ id: 'cpn1', tier: 'silver', percent: 99, used: false }] }],
    [UID.B, { customerType: 'resident', loyaltyTier: 'bronze' }],
    [UID.BIZ, { customerType: 'business', accountType: 'btob', btobStatus: 'approved' }],
  ] as const) {
    await set(`users/${uid}`, { firstName: uid, phone: `+85620${uid.length}000${uid.charCodeAt(6)}`, idOnFile: true, idDocVersion: 1, idCheckedVersion: 1, ...extra });
    await set(`identityChecks/${uid}`, idOnFile);
  }
}
