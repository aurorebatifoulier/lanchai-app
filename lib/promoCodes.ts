import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { auth } from './auth';
import { normalizePromoCode, type PromoCode, type PromoError } from '@/functions/src/shared/promo';
import { PROMO_COPY } from '@/constants/promoCopy';

// Promo codes — admin CRUD (promoCodes is admin-only in firestore.rules; counters are
// server-only) and the renter check through the validatePromoCode callable.

export type PromoDoc = PromoCode & { createdAt?: unknown; updatedAt?: unknown };
export type PromoInput = Omit<PromoCode, 'usedCount' | 'discountGivenLak'>;

export async function listPromoCodes(): Promise<PromoDoc[]> {
  const snap = await getDocs(collection(db, 'promoCodes'));
  return snap.docs.map(d => d.data() as PromoDoc);
}

export async function getPromoCode(code: string): Promise<PromoDoc | null> {
  const snap = await getDoc(doc(db, 'promoCodes', code));
  return snap.exists() ? (snap.data() as PromoDoc) : null;
}

/** Create — fails with 'exists' when the code is taken (doc id = code → unique). */
export async function createPromoCode(input: PromoInput): Promise<void> {
  const ref = doc(db, 'promoCodes', input.code);
  await runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) throw new Error('exists');
    tx.set(ref, {
      ...input, usedCount: 0, discountGivenLak: 0,
      createdAt: serverTimestamp(), createdBy: auth.currentUser?.email ?? null, updatedAt: serverTimestamp(),
    });
  });
}

/** Edit everything except the code and the server counters. */
export async function updatePromoCode(code: string, input: Omit<PromoInput, 'code' | 'active'>): Promise<void> {
  await updateDoc(doc(db, 'promoCodes', code), { ...input, updatedAt: serverTimestamp() });
}

export async function setPromoActive(code: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'promoCodes', code), { active, updatedAt: serverTimestamp() });
}

/** Only while unused (firestore.rules: usedCount == 0). */
export async function deletePromoCode(code: string): Promise<void> {
  await deleteDoc(doc(db, 'promoCodes', code));
}

// ── Renter ────────────────────────────────────────────────────────────────────

export interface PromoItem { productId: string; pickupAt: Date; returnAt: Date; quantity: number }
export type PromoCheck = { ok: true; code: string; discountTotal: number; perLine: number[] } | { ok: false; message: string; error: PromoError | null };

export async function checkPromoCode(code: string, items: PromoItem[]): Promise<PromoCheck> {
  try {
    const r = await httpsCallable(functions, 'validatePromoCode')({
      code,
      items: items.map(i => ({ productId: i.productId, pickupAtMs: i.pickupAt.getTime(), returnAtMs: i.returnAt.getTime(), quantity: i.quantity })),
    });
    const d = r.data as { code: string; discountTotal: number; perLine: number[] };
    return { ok: true, ...d };
  } catch (err) {
    const e = err as { message?: string; details?: { code?: string; promoError?: PromoError } };
    if (e.details?.code === 'promo-invalid' && e.message) return { ok: false, message: e.message, error: e.details.promoError ?? null };
    return { ok: false, message: PROMO_COPY.generic, error: null };
  }
}

/**
 * Renter promo state for one booking (single booking screen / bag checkout): apply a
 * code, re-check it automatically when the items / dates / quantities change (600 ms
 * after the last change — failed re-checks drop it with the server's message).
 */
export function usePromoCode(items: PromoItem[] | null) {
  const [applied, setApplied] = useState<{ code: string; discountTotal: number; perLine: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const itemsKey = items ? items.map(i => `${i.productId}:${i.pickupAt.getTime()}:${i.returnAt.getTime()}:${i.quantity}`).join('|') : '';
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const appliedCode = useRef<string | null>(null);

  const apply = useCallback(async (raw: string): Promise<{ code: string; discountTotal: number } | null> => {
    const code = normalizePromoCode(raw);
    const current = itemsRef.current;
    if (!code || !current || current.length === 0) return null;
    setChecking(true);
    setError(null);
    const r = await checkPromoCode(code, current);
    setChecking(false);
    if (r.ok) {
      appliedCode.current = r.code;
      setApplied({ code: r.code, discountTotal: r.discountTotal, perLine: r.perLine });
      return r;
    }
    appliedCode.current = null;
    setApplied(null);
    setError(r.message);
    return null;
  }, []);

  const remove = useCallback(() => { appliedCode.current = null; setApplied(null); setError(null); }, []);

  // Re-check the applied code whenever what's booked changes.
  useEffect(() => {
    const code = appliedCode.current;
    if (!code || !itemsKey) return;
    const t = setTimeout(async () => {
      const current = itemsRef.current;
      if (!current || appliedCode.current !== code) return;
      const r = await checkPromoCode(code, current);
      if (appliedCode.current !== code) return;
      if (r.ok) setApplied({ code: r.code, discountTotal: r.discountTotal, perLine: r.perLine });
      else { appliedCode.current = null; setApplied(null); setError(r.message); }
    }, 600);
    return () => clearTimeout(t);
  }, [itemsKey]);

  return { applied, error, checking, apply, remove };
}
