import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import type React from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from './firebase';
import { SHADES } from '@/constants/brandShades';
import { vteEndOfDayMs } from '@/functions/src/shared/dates';

// Home "Got plans?" occasion collections — admin-managed (Admin → Collections). Renters
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
}

export type CollectionInput = Omit<CollectionDoc, 'id'>;

export const COLLECTION_LIMITS = { title: 40, subtitle: 80 } as const;

export function shadeOf(c: { shade: string }): { bg: string; fg: string } {
  return COLLECTION_SHADES[c.shade as CollectionShade] ?? COLLECTION_SHADES.carbonLight;
}

export function isCollectionActive(c: Pick<CollectionDoc, 'activeFrom' | 'activeTo'>, nowMs: number = Date.now()): boolean {
  if (c.activeFrom && nowMs < c.activeFrom.toMillis()) return false;
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
  };
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
  return ref.id;
}

export async function updateCollection(id: string, input: Partial<CollectionInput>): Promise<void> {
  await updateDoc(doc(db, 'collections', id), { ...input, updatedAt: serverTimestamp() });
}

export async function deleteCollection(id: string): Promise<void> {
  await deleteDoc(doc(db, 'collections', id));
}

/** Rewrites `order` as 0..n-1 following the given id list (one batch). */
export async function saveCollectionOrder(ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach((id, i) => batch.update(doc(db, 'collections', id), { order: i, updatedAt: serverTimestamp() }));
  await batch.commit();
}
