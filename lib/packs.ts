import { useEffect, useState } from 'react';
import { cached, HOME_TTL } from './homeCache';
import { getPublishedCollections, toPack, type CollectionDoc } from './collections';
import { packDiscount, packLabel, type PackLine, type PackError } from '@/functions/src/shared/packs';

// Bookable packs on the app side: the published packs (same cached read as the Home
// collections — no extra Firestore read) and the pack-price options of a set of booking
// lines, computed with the SAME shared rule as createReservations (shared/packs.ts).

/** Published, in-window packs (the item checks happen per screen / server-side). */
export function usePublishedPacks(): CollectionDoc[] {
  const [packs, setPacks] = useState<CollectionDoc[]>([]);
  useEffect(() => {
    let alive = true;
    cached('collections:published', HOME_TTL.config, getPublishedCollections)
      .then(list => { if (alive) setPacks(list.filter(c => c.isPack)); })
      .catch(() => { if (alive) setPacks([]); });
    return () => { alive = false; };
  }, []);
  return packs;
}

export interface PackOption { packId: string; title: string; percent: number; label: string; savings: number }

/** Every pack these lines complete, best first (one discount per booking — the renter picks). */
export function packOptions(packs: CollectionDoc[], lines: PackLine[], nowMs = Date.now()): PackOption[] {
  const out: PackOption[] = [];
  for (const c of packs) {
    const p = toPack(c);
    const r = packDiscount(p, lines, nowMs);
    if (r.ok) out.push({ packId: c.id, title: c.title, percent: p.discountPct, label: packLabel(c.title, p.discountPct), savings: r.total });
  }
  return out.sort((a, b) => b.savings - a.savings);
}

/** Packs these lines ALMOST complete (for the bag hint): the reason the price doesn't apply. */
export function packNearMisses(packs: CollectionDoc[], lines: PackLine[], nowMs = Date.now()): { title: string; error: PackError }[] {
  const out: { title: string; error: PackError }[] = [];
  for (const c of packs) {
    const p = toPack(c);
    const inBag = p.items.filter(it => lines.some(l => l.productId === it.productId)).length;
    if (inBag === 0 || inBag < Math.ceil(p.items.length / 2)) continue; // not really started
    const r = packDiscount(p, lines, nowMs);
    if (!r.ok && r.error !== 'inactive' && r.error !== 'no-discount') out.push({ title: c.title, error: r.error });
  }
  return out;
}
