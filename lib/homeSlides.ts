import {
  collection, doc, getDocs, getDoc, query, where, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db, storage } from './firebase';
import { clearHomeCache } from './homeCache';
import { isCollectionActive } from './collections';

// Home slides — the hero carousel and the mid-page banner, managed in Admin → Home
// slides. Renters read PUBLISHED slides only (firestore.rules homeSlides), so the
// renter query filters published == true (equality only, no index); dates and order in
// code. No published + active slide for a placement → the Home keeps its built-in
// slides. Photos: Storage homeSlides/{slideId}/…, same pipeline as product photos.
export type SlidePlacement = 'hero' | 'banner';
export type SlideLink =
  | { kind: 'none' }
  | { kind: 'category'; id: string }
  | { kind: 'collection'; id: string }
  | { kind: 'product'; id: string }
  | { kind: 'explore'; q?: string; maxPrice?: number };

export interface HomeSlide {
  id: string;
  placement: SlidePlacement;
  imagePath: string | null;
  imageUrl: string | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  link: SlideLink;
  activeFrom: Timestamp | null;
  activeTo: Timestamp | null;
  order: number;
  published: boolean;
}

export type HomeSlideInput = Omit<HomeSlide, 'id'>;
export const SLIDE_LIMITS = { title: 40, subtitle: 80, cta: 24 } as const;

function linkOf(v: unknown): SlideLink {
  const l = (v ?? {}) as Record<string, unknown>;
  const id = typeof l.id === 'string' ? l.id : '';
  switch (l.kind) {
    case 'category': case 'collection': case 'product':
      return id ? { kind: l.kind, id } : { kind: 'none' };
    case 'explore':
      return {
        kind: 'explore',
        ...(typeof l.q === 'string' && l.q ? { q: l.q } : {}),
        ...(typeof l.maxPrice === 'number' && l.maxPrice > 0 ? { maxPrice: l.maxPrice } : {}),
      };
    default:
      return { kind: 'none' };
  }
}

function fromSnap(id: string, d: Record<string, unknown>): HomeSlide {
  return {
    id,
    placement: d.placement === 'banner' ? 'banner' : 'hero',
    imagePath: typeof d.imagePath === 'string' ? d.imagePath : null,
    imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : null,
    title: String(d.title ?? ''),
    subtitle: String(d.subtitle ?? ''),
    ctaLabel: String(d.ctaLabel ?? ''),
    link: linkOf(d.link),
    activeFrom: (d.activeFrom as Timestamp | null) ?? null,
    activeTo: (d.activeTo as Timestamp | null) ?? null,
    order: typeof d.order === 'number' ? d.order : 0,
    published: d.published === true,
  };
}

const byOrder = (a: HomeSlide, b: HomeSlide) => a.order - b.order;

/** Renter: published slides in their active window, in admin order (both placements). */
export async function getPublishedSlides(): Promise<HomeSlide[]> {
  const snap = await getDocs(query(collection(db, 'homeSlides'), where('published', '==', true)));
  return snap.docs.map(d => fromSnap(d.id, d.data())).filter(s => isCollectionActive(s)).sort(byOrder);
}

/** Where a slide's button / tap goes (expo-router push target), or null. */
export function slideTarget(link: SlideLink): string | { pathname: string; params: Record<string, string> } | null {
  switch (link.kind) {
    case 'category': return `/category/${link.id}`;
    case 'collection': return `/collection/${link.id}`;
    case 'product': return `/product/${link.id}`;
    case 'explore': {
      const params: Record<string, string> = {};
      if (link.q) params.q = link.q;
      if (link.maxPrice) params.maxPrice = String(link.maxPrice);
      return { pathname: '/explore', params };
    }
    default: return null;
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getAllSlides(): Promise<HomeSlide[]> {
  const snap = await getDocs(collection(db, 'homeSlides'));
  return snap.docs.map(d => fromSnap(d.id, d.data())).sort(byOrder);
}

export async function getSlide(id: string): Promise<HomeSlide | null> {
  const snap = await getDoc(doc(db, 'homeSlides', id));
  return snap.exists() ? fromSnap(snap.id, snap.data()) : null;
}

/** A new slide id without a network call (so its photo can be uploaded first). */
export function newSlideId(): string {
  return doc(collection(db, 'homeSlides')).id;
}

/** Creates the slide under a given id (newSlideId) — used by the form. */
export async function createSlideWithId(id: string, input: HomeSlideInput): Promise<void> {
  clearHomeCache('slides');
  await setDoc(doc(db, 'homeSlides', id), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function createSlide(input: HomeSlideInput): Promise<string> {
  clearHomeCache('slides');
  const ref = await addDoc(collection(db, 'homeSlides'), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateSlide(id: string, input: Partial<HomeSlideInput>): Promise<void> {
  clearHomeCache('slides');
  await updateDoc(doc(db, 'homeSlides', id), { ...input, updatedAt: serverTimestamp() });
}

/** Deletes the slide, then its photo (best effort — the slide goes even if that fails). */
export async function deleteSlide(slide: HomeSlide): Promise<void> {
  clearHomeCache('slides');
  await deleteDoc(doc(db, 'homeSlides', slide.id));
  if (slide.imagePath) await deleteObject(storageRef(storage, slide.imagePath)).catch(() => {});
}

/** Rewrites `order` as 0..n-1 for one placement's slides (one batch). */
export async function saveSlideOrder(ids: string[]): Promise<void> {
  clearHomeCache('slides');
  const batch = writeBatch(db);
  ids.forEach((id, i) => batch.update(doc(db, 'homeSlides', id), { order: i, updatedAt: serverTimestamp() }));
  await batch.commit();
}

/** Same pipeline as product photos: 1600px wide, JPEG 0.7. Returns path + URL. */
export async function uploadSlidePhoto(slideId: string, localUri: string): Promise<{ imagePath: string; imageUrl: string }> {
  const compressed = await manipulateAsync(localUri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const blob: Blob = await (await fetch(compressed.uri)).blob();
  const imagePath = `homeSlides/${slideId}/${Date.now()}.jpg`;
  const ref = storageRef(storage, imagePath);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  return { imagePath, imageUrl: await getDownloadURL(ref) };
}

/** Removes a replaced photo (best effort). */
export async function deleteSlidePhoto(imagePath: string): Promise<void> {
  await deleteObject(storageRef(storage, imagePath)).catch(() => {});
}
