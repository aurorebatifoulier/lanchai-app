import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  buildTimeSlots,
  DEFAULT_OPEN_TIME,
  DEFAULT_CLOSE_TIME,
  DEFAULT_LAST_PICKUP_OFFSET_MIN,
} from '@/utils/timeSlots';

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
  latitude?: number;
  longitude?: number;
}

export const SHOP_FALLBACK: ShopInfo = {
  name:                'LANCHAI · Setthathirath shop',
  addressLine:         '14 Setthathirath Road',
  city:                'Vientiane',
  hours:               'Daily 9:00–20:00',
  openTime:            DEFAULT_OPEN_TIME,
  closeTime:           DEFAULT_CLOSE_TIME,
  lastPickupOffsetMin: DEFAULT_LAST_PICKUP_OFFSET_MIN,
  whatsappNumber:      '',
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

export function buildMapsUrl(shop: ShopInfo): string {
  if (shop.latitude != null && shop.longitude != null) {
    return `https://maps.google.com/?q=${shop.latitude},${shop.longitude}`;
  }
  const q = encodeURIComponent(`${shop.name} ${shop.addressLine} ${shop.city} Laos`);
  return `https://maps.google.com/?q=${q}`;
}

export function useShopInfo(): ShopInfo {
  const [shop, setShop] = useState<ShopInfo>(SHOP_FALLBACK);
  useEffect(() => {
    getShopInfo().then(setShop);
  }, []);
  return shop;
}
