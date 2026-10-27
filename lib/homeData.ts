import type { Product } from '@/lib/mockData';
import type { RentalDoc, LoyaltyTier } from '@/lib/firestore';
import { computeAvailableUnits, effectiveStock, type OccupancyRecord } from '@/utils/availability';
import { getProductAccessState } from '@/utils/productAccess';
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

// ── Free this weekend ────────────────────────────────────────────────────────

export interface WeekendWindow {
  /** Pick-up = first open slot that day; return = Sunday at the same time (2-day-style
   *  24h blocks, like useLinkedReturnTime). Device-local dates, like the booking flow. */
  pickupAt: Date;
  returnAt: Date;
  slot: string;
}

const atSlot = (day: Date, slot: string) => {
  const d = new Date(day);
  const [h, m] = slot.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

/**
 * Mon–Thu → the coming Fri–Sun; Fri–Sat → today to Sunday; Sunday → next Fri–Sun. If no
 * pick-up slot is left today, start the next day; if that would be Sunday, next weekend.
 * `availableSlots(day)` = getAvailableTimeSlots(day, shop slots) (2h lead time today).
 */
export function weekendWindow(now: Date, availableSlots: (day: Date) => string[]): WeekendWindow | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  let offset = dow >= 1 && dow <= 4 ? 5 - dow : dow === 0 ? 5 : 0;
  for (let guard = 0; guard < 10; guard++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    if (day.getDay() === 0) { offset += 5; continue; } // never start on a Sunday
    const slot = availableSlots(day)[0];
    if (!slot) { offset += 1; continue; }
    const sunday = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (7 - day.getDay()) % 7);
    return { pickupAt: atSlot(day, slot), returnAt: atSlot(sunday, slot), slot };
  }
  return null;
}

/** Products a renter could book for the whole window (same rule as the booking check). */
export function freeThisWeekend(
  products: Product[],
  occupancy: Map<string, OccupancyRecord[]>,
  win: WeekendWindow,
  userTier: LoyaltyTier | null,
  { candidates = 12, max = 8 }: { candidates?: number; max?: number } = {},
): Product[] {
  return bookableByPopularity(products, userTier)
    .slice(0, candidates)
    .filter(p => computeAvailableUnits(occupancy.get(p.id) ?? [], win.pickupAt, win.returnAt, effectiveStock(p)) >= 1)
    .slice(0, max);
}

// ── Under {X} LAK a day ──────────────────────────────────────────────────────

/** Products whose 1-day price (pricePerDay → LAK) is ≤ the threshold, most popular first. */
export function budgetPicks(products: Product[], thresholdLak: number, rate: number | null, userTier: LoyaltyTier | null): Product[] {
  if (rate == null) return [];
  return bookableByPopularity(products, userTier)
    .filter(p => p.pricePerDay > 0 && toLak(p.pricePerDay, rate) <= thresholdLak);
}

/** Bookable for this renter (visible list already), most rented first. */
export function bookableByPopularity(products: Product[], userTier: LoyaltyTier | null): Product[] {
  return products
    .filter(p => p.available !== false && effectiveStock(p) > 0 && getMinPrice(p) != null)
    .filter(p => !getProductAccessState(p, userTier).locked)
    .sort((a, b) => (b.rentalCount ?? b.bookingsCount ?? 0) - (a.rentalCount ?? a.bookingsCount ?? 0));
}
