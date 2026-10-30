import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './auth';

// "Recently viewed" (Liked): recentViews/{uid} = { items: [{ productId, at }] } — the
// last 10 products opened, newest first, no duplicates (firestore.rules caps it at 10).

export const RECENT_VIEWS_MAX = 10;
interface RecentItem { productId: string; at: number }

/** Called when a product page opens — writes only when it isn't already first. */
export async function recordProductView(productId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, 'recentViews', uid);
  const snap = await getDoc(ref);
  const items = ((snap.data()?.items ?? []) as RecentItem[]).filter(i => i && typeof i.productId === 'string');
  if (items[0]?.productId === productId) return;
  const next = [{ productId, at: Date.now() }, ...items.filter(i => i.productId !== productId)].slice(0, RECENT_VIEWS_MAX);
  await setDoc(ref, { items: next, updatedAt: serverTimestamp() });
}

/** Product ids, newest first (live). */
export function useRecentViews(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, 'recentViews', uid),
      snap => setIds(((snap.data()?.items ?? []) as RecentItem[]).map(i => i.productId)),
      () => setIds([]));
  }, []);
  return ids;
}
