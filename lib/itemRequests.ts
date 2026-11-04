import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, getDocs,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './auth';
import type { ItemRequestStatus } from '@/functions/src/shared/itemRequests';

export * from '@/functions/src/shared/itemRequests';

// "Ask for an item" requests (requests/{id}) — renter create (Explore) + admin list /
// status (Admin → Item requests). The renter is told by the onItemRequestUpdated trigger.

export interface ItemRequest {
  id: string;
  text: string;
  contact: string | null;
  category: string | null;
  renterId: string | null;    // null on requests made before 2026-11-04
  renterName: string | null;
  status: ItemRequestStatus;
  createdAt: Timestamp | null;
  statusAt?: Timestamp | null;
  statusBy?: string | null;
  productId?: string | null;
  productName?: string | null;
}

/** Renter: sends a request as the signed-in account. Throws on failure. */
export async function submitItemRequest(input: { text: string; contact: string; category: string | null }): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('not-signed-in');
  await addDoc(collection(db, 'requests'), {
    text: input.text.trim().slice(0, 1000),
    contact: input.contact.trim().slice(0, 200) || null,
    category: input.category,
    renterId: u.uid,
    renterName: (u.displayName || u.email || 'Renter').slice(0, 120),
    status: 'new',
    createdAt: serverTimestamp(),
  });
}

/** Admin: every request, newest first (single orderBy — no composite index). */
export function useItemRequests(): { items: ItemRequest[] | null; error: boolean } {
  const [items, setItems] = useState<ItemRequest[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => onSnapshot(
    query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
    snap => {
      setError(false);
      setItems(snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id,
          text: String(x.text ?? ''),
          contact: x.contact ?? null,
          category: x.category ?? null,
          renterId: x.renterId ?? null,
          renterName: x.renterName ?? null,
          status: (x.status ?? 'new') as ItemRequestStatus,
          createdAt: x.createdAt ?? null,
          statusAt: x.statusAt ?? null,
          statusBy: x.statusBy ?? null,
          productId: x.productId ?? null,
          productName: x.productName ?? null,
        };
      }));
    },
    () => setError(true),
  ), []);
  return { items, error };
}

/** Admin dashboard badge: requests still 'new'. */
export async function countNewItemRequests(): Promise<number> {
  return (await getDocs(query(collection(db, 'requests'), where('status', '==', 'new')))).size;
}

/** Admin: changes the status ('added' needs the product). */
export async function setItemRequestStatus(
  id: string, status: ItemRequestStatus, product?: { id: string; name: string },
): Promise<void> {
  const u = auth.currentUser;
  await updateDoc(doc(db, 'requests', id), {
    status,
    statusAt: serverTimestamp(),
    statusBy: u?.displayName || u?.email || 'staff',
    productId: status === 'added' && product ? product.id : null,
    productName: status === 'added' && product ? product.name : null,
  });
}
