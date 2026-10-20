import * as admin from 'firebase-admin';
import { SHOP_DISPLAY_DEFAULTS } from '../shared/shop';
import { isLoyaltyExcluded, DEFAULT_REVIEW_REWARD_POINTS } from '../shared/loyalty';

export interface EmailShop {
  name: string;
  addressLine: string;
  city: string;
  hours: string;
  whatsappNumber: string;
  paymentMethods: string;
  latitude?: number;
  longitude?: number;
}

export async function getEmailShop(): Promise<EmailShop> {
  const snap = await admin.firestore().collection('config').doc('shop').get().catch(() => null);
  const d = snap?.data() ?? {};
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  return {
    name:           str(d.name,           SHOP_DISPLAY_DEFAULTS.name),
    addressLine:    str(d.addressLine,    SHOP_DISPLAY_DEFAULTS.addressLine),
    city:           str(d.city,           SHOP_DISPLAY_DEFAULTS.city),
    hours:          str(d.hours,          SHOP_DISPLAY_DEFAULTS.hours),
    whatsappNumber: typeof d.whatsappNumber === 'string' ? d.whatsappNumber.replace(/\D/g, '') : '',
    paymentMethods: str(d.paymentMethods, SHOP_DISPLAY_DEFAULTS.paymentMethods),
    latitude:       typeof d.latitude === 'number' ? d.latitude : undefined,
    longitude:      typeof d.longitude === 'number' ? d.longitude : undefined,
  };
}

export interface Recipient {
  email: string | null;
  name: string;
  remindersOptOut: boolean;
  /** Business / BtoB accounts — never shown loyalty points. */
  loyaltyExcluded: boolean;
  /** Current loyalty balance (users/{uid}.loyaltyPoints). */
  loyaltyPoints: number;
  firstName: string;
}

/** Email comes from Firebase Auth (it isn't stored in users/{uid}). */
export async function getRecipient(uid: string, fallbackName?: string | null): Promise<Recipient> {
  const [authUser, profileSnap] = await Promise.all([
    admin.auth().getUser(uid).catch(() => null),
    admin.firestore().collection('users').doc(uid).get().catch(() => null),
  ]);
  const p = profileSnap?.data() ?? {};
  const name = (p.accountType === 'btob' && p.btobCompanyName)
    || p.firstName || p.displayName || authUser?.displayName || fallbackName || 'there';
  return {
    email: authUser?.email ?? null,
    name: String(name),
    remindersOptOut: p.emailRemindersOptOut === true,
    loyaltyExcluded: isLoyaltyExcluded(p),
    loyaltyPoints: typeof p.loyaltyPoints === 'number' ? p.loyaltyPoints : 0,
    firstName: String(p.firstName || (p.displayName ?? authUser?.displayName ?? '').split(' ')[0] || 'there'),
  };
}

/** Admin exchange rates (config/pricing): 1 USD = usdToLak LAK, 1 THB = thbToLak LAK. */
export interface Rates { usdToLak: number | null; thbToLak: number | null }

export async function getRates(): Promise<Rates> {
  const snap = await admin.firestore().collection('config').doc('pricing').get().catch(() => null);
  const d = snap?.data() ?? {};
  const pos = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
  return { usdToLak: pos(d.exchangeRate), thbToLak: pos(d.thbToLakRate) };
}

/** config/loyalty tier thresholds, or null when the program isn't configured. */
export async function getLoyaltyThresholds(): Promise<{ thresholds: { silver: number; gold: number; platinum: number } } | null> {
  const snap = await admin.firestore().collection('config').doc('loyalty').get().catch(() => null);
  const t = snap?.data()?.thresholds;
  return t && typeof t.silver === 'number' ? { thresholds: t } : null;
}

/** Points per review (config/loyalty.reviewRewardPoints, default 10). */
export async function getReviewRewardPoints(): Promise<number> {
  const snap = await admin.firestore().collection('config').doc('loyalty').get().catch(() => null);
  const v = snap?.data()?.reviewRewardPoints;
  return typeof v === 'number' && v >= 0 ? Math.floor(v) : DEFAULT_REVIEW_REWARD_POINTS;
}

/** Has this renter already reviewed this product (any reservation)? Equality-only query. */
export async function hasReviewed(productId: string | undefined, uid: string): Promise<boolean> {
  if (!productId) return false;
  const snap = await admin.firestore().collection('reviews').doc(productId).collection('reviews')
    .where('userId', '==', uid).limit(1).get().catch(() => null);
  return !!snap && !snap.empty;
}

export async function getVatPercent(): Promise<number | null> {
  const snap = await admin.firestore().collection('config').doc('pricing').get().catch(() => null);
  const v = snap?.data()?.vatPercent;
  return typeof v === 'number' ? v : null;
}
