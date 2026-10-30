import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './auth';

// "Notify me" (Liked): availabilityWatches/{uid}_{productId}, written by the renter
// (firestore.rules); availabilityWatchJob (functions/src/watches.ts, hourly) notifies
// once the product has a free full day in the next 30 days, then deletes the watch.

const watchId = (uid: string, productId: string) => `${uid}_${productId}`;

/** Product ids the signed-in renter is watching (live). */
export function useMyWatches(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(query(collection(db, 'availabilityWatches'), where('uid', '==', uid)),
      snap => setIds(new Set(snap.docs.map(d => String(d.get('productId'))))),
      () => setIds(new Set()));
  }, []);
  return ids;
}

export async function watchProduct(productId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('signed-out');
  await setDoc(doc(db, 'availabilityWatches', watchId(uid, productId)), { uid, productId, createdAt: serverTimestamp() });
}

export async function unwatchProduct(productId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'availabilityWatches', watchId(uid, productId)));
}
