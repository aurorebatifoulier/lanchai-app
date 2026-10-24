import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db, storage, functions } from './firebase';
import { auth } from './auth';
import { idDocPrefix, type IdDocType, type IdentityRecord } from '@/functions/src/shared/identity';

export * from '@/functions/src/shared/identity';

// Identity document required to rent — app side. identityChecks/{uid} is server-written
// (submitIdentityDocument); files go to Storage idDocs/{uid}/ (owner + admin only) and
// are referenced by PATH only — never store or share a download URL.

/** Live identityChecks/{uid} of the signed-in renter (null = none yet). */
export function useMyIdentity(): { identity: IdentityRecord | null; loading: boolean } {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    return onSnapshot(
      doc(db, 'identityChecks', uid),
      snap => { setIdentity(snap.exists() ? (snap.data() as IdentityRecord) : null); setLoading(false); },
      () => setLoading(false),
    );
  }, []);
  return { identity, loading };
}

/** Camera or gallery → local image uri (null if cancelled or permission denied). */
export async function pickIdPhoto(source: 'camera' | 'gallery'): Promise<string | null> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return null;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    return r.canceled ? null : r.assets?.[0]?.uri ?? null;
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
  return r.canceled ? null : r.assets?.[0]?.uri ?? null;
}

/** Compresses (1600px JPEG, like the business document) and uploads under idDocs/{uid}/. */
export async function uploadIdPhotos(uid: string, uris: string[], tag: string): Promise<string[]> {
  const stamp = Date.now();
  const paths: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const compressed = await manipulateAsync(uris[i], [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
    const blob: Blob = await (await fetch(compressed.uri)).blob();
    const path = `${idDocPrefix(uid)}${tag}_${stamp}_${i + 1}.jpg`;
    await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
    paths.push(path);
  }
  return paths;
}

/** Uploads the photos and registers them as the renter's identity document. */
export async function submitMyIdentityDocument(docType: IdDocType, uris: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  const files = await uploadIdPhotos(uid, uris, 'identity');
  try {
    await httpsCallable(functions, 'submitIdentityDocument')({ docType, files });
  } catch (err) {
    throw new Error((err as { message?: string })?.message || 'Could not save your ID. Please try again.');
  }
}

/** Renter asks to delete their ID (My ID). Deleted now only when the retention rule
 *  allows it; otherwise returns when it will be deleted (functions/src/retention.ts). */
export async function deleteMyIdentityDocument(): Promise<
  { deleted: true } | { deleted: false; keptUntilMs: number | null; reason: 'blocked' | 'rental_in_progress' | 'retention'; months: number }
> {
  try {
    const res = await httpsCallable(functions, 'deleteMyIdentityDocument')();
    return res.data as never;
  } catch (err) {
    throw new Error((err as { message?: string })?.message || 'Could not delete your ID. Please try again.');
  }
}
