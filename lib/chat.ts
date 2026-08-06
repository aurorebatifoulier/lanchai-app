import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  senderType: 'renter' | 'business';
  text: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  createdAt: Timestamp | null;
  read: boolean;
}

export interface Conversation {
  id: string;
  renterId: string;
  renterName: string;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastSenderType: 'renter' | 'business';
  unreadByBusiness: number;
  unreadByRenter: number;
  createdAt: Timestamp | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WELCOME_TEXT = "Hi! How can we help you today?";
const BUSINESS_ID  = 'lanchai-business';

// ── Conversation init ─────────────────────────────────────────────────────────

/**
 * Creates the conversation doc and inserts the business welcome message
 * the first time a renter opens the chat. No-op if the conversation exists.
 */
export async function initConversation(uid: string, renterName: string): Promise<void> {
  const convRef = doc(db, 'conversations', uid);
  const snap = await getDoc(convRef);
  if (snap.exists()) return;

  await setDoc(convRef, {
    renterId:         uid,
    renterName,
    lastMessage:      WELCOME_TEXT,
    lastMessageAt:    serverTimestamp(),
    lastSenderType:   'business',
    unreadByBusiness: 0,
    unreadByRenter:   1,
    createdAt:        serverTimestamp(),
  });

  await addDoc(collection(db, 'conversations', uid, 'messages'), {
    senderId:   BUSINESS_ID,
    senderType: 'business',
    text:       WELCOME_TEXT,
    imageUrl:   null,
    videoUrl:   null,
    createdAt:  serverTimestamp(),
    read:       false,
  });
}

// ── Send message ──────────────────────────────────────────────────────────────

export async function sendMessage(
  uid: string,
  text: string | null,
  imageUrl: string | null,
  videoUrl: string | null = null,
): Promise<void> {
  const preview = text ?? (imageUrl ? '📷 Photo' : videoUrl ? '🎥 Video' : '');

  await addDoc(collection(db, 'conversations', uid, 'messages'), {
    senderId:   uid,
    senderType: 'renter',
    text,
    imageUrl,
    videoUrl,
    createdAt:  serverTimestamp(),
    read:       false,
  });

  await updateDoc(doc(db, 'conversations', uid), {
    lastMessage:      preview,
    lastMessageAt:    serverTimestamp(),
    lastSenderType:   'renter',
    unreadByBusiness: increment(1),
  });
}

/** Clears the renter's own unread badge when they open their chat. */
export async function markConversationReadByRenter(uid: string): Promise<void> {
  await updateDoc(doc(db, 'conversations', uid), { unreadByRenter: 0 });
}

// ── Business (admin) side ───────────────────────────────────────────────────

/** Fallback fetch for a single conversation (e.g. opening a thread without renterName in route params). */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const snap = await getDoc(doc(db, 'conversations', conversationId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Conversation;
}

/** Clears a conversation's unread-by-business badge when an admin opens it. */
export async function markConversationReadByBusiness(conversationId: string): Promise<void> {
  await updateDoc(doc(db, 'conversations', conversationId), { unreadByBusiness: 0 });
}

export async function sendBusinessMessage(
  conversationId: string,
  adminUid: string,
  text: string | null,
  imageUrl: string | null,
  videoUrl: string | null = null,
): Promise<void> {
  const preview = text ?? (imageUrl ? '📷 Photo' : videoUrl ? '🎥 Video' : '');

  await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    senderId:   adminUid,
    senderType: 'business',
    text,
    imageUrl,
    videoUrl,
    createdAt:  serverTimestamp(),
    read:       false,
  });

  await updateDoc(doc(db, 'conversations', conversationId), {
    lastMessage:    preview,
    lastMessageAt:  serverTimestamp(),
    lastSenderType: 'business',
    unreadByRenter: increment(1),
  });
}

/** Real-time list of every conversation, newest activity first. Admin-only per firestore.rules. */
export function subscribeToConversations(
  onConversations: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(db, 'conversations'),
    orderBy('lastMessageAt', 'desc'),
  );

  return onSnapshot(
    q,
    snap => {
      onConversations(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)),
      );
    },
    onError,
  );
}

/** Live count of conversations with an unread business message, for the Inbox tab badge. */
export function subscribeToUnreadInboxCount(
  onCount: (count: number) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(db, 'conversations'),
    where('unreadByBusiness', '>', 0),
  );

  return onSnapshot(q, snap => onCount(snap.size), onError);
}

// ── Real-time subscription ─────────────────────────────────────────────────────

export function subscribeToMessages(
  uid: string,
  onMessages: (msgs: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(db, 'conversations', uid, 'messages'),
    orderBy('createdAt', 'asc'),
  );

  return onSnapshot(
    q,
    snap => {
      onMessages(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)),
      );
    },
    onError,
  );
}

// ── Image upload ──────────────────────────────────────────────────────────────

/** Uploads a local image URI to Firebase Storage and returns its download URL.
 * Path: chat-images/{uid}/{timestamp} */
export async function uploadChatImage(uid: string, localUri: string): Promise<string> {
  const storageRef = ref(storage, `chat-images/${uid}/${Date.now()}`);
  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ── Video upload ──────────────────────────────────────────────────────────────

/** Gallery-picked videos aren't compressed client-side (no compression library is
 * installed) — anything larger than this is rejected before upload rather than
 * silently stalling on a slow connection. Recorded videos are capped at the source
 * instead (duration + quality), so they never hit this limit in practice. */
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB

/** Uploads a local video URI to Firebase Storage and returns its download URL.
 * Path: chat-videos/{uid}/{timestamp}.mp4 */
export async function uploadChatVideo(uid: string, localUri: string): Promise<string> {
  const storageRef = ref(storage, `chat-videos/${uid}/${Date.now()}.mp4`);

  const response = await fetch(localUri);
  const blob = await response.blob();

  if (blob.size > CHAT_VIDEO_MAX_BYTES) {
    throw new Error('VIDEO_TOO_LARGE');
  }

  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
