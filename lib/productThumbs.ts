import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File, Directory, Paths } from 'expo-file-system';
import { db, storage } from './firebase';
import { THUMB_WIDTH, thumbsAligned } from '@/utils/productImage';

// Product thumbnails — made ON THE ADMIN'S PHONE (same pipeline as the 1600 px photos):
// 600 px JPEG 0.7, stored next to the photo as products/{id}/{name}_thumb.jpg (covered by
// the products Storage rule). `thumbs` is kept in the SAME ORDER as `images`.

/** File name of a Storage download URL ("…/o/products%2Fabc%2Fk123.jpg?…" → "k123"). */
function baseName(url: string): string {
  const m = /\/o\/([^?]+)/.exec(url);
  const path = m ? decodeURIComponent(m[1]) : url;
  const file = path.split('/').pop() ?? '';
  const name = file.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]/g, '');
  return name || `img${Date.now().toString(36)}`;
}

/** Resizes a LOCAL image (file:// …) to the thumbnail size and uploads it. */
async function uploadThumbFromLocal(productId: string, name: string, localUri: string): Promise<string> {
  const small = await manipulateAsync(localUri, [{ resize: { width: THUMB_WIDTH } }], { compress: 0.7, format: SaveFormat.JPEG });
  const blob: Blob = await (await fetch(small.uri)).blob();
  const sRef = storageRef(storage, `products/${productId}/${name}_thumb.jpg`);
  await uploadBytes(sRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(sRef);
}

/**
 * Thumbnail for one product photo. `source` = the local picked file (new photo) or the
 * photo's download URL (existing photo — downloaded to the cache first).
 */
export async function makeProductThumb(productId: string, imageUrlOrKey: string, source: string): Promise<string> {
  const name = baseName(imageUrlOrKey);
  if (/^https?:/i.test(source)) {
    const file = await File.downloadFileAsync(source, new Directory(Paths.cache), { idempotent: true });
    try {
      return await uploadThumbFromLocal(productId, name, file.uri);
    } finally {
      try { file.delete(); } catch {}
    }
  }
  return uploadThumbFromLocal(productId, name, source);
}

// ── Backfill (Admin → Products → Thumbnails) ──────────────────────────────────

export interface ThumbBackfillItem { id: string; name: string; photos: number }

/** Dry run: products whose `thumbs` don't line up with their photos. No writes. */
export async function findProductsMissingThumbs(): Promise<ThumbBackfillItem[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => Array.isArray(data.images) && data.images.length > 0 && !thumbsAligned(data))
    .map(({ id, data }) => ({ id, name: String(data.name ?? id), photos: data.images.length }));
}

/**
 * Generates every thumbnail of ONE product (photos re-read just before) and writes
 * `thumbs`. Throws on failure — the caller lists it and moves on.
 */
export async function backfillProductThumbs(productId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'products', productId));
  const images: string[] = Array.isArray(snap.get('images')) ? snap.get('images') : [];
  if (images.length === 0) return;
  const thumbs: string[] = [];
  for (const url of images) thumbs.push(await makeProductThumb(productId, url, url));
  await updateDoc(doc(db, 'products', productId), { thumbs, updatedAt: serverTimestamp() });
}
