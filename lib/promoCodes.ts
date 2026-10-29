import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { auth } from './auth';
import type { PromoCode, PromoError } from '@/functions/src/shared/promo';
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
