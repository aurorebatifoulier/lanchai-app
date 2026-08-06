import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// Shape of a document in users/{uid}/bag/{itemId}
export interface BagItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  pickupAt: Timestamp | null;
  returnAt: Timestamp | null;
  quantity: number;
  addedAt: Timestamp;
}

function bagCol(uid: string) {
  return collection(db, 'users', uid, 'bag');
}

// Throws on Firestore error — caller must handle.
export async function addToBag(
  uid: string,
  product: { id: string; name: string; images?: string[] },
): Promise<string> {
  const ref = await addDoc(bagCol(uid), {
    productId:    product.id,
    productName:  product.name,
    productImage: product.images?.[0] ?? null,
    pickupAt:     null,
    returnAt:     null,
    quantity:     1,
    addedAt:      serverTimestamp(),
  });
  return ref.id;
}

// Throws on Firestore error — caller must handle.
export async function removeFromBag(uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'bag', itemId));
}

// Returns an unsubscribe function.
export function listenBagItems(
  uid: string,
  onNext: (items: BagItem[]) => void,
  onError?: () => void,
): () => void {
  return onSnapshot(
    bagCol(uid),
    snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as BagItem));
      onNext(items);
    },
    () => onError?.(),
  );
}

// Throws on Firestore error — caller must handle.
export async function updateBagItemDates(
  uid: string,
  itemId: string,
  pickupAt: Date,
  returnAt: Date,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'bag', itemId), {
    pickupAt: Timestamp.fromDate(pickupAt),
    returnAt: Timestamp.fromDate(returnAt),
  });
}

// Throws on Firestore error — caller must handle.
export async function updateBagItemQuantity(
  uid: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'bag', itemId), { quantity });
}

// Wipes the entire bag — called after successful checkout.
// Throws on Firestore error — caller must handle.
export async function clearBag(uid: string): Promise<void> {
  const snap = await getDocs(bagCol(uid));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}
