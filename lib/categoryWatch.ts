import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from './auth';

// "Notify me when items arrive" (Explore, empty category): categoryWatches/{uid}_{category},
// written by the renter (firestore.rules); onCategoryArrival (functions/src/watches.ts)
// notifies (in-app + email, respecting the reminders preference) when a product is
// published in that category, then deletes the watch.

const watchId = (uid: string, category: string) => `${uid}_${category}`;

/** Categories the signed-in renter is watching (live; empty for guests). */
export function useMyCategoryWatches(): Set<string> {
  const { user, hasAccount } = useAuth();
  const uid = user?.uid;
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!uid || !hasAccount) { setIds(new Set()); return; }
    return onSnapshot(query(collection(db, 'categoryWatches'), where('uid', '==', uid)),
      snap => setIds(new Set(snap.docs.map(d => String(d.get('category'))))),
      () => setIds(new Set()));
  }, [uid, hasAccount]);
  return ids;
}

export async function watchCategory(category: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('signed-out');
  await setDoc(doc(db, 'categoryWatches', watchId(uid, category)), { uid, category, createdAt: serverTimestamp() });
}

export async function unwatchCategory(category: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'categoryWatches', watchId(uid, category)));
}
