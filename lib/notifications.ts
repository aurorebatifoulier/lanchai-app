import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function sendNotif(
  renterId: string,
  payload: {
    type:      string;
    title:     string;
    body:      string;
    icon:      string;
    iconColor: string;
    deepLink:  string;
  },
): Promise<void> {
  try {
    await addDoc(collection(db, 'notifications', renterId, 'items'), {
      ...payload,
      createdAt: serverTimestamp(),
      readAt:    null,
    });
  } catch (err) {
    console.warn('[sendNotif] Failed:', err);
  }
}
