import {
  collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import type React from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db, storage } from './firebase';
import {
  packOf, isPackActive, PACK_DISCOUNT_DEFAULT, clampPackPct, type Pack, type PackItem,
} from '@/functions/src/shared/packs';
import { getProductAccessState } from '@/utils/productAccess';
import type { Product } from './mockData';
import type { LoyaltyTier } from './firestore';
import { SHADES } from '@/constants/brandShades';
import { vteEndOfDayMs } from '@/functions/src/shared/dates';
import { clearHomeCache } from './homeCache';

// Home "Got plans?" occasion collections AND bookable packs (`isPack: true` — items with a
// quantity + a pack discount on the rental price, functions/src/shared/packs.ts) —
// admin-managed (Admin → Collections). Renters
// can read PUBLISHED ones only (firestore.rules), so every renter query filters
// published == true (equality only, no index); dates and order are applied in code.
export type CollectionIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type CollectionShade = 'amberLight' | 'amberMid' | 'carbon' | 'carbonLight';

export const COLLECTION_SHADES: Record<CollectionShade, { bg: string; fg: string }> = {
  amberLight: { bg: SHADES.amberLight, fg: SHADES.amberDeep },
  amberMid: { bg: SHADES.amberMid, fg: SHADES.carbon },
  carbon: { bg: SHADES.carbon, fg: SHADES.amber },
  carbonLight: { bg: SHADES.carbonLight, fg: SHADES.carbon },
};

/** Home "Got plans?" tile colours (tile background = the shade, text adapted). */
export const COLLECTION_TILE: Record<CollectionShade, { bg: string; icon: string; title: string; sub: string }> = {
  amberLight: { bg: SHADES.amberLight, icon: SHADES.amberDeep, title: SHADES.carbon, sub: SHADES.amberDeep },
  amberMid: { bg: SHADES.amberMid, icon: SHADES.carbon, title: SHADES.carbon, sub: SHADES.carbonSoft },
  carbon: { bg: SHADES.carbon, icon: SHADES.amber, title: SHADES.white, sub: SHADES.carbonFaint },
  carbonLight: { bg: SHADES.carbonLight, icon: SHADES.carbon, title: SHADES.carbon, sub: SHADES.carbonMuted },
};

/** Icons offered in the admin picker — rentable objects / occasions. */
export const COLLECTION_ICONS: CollectionIcon[] = [
  'tent', 'baby-carriage', 'truck-outline', 'party-popper', 'speaker', 'sail-boat',
  'account-group-outline', 'hammer-wrench', 'bike', 'umbrella-beach-outline', 'gift-outline', 'sofa-outline',
];

export interface CollectionDoc {
  id: string;
  title: string;
  subtitle: string;
  icon: CollectionIcon;
  shade: CollectionShade;
  productIds: string[];
  /** Optional seasonal window, both inclusive (activeTo = through the end of that Vientiane day). */
  activeFrom: Timestamp | null;
  activeTo: Timestamp | null;
  order: number;
  published: boolean;
  /** Bookable pack (Home "Packs", pack page, pack price at checkout). */
  isPack: boolean;
  /** Pack items with their quantity (productIds = the same products). */
  items: PackItem[];
  /** Pack discount on the rental price, 0–30 (default 5). Deposits are never discounted. */
  packDiscountPct: number;
  /** Optional pack photo (Storage collections/{id}/…). */
  imagePath: string | null;
  imageUrl: string | null;
}

type PackFields = 'isPack' | 'items' | 'packDiscountPct' | 'imagePath' | 'imageUrl';
export type CollectionInput = Omit<CollectionDoc, 'id' | PackFields> & Partial<Pick<CollectionDoc, PackFields>>;

export const COLLECTION_LIMITS = { title: 40, subtitle: 80 } as const;

