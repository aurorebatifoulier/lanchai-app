import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where,
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

// ── Wallet (promoGrants/{CODE}_{uid}) — server-written; admin reads all ──────────

export interface PromoGrant {
  code: string; uid: string; source: 'admin' | 'saved' | 'referral';
  /** Display copy written by the server ("10% off", "First rental · Outdoor only"). */
  valueText?: string; conditions?: string;
  grantedAt?: { toMillis: () => number }; expiresAt?: { toMillis: () => number } | null;
  used: boolean; usedAt?: { toMillis: () => number } | null; usedOrderId?: string | null;
  override?: { type: 'percent' | 'fixed'; value: number } | null;
}

/** Admin: who has this code in their wallet (equality query, no index). */
export async function listGrantsForCode(code: string): Promise<PromoGrant[]> {
  const snap = await getDocs(query(collection(db, 'promoGrants'), where('code', '==', code)));
  return snap.docs.map(d => d.data() as PromoGrant);
}

export interface RenterPick { uid: string; name: string; phone: string }

/** Admin: every renter (users docs) for the "give a code" search — filtered in code. */
export async function listRentersForPicker(): Promise<RenterPick[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => {
    const u = d.data() as { firstName?: string; lastName?: string; displayName?: string; phoneNumber?: string; phone?: string };
    return {
      uid: d.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.displayName || 'Renter',
      phone: u.phoneNumber || u.phone || '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const callableError = (err: unknown, fallback: string) => (err as { message?: string })?.message || fallback;

export async function adminGrantPromo(code: string, uids: string[], expiresAtMs: number | null): Promise<{ granted: number; skipped: number }> {
  try {
    const r = await httpsCallable(functions, 'adminGrantPromo')({ code, uids, expiresAtMs });
    return r.data as { granted: number; skipped: number };
  } catch (err) {
    throw new Error(callableError(err, 'Couldn’t give the code. Please try again.'));
  }
}

export async function adminRevokeGrant(code: string, uid: string): Promise<void> {
  try {
    await httpsCallable(functions, 'adminRevokeGrant')({ code, uid });
  } catch (err) {
    throw new Error(callableError(err, 'Couldn’t remove the code. Please try again.'));
  }
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

// ── Renter wallet ────────────────────────────────────────────────────────────

/** The signed-in renter's wallet, live (rules: own grants only). */
export function useMyGrants(): PromoGrant[] | null {
  const [grants, setGrants] = useState<PromoGrant[] | null>(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setGrants([]); return; }
    return onSnapshot(query(collection(db, 'promoGrants'), where('uid', '==', uid)),
      snap => setGrants(snap.docs.map(d => d.data() as PromoGrant)),
      () => setGrants([]));
  }, []);
  return grants;
}

/** "Save to my codes" / wallet "Add a code" (savePromoCode — failed tries count). */
export async function savePromoCode(code: string): Promise<{ ok: true; alreadySaved: boolean } | { ok: false; message: string }> {
  try {
    const r = await httpsCallable(functions, 'savePromoCode')({ code: normalizePromoCode(code) });
    return { ok: true, alreadySaved: !!(r.data as { alreadySaved?: boolean }).alreadySaved };
  } catch (err) {
    const e = err as { message?: string; details?: { code?: string } };
    return { ok: false, message: e.details?.code === 'promo-invalid' && e.message ? e.message : PROMO_COPY.generic };
  }
}

export interface WalletCodeOption { code: string; discountTotal: number; valueText: string; expiresAtMs: number | null }

/** The renter's OWN codes that apply to this booking (evaluateMyCodes, 400 ms after changes). */
export function useMyCodes(items: PromoItem[] | null): { codes: WalletCodeOption[]; notApplicable: number } {
  const [state, setState] = useState<{ codes: WalletCodeOption[]; notApplicable: number }>({ codes: [], notApplicable: 0 });
  const itemsKey = items ? items.map(i => `${i.productId}:${i.pickupAt.getTime()}:${i.returnAt.getTime()}:${i.quantity}`).join('|') : '';
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    const current = itemsRef.current;
    if (!itemsKey || !current || !auth.currentUser) { setState({ codes: [], notApplicable: 0 }); return; }
    let alive = true;
    const t = setTimeout(() => {
      httpsCallable(functions, 'evaluateMyCodes')({
        items: current.map(i => ({ productId: i.productId, pickupAtMs: i.pickupAt.getTime(), returnAtMs: i.returnAt.getTime(), quantity: i.quantity })),
      })
        .then(r => { if (alive) setState(r.data as { codes: WalletCodeOption[]; notApplicable: number }); })
        .catch(() => { if (alive) setState({ codes: [], notApplicable: 0 }); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [itemsKey]);
  return state;
}
