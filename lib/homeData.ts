import type { Product } from '@/lib/mockData';
import type { RentalDoc } from '@/lib/firestore';
import { getMinPrice } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { vteMonthKey } from '@/functions/src/shared/dates';

// Pure data picks for the Home sections (validated mockup) — no Firestore access here.

const returnedMs = (r: RentalDoc) => (r.returnedAt ?? r.returnAt)?.toMillis?.() ?? 0;

// ── Rent again ───────────────────────────────────────────────────────────────

export interface RentAgainRow { product: Product; lastMs: number }

/** Distinct renter-visible products of the renter's returned rentals, latest return first. */
export function rentAgainRows(reservations: RentalDoc[], products: Product[]): RentAgainRow[] {
  const byId = new Map(products.map(p => [p.id, p]));
  const latest = new Map<string, number>();
  for (const r of reservations) {
    if (r.status !== 'returned' || !byId.has(r.productId)) continue;
    latest.set(r.productId, Math.max(latest.get(r.productId) ?? 0, returnedMs(r)));
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, lastMs]) => ({ product: byId.get(id)!, lastMs }));
}

// ── Most rented podium ───────────────────────────────────────────────────────

/**
 * Top 3 for the podium, [1st, 2nd, 3rd]: this month's returns (rentalsByMonth) when 3
 * products have some, else all-time rentalCount (title "Most rented"), else null → the
 * product rail.
 */
export function podiumPick(
  products: Product[], nowMs: number = Date.now(),
): { scope: 'month' | 'allTime'; top: Product[] } | null {
  const month = vteMonthKey(nowMs);
  const monthly = products
    .map(p => ({ p, n: p.rentalsByMonth?.[month] ?? 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (monthly.length >= 3) return { scope: 'month', top: monthly.slice(0, 3).map(x => x.p) };
  const allTime = products
    .map(p => ({ p, n: p.rentalCount ?? p.bookingsCount ?? 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (allTime.length >= 3) return { scope: 'allTime', top: allTime.slice(0, 3).map(x => x.p) };
  return null;
}

// ── Why buy it? ──────────────────────────────────────────────────────────────

export type WhyBuy =
  | { kind: 'mine'; product: Product; retailLak: number; times: number; paidLak: number }
  | { kind: 'catalogue'; product: Product; retailLak: number; perDayLak: number };

/**
 * Returning renter: the product they returned most often (tie → most recent) that has a
 * retail value, with what they paid in total (frozen `total`, LAK). Otherwise null.
 */
export function whyBuyMine(reservations: RentalDoc[], products: Product[], rate: number | null): WhyBuy | null {
  if (rate == null) return null;
  const byId = new Map(products.map(p => [p.id, p]));
  const agg = new Map<string, { times: number; paid: number; last: number }>();
  for (const r of reservations) {
    if (r.status !== 'returned') continue;
    const p = byId.get(r.productId);
    if (!p?.retailPrice) continue;
    const a = agg.get(r.productId) ?? { times: 0, paid: 0, last: 0 };
    a.times += 1;
    a.paid += r.total ?? 0;
    a.last = Math.max(a.last, returnedMs(r));
    agg.set(r.productId, a);
  }
  const best = [...agg.entries()].sort((x, y) => y[1].times - x[1].times || y[1].last - x[1].last)[0];
  if (!best) return null;
  const product = byId.get(best[0])!;
  return { kind: 'mine', product, retailLak: toLak(product.retailPrice!, rate), times: best[1].times, paidLak: best[1].paid };
}

/** Catalogue example: the product with the highest retail value / daily price ratio. */
export function whyBuyCatalogue(products: Product[], rate: number | null): WhyBuy | null {
  if (rate == null) return null;
  let best: { p: Product; perDay: number; ratio: number } | null = null;
  for (const p of products) {
    const perDay = getMinPrice(p);
    if (!p.retailPrice || perDay == null || perDay <= 0) continue;
    const ratio = p.retailPrice / perDay;
    if (!best || ratio > best.ratio) best = { p, perDay, ratio };
  }
  if (!best) return null;
  return { kind: 'catalogue', product: best.p, retailLak: toLak(best.p.retailPrice!, rate), perDayLak: toLak(best.perDay, rate) };
}
