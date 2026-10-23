import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from './firebase';
import { auth } from './auth';
import {
  buildTimeSlots,
  DEFAULT_OPEN_TIME,
  DEFAULT_CLOSE_TIME,
  DEFAULT_LAST_PICKUP_OFFSET_MIN,
} from '@/utils/timeSlots';
import { SHOP_DISPLAY_DEFAULTS, mapsUrl, openHoursText } from '@/functions/src/shared/shop';

export { openHoursText };

export interface ShopInfo {
  name: string;
  addressLine: string;
  city: string;
  /** Free-text display copy (e.g. "Daily 9:00–20:00") — not used for any logic. */
  hours: string;
  /** Structured opening hours ("HH:MM", 24h) — source of the pickup/return time slots. */
  openTime: string;
  closeTime: string;
  /** Last bookable slot is this many minutes before closeTime. */
  lastPickupOffsetMin: number;
  /** International format, digits only (e.g. "8562012345678"). Empty → WhatsApp buttons hidden. */
  whatsappNumber: string;
  /** Payment methods shown in emails ("What to bring") — aligned with Terms §4. */
  paymentMethods: string;
  latitude?: number;
  longitude?: number;
}

export const SHOP_FALLBACK: ShopInfo = {
  ...SHOP_DISPLAY_DEFAULTS, // shared with the Cloud Functions' emails
  openTime:            DEFAULT_OPEN_TIME,
  closeTime:           DEFAULT_CLOSE_TIME,
  lastPickupOffsetMin: DEFAULT_LAST_PICKUP_OFFSET_MIN,
};

export async function getShopInfo(): Promise<ShopInfo> {
  try {
    const snap = await getDoc(doc(db, 'config', 'shop'));
    if (!snap.exists()) return SHOP_FALLBACK;
    return { ...SHOP_FALLBACK, ...(snap.data() as Partial<ShopInfo>) };
  } catch {
    return SHOP_FALLBACK;
  }
}

/** Admin-only (enforced by firestore.rules on config/*). Merges, so untouched fields survive. */
export async function saveShopInfo(patch: Partial<ShopInfo>): Promise<void> {
  await setDoc(doc(db, 'config', 'shop'), {
    ...patch,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** The single source of pickup/return slots for every booking flow. */
export function getShopTimeSlots(shop: ShopInfo): string[] {
  return buildTimeSlots(shop.openTime, shop.closeTime, shop.lastPickupOffsetMin);
}

/** Strips spaces, dashes, parentheses and a leading "+" — what we store and put in wa.me links. */
export function normalizeWhatsappNumber(input: string): string {
  return input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
}

/** International format without "+": country code first, 8–15 digits, no leading 0. */
export function isValidWhatsappNumber(normalized: string): boolean {
  return /^[1-9]\d{7,14}$/.test(normalized);
}

export function buildWhatsappUrl(number: string, message?: string): string {
  const base = `https://wa.me/${normalizeWhatsappNumber(number)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// Same link as the emails' "Get directions" (functions/src/shared/shop.ts).
export function buildMapsUrl(shop: ShopInfo): string {
  return mapsUrl(shop);
}

// ONE live subscription to config/shop shared by every useShopInfo() caller, so a change
// saved in Admin → Shop settings shows up everywhere immediately — including screens that
// stay mounted (the Account tab used to keep the value read at mount). Restarted on
// sign-in/out because config/* is only readable when signed in; while signed out (or on
// a read error) callers keep the last value / SHOP_FALLBACK.
let liveShop: ShopInfo = SHOP_FALLBACK;
const shopListeners = new Set<(shop: ShopInfo) => void>();
let stopDoc: Unsubscribe | null = null;
let stopAuth: Unsubscribe | null = null;

function startShopSubscription(): void {
  if (stopAuth) return;
  stopAuth = onAuthStateChanged(auth, user => {
    stopDoc?.();
    stopDoc = null;
    if (!user) return;
    stopDoc = onSnapshot(
      doc(db, 'config', 'shop'),
      snap => {
        liveShop = snap.exists() ? { ...SHOP_FALLBACK, ...(snap.data() as Partial<ShopInfo>) } : SHOP_FALLBACK;
        shopListeners.forEach(l => l(liveShop));
      },
      () => { /* keep the last known value */ },
    );
  });
}

export function useShopInfo(): ShopInfo {
  const [shop, setShop] = useState<ShopInfo>(liveShop);
  useEffect(() => {
    startShopSubscription();
    shopListeners.add(setShop);
    setShop(liveShop); // a value may have arrived between render and effect
    return () => { shopListeners.delete(setShop); };
  }, []);
  return shop;
}
