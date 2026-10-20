import * as admin from 'firebase-admin';
import { SHOP_DISPLAY_DEFAULTS } from '../shared/shop';

export interface EmailShop {
  name: string;
  addressLine: string;
  city: string;
  hours: string;
  whatsappNumber: string;
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
  };
}

export interface Recipient {
  email: string | null;
  name: string;
  remindersOptOut: boolean;
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
  };
}

export async function getVatPercent(): Promise<number | null> {
  const snap = await admin.firestore().collection('config').doc('pricing').get().catch(() => null);
  const v = snap?.data()?.vatPercent;
  return typeof v === 'number' ? v : null;
}
