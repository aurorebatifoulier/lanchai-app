import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Admin chat saved replies — savedReplies/{id} (admin-only in firestore.rules).

export interface SavedReply { id: string; text: string }

/** Live list, oldest first (the order staff created them). */
export function useSavedReplies(): SavedReply[] | null {
  const [items, setItems] = useState<SavedReply[] | null>(null);
  useEffect(() => onSnapshot(
    query(collection(db, 'savedReplies'), orderBy('createdAt', 'asc')),
    snap => setItems(snap.docs.map(d => ({ id: d.id, text: String(d.get('text') ?? '') }))),
    () => setItems([]),
  ), []);
  return items;
}

export const addSavedReply = (text: string) =>
  addDoc(collection(db, 'savedReplies'), { text: text.trim().slice(0, 1000), createdAt: serverTimestamp() });
export const updateSavedReply = (id: string, text: string) =>
  updateDoc(doc(db, 'savedReplies', id), { text: text.trim().slice(0, 1000), updatedAt: serverTimestamp() });
export const deleteSavedReply = (id: string) => deleteDoc(doc(db, 'savedReplies', id));