export function shadeOf(c: { shade: string }): { bg: string; fg: string } {
  return COLLECTION_SHADES[c.shade as CollectionShade] ?? COLLECTION_SHADES.carbonLight;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isCollectionActive(c: Pick<CollectionDoc, 'activeFrom' | 'activeTo'>, nowMs: number = Date.now()): boolean {
  // Whole Vientiane days: from the start of activeFrom's day through the end of activeTo's.
  if (c.activeFrom && nowMs < vteEndOfDayMs(c.activeFrom.toMillis()) - DAY_MS) return false;
  if (c.activeTo && nowMs >= vteEndOfDayMs(c.activeTo.toMillis())) return false;
  return true;
}

function fromSnap(id: string, d: Record<string, unknown>): CollectionDoc {
  return {
    id,
    title: String(d.title ?? ''),
    subtitle: String(d.subtitle ?? ''),
    icon: (d.icon as CollectionIcon) ?? 'gift-outline',
    shade: (d.shade as CollectionShade) ?? 'carbonLight',
    productIds: Array.isArray(d.productIds) ? (d.productIds as string[]) : [],
    activeFrom: (d.activeFrom as Timestamp | null) ?? null,
    activeTo: (d.activeTo as Timestamp | null) ?? null,
    order: typeof d.order === 'number' ? d.order : 0,
    published: d.published === true,
    isPack: d.isPack === true,
    items: packOf(id, d).items,
    packDiscountPct: d.packDiscountPct === undefined ? PACK_DISCOUNT_DEFAULT : clampPackPct(d.packDiscountPct),
    imagePath: typeof d.imagePath === 'string' ? d.imagePath : null,
    imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : null,
  };
}

// ── Packs ────────────────────────────────────────────────────────────────────

/** The shared Pack shape (same evaluation as createReservations). */
export function toPack(c: CollectionDoc): Pack {
  return packOf(c.id, {
    title: c.title, isPack: c.isPack, published: c.published, items: c.items,
    packDiscountPct: c.packDiscountPct, activeFrom: c.activeFrom, activeTo: c.activeTo,
  });
}

/** Why a pack is hidden from renters (admin warning): its missing / unbookable items. */
export function packMissingItems(c: CollectionDoc, products: Product[], tier: LoyaltyTier | null): string[] {
  const byId = new Map(products.map(p => [p.id, p]));
  return c.items.filter(it => {
    const p = byId.get(it.productId);
    return !p || p.available === false || getProductAccessState(p, tier).locked;
  }).map(it => it.productId);
}

/** Renter-visible pack: published, in its window, and EVERY item exists, is published,
 *  available and not tier-locked for this renter (`products` = getProducts(), renter-visible). */
export function isPackVisible(c: CollectionDoc, products: Product[], tier: LoyaltyTier | null, nowMs = Date.now()): boolean {
  return c.isPack && isPackActive(toPack(c), nowMs) && packMissingItems(c, products, tier).length === 0;
}

/** Pack photo: same pipeline as Home slides / product photos (1600px, JPEG 0.7). */
export async function uploadCollectionPhoto(collectionId: string, localUri: string): Promise<{ imagePath: string; imageUrl: string }> {
  const compressed = await manipulateAsync(localUri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const blob: Blob = await (await fetch(compressed.uri)).blob();
  const imagePath = `collections/${collectionId}/${Date.now()}.jpg`;
  const ref = storageRef(storage, imagePath);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  return { imagePath, imageUrl: await getDownloadURL(ref) };
}

/** Removes a replaced / deleted pack photo (best effort). */
export async function deleteCollectionPhoto(imagePath: string): Promise<void> {
  await deleteObject(storageRef(storage, imagePath)).catch(() => {});
}

/** A new collection id without a network call (so its photo can be uploaded first). */
export function newCollectionId(): string {
  return doc(collection(db, 'collections')).id;
}

const byOrder = (a: CollectionDoc, b: CollectionDoc) => a.order - b.order || a.title.localeCompare(b.title);

/** Renter: published collections in their active window, in admin order. */
export async function getPublishedCollections(): Promise<CollectionDoc[]> {
  const snap = await getDocs(query(collection(db, 'collections'), where('published', '==', true)));
  return snap.docs.map(d => fromSnap(d.id, d.data())).filter(c => isCollectionActive(c)).sort(byOrder);
}

/** One collection; null when missing or not readable (a renter opening a draft). */
export async function getCollection(id: string): Promise<CollectionDoc | null> {
  try {
    const snap = await getDoc(doc(db, 'collections', id));
    return snap.exists() ? fromSnap(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getAllCollections(): Promise<CollectionDoc[]> {
  const snap = await getDocs(collection(db, 'collections'));
  return snap.docs.map(d => fromSnap(d.id, d.data())).sort(byOrder);
}

export async function createCollection(input: CollectionInput): Promise<string> {
  const ref = await addDoc(collection(db, 'collections'), {
    ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  clearHomeCache('collections'); // after the write (see lib/homeCache.ts)
  return ref.id;
}

export async function updateCollection(id: string, input: Partial<CollectionInput>): Promise<void> {
  await updateDoc(doc(db, 'collections', id), { ...input, updatedAt: serverTimestamp() });
  clearHomeCache('collections'); // after the write (see lib/homeCache.ts)
}

export async function deleteCollection(id: string, imagePath?: string | null): Promise<void> {
  await deleteDoc(doc(db, 'collections', id));
  clearHomeCache('collections'); // after the write (see lib/homeCache.ts)
  if (imagePath) await deleteCollectionPhoto(imagePath);
}

/** Creates the collection under a given id (newCollectionId) — pack photo uploaded first. */
export async function createCollectionWithId(id: string, input: CollectionInput): Promise<void> {
  await setDoc(doc(db, 'collections', id), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  clearHomeCache('collections'); // after the write (see lib/homeCache.ts)
}

/** Rewrites `order` as 0..n-1 following the given id list (one batch). */
export async function saveCollectionOrder(ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach((id, i) => batch.update(doc(db, 'collections', id), { order: i, updatedAt: serverTimestamp() }));
  await batch.commit();
  clearHomeCache('collections'); // after the write (see lib/homeCache.ts)
}
