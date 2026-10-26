import type { RentalDoc } from './firestore';
import type { Product } from './mockData';
import { CATEGORIES } from './mockData';
import { toLak } from '@/utils/currency';

// My Account stats + stickers — pure, from the renter's reservations and the catalogue.
//   round trips             = returned rentals
//   things not in closet    = DISTINCT products picked up (ongoing + returned; lost excluded)
//   LAK not spent on stuff  = sum of those products' replacement values (retailPrice, USD →
//                             LAK), each counted once; `partial` when some have no value
//                             (shown as "12.4M+"); null when none has one (card hidden)
//   stickers                = categories with at least one RETURNED rental, catalogue order,
//                             + the next category not rented yet (locked); stickerUnlocks =
//                             the FIRST returned rental of each category (name + date)

export interface AccountStats {
  roundTrips: number;
  distinctProducts: number;
  valueLak: number | null;
  valuePartial: boolean;
  /** No rental picked up yet (pending bookings don't count) → "first rental" card. */
  newRenter: boolean;
  stickers: string[];
  nextSticker: string | null;
  stickerUnlocks: Record<string, StickerUnlock>;
}

export interface StickerUnlock { productName: string; atMs: number }

const ORDER = CATEGORIES.map(c => c.id).filter(id => id !== 'all');

export function computeAccountStats(rentals: RentalDoc[], products: Product[], exchangeRate: number | null): AccountStats {
  const byId = new Map(products.map(p => [p.id, p]));
  const returned = rentals.filter(r => r.status === 'returned');
  const pickedUp = rentals.filter(r => r.status === 'returned' || r.status === 'active');
  const distinct = [...new Set(pickedUp.map(r => r.productId))];

  let value = 0;
  let withValue = 0;
  for (const id of distinct) {
    const p = byId.get(id);
    if (p?.retailPrice && exchangeRate != null) {
      value += toLak(p.retailPrice, exchangeRate);
      withValue++;
    }
  }

  const rentedCats = new Set(returned.map(r => byId.get(r.productId)?.category).filter(Boolean) as string[]);
  const stickers = ORDER.filter(c => rentedCats.has(c));
  const stickerUnlocks: Record<string, StickerUnlock> = {};
  for (const r of returned) {
    const cat = byId.get(r.productId)?.category;
    const atMs = (r.returnedAt ?? r.returnAt)?.toMillis?.();
    if (!cat || atMs == null) continue;
    if (!stickerUnlocks[cat] || atMs < stickerUnlocks[cat].atMs) stickerUnlocks[cat] = { productName: r.productName, atMs };
  }
  return {
    roundTrips: returned.length,
    distinctProducts: distinct.length,
    valueLak: withValue > 0 ? value : null,
    valuePartial: withValue > 0 && withValue < distinct.length,
    newRenter: pickedUp.length === 0,
    stickers,
    nextSticker: ORDER.find(c => !rentedCats.has(c)) ?? null,
    stickerUnlocks,
  };
}

/** 12_400_000 → "12.4M", 850_000 → "850K", 950 → "950". */
export function compactLak(n: number): string {
  const fmt = (x: number) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ''));
  if (n >= 1e9) return `${fmt(n / 1e9)}B`;
  if (n >= 1e6) return `${fmt(n / 1e6)}M`;
  if (n >= 1e3) return `${fmt(n / 1e3)}K`;
  return String(Math.round(n));
}
