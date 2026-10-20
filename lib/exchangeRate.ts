import { useState, useEffect } from 'react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface PricingConfig {
  exchangeRate: number;
  thbToLakRate?: number;
  vatPercent?: number;
  updatedAt?: Timestamp;
}

// Placeholder default used whenever config/pricing.vatPercent hasn't been set yet —
// callers should treat this as "not yet configured," not a guaranteed real rate.
// Defined in functions/src/shared/receiptData.ts (shared with the Cloud Functions).
export { DEFAULT_VAT_PERCENT } from '@/functions/src/shared/receiptData';

// Returns null when config/pricing doesn't exist yet — i.e. the one-time USD migration
// hasn't been run from the admin Exchange rate screen.
export async function getExchangeRate(): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'pricing'));
    if (!snap.exists()) return null;
    return (snap.data() as PricingConfig).exchangeRate ?? null;
  } catch {
    return null;
  }
}

export function useExchangeRate(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    getExchangeRate().then(setRate);
  }, []);
  return rate;
}

// Returns null when config/pricing doesn't exist yet, or the THB rate hasn't been set —
// independent of the USD migration (no product field depends on this rate).
export async function getThbRate(): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'pricing'));
    if (!snap.exists()) return null;
    return (snap.data() as PricingConfig).thbToLakRate ?? null;
  } catch {
    return null;
  }
}

export function useThbRate(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    getThbRate().then(setRate);
  }, []);
  return rate;
}

// Returns null when config/pricing doesn't exist yet or vatPercent hasn't been set —
// callers fall back to DEFAULT_VAT_PERCENT themselves (kept explicit at call sites,
// same null-safety idiom as the exchange/THB rates above).
export async function getVatPercent(): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'pricing'));
    if (!snap.exists()) return null;
    return (snap.data() as PricingConfig).vatPercent ?? null;
  } catch {
    return null;
  }
}

export function useVatPercent(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    getVatPercent().then(setRate);
  }, []);
  return rate;
}
