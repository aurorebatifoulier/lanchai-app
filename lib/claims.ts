import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

export type ClaimType = 'damage_not_caused' | 'missing_accessory' | 'not_as_described' | 'other';
export type ClaimStatus = 'open' | 'in_review' | 'resolved' | 'rejected';
export type ClaimMediaType = 'image' | 'video';

export interface ClaimMediaItem {
  url: string;
  type: ClaimMediaType;
}

export interface ClaimDoc {
  id: string;
  userId: string;
  reservationId: string;
  productId: string;
  type: ClaimType;
  description: string;
  media: ClaimMediaItem[];
  status: ClaimStatus;
  adminResponse: string | null;
  adminRespondedAt: Timestamp | null;
  adminRespondedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Gallery-picked videos aren't compressed client-side (no compression library is
// installed for video) — anything larger than this is rejected before upload.
// Independent from lib/chat.ts's CHAT_VIDEO_MAX_BYTES (currently the same value, by
// coincidence, not by shared reference) — these are separately-owned limits for
// unrelated features, and chat's own storage rule already drifts from its client
// constant (60MB rule vs 50MB client cap), so nothing is gained by coupling them.
export const CLAIM_VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB

// Normalizes a raw Firestore doc into a ClaimDoc — the single point every claim
// read goes through, so every consumer can trust `media` is always a real array.
// Claims created before the photos:string[] -> media:{url,type}[] rename have no
// `media` field at all; those are mapped from the legacy `photos` field here
// (assumed all-image, since video attachments didn't exist yet at that point).
// Use this instead of a raw `{ id, ...data() } as ClaimDoc` cast anywhere in the
// app — that cast lies about `media` being present when Firestore didn't send it.
export function toClaimDoc(id: string, data: any): ClaimDoc {
  const media: ClaimMediaItem[] = Array.isArray(data.media)
    ? data.media
    : Array.isArray(data.photos)
      ? data.photos.map((url: string) => ({ url, type: 'image' as const }))
      : [];
  return { ...data, id, media } as ClaimDoc;
}

// Compresses (matches app/admin/reservations/[id]/checklist.tsx's checklist-photo
// pipeline) then uploads to claim-photos/{uid}/{Date.now()}_{index}.jpg — the index
// suffix avoids collisions when several photos from one claim upload in quick
// succession (a plain Date.now()-only path, as used for single chat images, isn't
// safe here since millisecond resolution isn't enough to guarantee uniqueness across
// a fast sequential loop).
export async function uploadClaimPhoto(uid: string, localUri: string, index: number): Promise<string> {
  const compressed = await manipulateAsync(
    localUri,
    [{ resize: { width: 1600 } }],
    { compress: 0.7, format: SaveFormat.JPEG },
  );
  const blob: Blob = await (await fetch(compressed.uri)).blob();
  const sRef = storageRef(storage, `claim-photos/${uid}/${Date.now()}_${index}.jpg`);
  await uploadBytes(sRef, blob);
  return getDownloadURL(sRef);
}

// Mirrors lib/chat.ts's uploadChatVideo (no compression library installed for
// video, so uploaded as-is once under the size cap) — but with an index suffix
// (chat never needs one, since it only ever sends one video per message; a claim
// can carry several video attachments uploaded in one sequential loop).
export async function uploadClaimVideo(uid: string, localUri: string, index: number): Promise<string> {
  const sRef = storageRef(storage, `claim-videos/${uid}/${Date.now()}_${index}.mp4`);
  const blob: Blob = await (await fetch(localUri)).blob();
  if (blob.size > CLAIM_VIDEO_MAX_BYTES) {
    throw new Error('VIDEO_TOO_LARGE');
  }
  await uploadBytes(sRef, blob);
  return getDownloadURL(sRef);
}

// Equality-only query (userId + reservationId) — deliberately does NOT also filter by
// status server-side. Firestore can combine single-field indexes for an equality-only
// compound query with no composite index required; adding a third `where('status','in',...)`
// here would very likely force one, and this project has no automated index deploy.
// Callers filter status client-side instead. Throws on Firestore error — callers handle.
export async function getClaimsForReservation(userId: string, reservationId: string): Promise<ClaimDoc[]> {
  const q = query(
    collection(db, 'claims'),
    where('userId', '==', userId),
    where('reservationId', '==', reservationId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => toClaimDoc(d.id, d.data()));
}

// Throws on Firestore error — caller must catch and surface to the user.
export async function submitClaim(params: {
  userId: string;
  reservationId: string;
  productId: string;
  type: ClaimType;
  description: string;
  media: { uri: string; type: ClaimMediaType }[];
}): Promise<void> {
  const { userId, reservationId, productId, type, description, media: localMedia } = params;

  const media: ClaimMediaItem[] = [];
  for (let i = 0; i < localMedia.length; i++) {
    const item = localMedia[i];
    const url = item.type === 'image'
      ? await uploadClaimPhoto(userId, item.uri, i)
      : await uploadClaimVideo(userId, item.uri, i);
    media.push({ url, type: item.type });
  }

  const now = Timestamp.now();
  await addDoc(collection(db, 'claims'), {
    userId,
    reservationId,
    productId,
    type,
    description,
    media,
    status: 'open',
    adminResponse: null,
    adminRespondedAt: null,
    adminRespondedBy: null,
    createdAt: now,
    updatedAt: now,
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────────

// Returns null only when no claim exists at this ID. Throws on Firestore error.
export async function getClaim(id: string): Promise<ClaimDoc | null> {
  const snap = await getDoc(doc(db, 'claims', id));
  if (!snap.exists()) return null;
  return toClaimDoc(snap.id, snap.data());
}

// Throws on Firestore error — caller must catch and surface to the user.
export async function respondToClaim(
  id: string,
  params: { status: ClaimStatus; adminResponse: string; adminRespondedBy: string },
): Promise<void> {
  const { status, adminResponse, adminRespondedBy } = params;
  await updateDoc(doc(db, 'claims', id), {
    status,
    adminResponse,
    adminRespondedAt: Timestamp.now(),
    adminRespondedBy,
    updatedAt: Timestamp.now(),
  });
}
