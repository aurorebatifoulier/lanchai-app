import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface ShopInfo {
  name: string;
  addressLine: string;
  city: string;
  hours: string;
  latitude?: number;
  longitude?: number;
}

export const SHOP_FALLBACK: ShopInfo = {
  name:        'LANCHAI · Setthathirath shop',
  addressLine: '14 Setthathirath Road',
  city:        'Vientiane',
  hours:       'Daily 9:00–20:00',
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
