import type { RentalDoc } from '@/lib/firestore';
import { vteEndOfDayMs } from '@/functions/src/shared/dates';
import { deriveReceiptData, deriveSettlementOutcome } from '@/utils/receiptData';
import { RENTALS_COPY as c } from '@/constants/rentalsCopy';

// "My rentals" tab — pure picks (no React, no Firestore): which tab a reservation sits
// in, one card per order, Vientiane-day countdowns, the late count and the price line.

export type RentalsTab = 'upcoming' | 'active' | 'past';
export type PastFilter = 'returned' | 'cancelled' | 'all';

const DAY_MS = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Booked, not picked up yet (still "to pay at pick-up"). */
export const isPrePickup = (r: RentalDoc) => r.status === 'pending_payment' || r.status === 'confirmed';

/** Missed pick-ups stay in Upcoming this long after the pick-up time, then go to Past. */
export const MISSED_VISIBLE_MS = 48 * 60 * 60 * 1000;

/**
 * Booked, never handed over, pick-up time more than 48h ago — shown in Past (Cancelled)
 * as "Pick-up missed · nothing charged". Renter-side DISPLAY only: the status is
 * untouched (staff still mark no-shows through the admin flow).
 */
export function isStaleMissed(r: RentalDoc, nowMs: number = Date.now()): boolean {
  return isPrePickup(r) && r.pickupAt.toMillis() + MISSED_VISIBLE_MS <= nowMs;
}

/** Cancelled / no-show / stale missed pick-up — nothing charged. */
export const isCancelledLike = (r: RentalDoc) => r.status === 'cancelled' || r.status === 'no_show' || isStaleMissed(r);

export function tabOf(r: RentalDoc, nowMs: number = Date.now()): RentalsTab {
  if (isPrePickup(r)) return isStaleMissed(r, nowMs) ? 'past' : 'upcoming';
  if (r.status === 'active') return 'active';
  return 'past'; // returned, lost, cancelled, no_show
}

/** Whole Vientiane calendar days from today to `ms` (0 = today, 1 = tomorrow, < 0 = past). */
export function daysUntil(ms: number, nowMs: number = Date.now()): number {
  return Math.round((vteEndOfDayMs(ms) - vteEndOfDayMs(nowMs)) / DAY_MS);
}

/** Started days since the scheduled return (≥ 1 once late). */
export function daysLate(returnAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(1, Math.ceil((nowMs - returnAtMs) / DAY_MS));
}

const vteParts = (ms: number) => {
  const d = new Date(ms + 7 * 3600_000);
  return { day: d.getUTCDate(), mon: d.getUTCMonth(), year: d.getUTCFullYear() };
};

/** "27 – 28 Jun" / "30 Jun – 2 Jul" (Vientiane days). */
export function shortRange(fromMs: number, toMs: number): string {
  const a = vteParts(fromMs);
  const b = vteParts(toMs);
  return a.mon === b.mon && a.year === b.year
    ? `${a.day} – ${b.day} ${MON[b.mon]}`
    : `${a.day} ${MON[a.mon]} – ${b.day} ${MON[b.mon]}`;
}

export const lak = (n: number) => `${Math.round(n).toLocaleString('en-US')} LAK`;

/** One card = one order (or one reservation without an order) within the same tab. */
export interface RentalEntry {
  key: string;
  items: RentalDoc[];   // ≥ 1, sorted by pick-up
  orderId: string | null;
}

/** Past cards split an order by outcome, so the Returned / Cancelled chips stay exact. */
const pastClass = (r: RentalDoc) => (isCancelledLike(r) ? 'x' : 'r');

export function groupEntries(rentals: RentalDoc[], tab: RentalsTab): RentalEntry[] {
  const map = new Map<string, RentalDoc[]>();
  for (const r of rentals) {
    const base = r.orderId ?? r.id;
    const key = tab === 'past' ? `${base}:${pastClass(r)}` : base;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  const entries: RentalEntry[] = [...map.entries()].map(([key, items]) => ({
    key,
    items: [...items].sort((a, b) => a.pickupAt.toMillis() - b.pickupAt.toMillis()),
    orderId: items[0].orderId ?? null,
  }));
  const first = (e: RentalEntry, f: (r: RentalDoc) => number) => Math.min(...e.items.map(f));
  if (tab === 'upcoming') entries.sort((a, b) => first(a, r => r.pickupAt.toMillis()) - first(b, r => r.pickupAt.toMillis()));
  else if (tab === 'active') entries.sort((a, b) => first(a, r => r.returnAt.toMillis()) - first(b, r => r.returnAt.toMillis()));
  else entries.sort((a, b) => first(b, r => r.returnAt.toMillis()) - first(a, r => r.returnAt.toMillis()));
  return entries;
}

export function matchesPastFilter(e: RentalEntry, f: PastFilter): boolean {
  if (f === 'all') return true;
  const cancelled = isCancelledLike(e.items[0]);
  return f === 'cancelled' ? cancelled : !cancelled;
}

/** The carbon "Next pick-up" card: the order with the nearest FUTURE pick-up. */
export function heroEntry(entries: RentalEntry[], nowMs: number = Date.now()): RentalEntry | null {
  let best: { e: RentalEntry; ms: number } | null = null;
  for (const e of entries) {
    if (isPickupPassed(e, nowMs)) continue;
    const ms = Math.min(...e.items.map(r => r.pickupAt.toMillis()));
    if (!best || ms < best.ms) best = { e, ms };
  }
  return best?.e ?? null;
}

/**
 * Booked, but the (earliest) pick-up TIME is already past with no hand-over — never the
 * "Next pick-up" card; shown as "Pick-up missed?" at the top of Upcoming. An alert only:
 * staff still hand it over normally, or mark it as a no-show.
 */
export function isPickupPassed(e: RentalEntry, nowMs: number = Date.now()): boolean {
  return Math.min(...e.items.map(r => r.pickupAt.toMillis())) <= nowMs;
}

export interface ProductLook { images: string[]; category: string | null }

/**
 * Photos to try for each line: the product's CURRENT photos first (a reservation's frozen
 * `productImage` may point to a replaced / deleted file — that's what left grey squares),
 * then the frozen one; plus the category (badge when none loads). Deleted products keep
 * only the frozen photo, then the neutral badge.
 */
export function withProductImages(rentals: RentalDoc[], lookOf: Map<string, ProductLook>): RentalDoc[] {
  return rentals.map(r => {
    const look = lookOf.get(r.productId);
    const candidates = [...new Set([...(look?.images ?? []), r.productImage].filter((u): u is string => typeof u === 'string' && u.length > 0))];
    return { ...r, productImageCandidates: candidates, productCategory: look?.category ?? undefined };
  });
}

// ── Lines ────────────────────────────────────────────────────────────────────

export const orderTotal = (items: RentalDoc[]) => items.reduce((s, r) => s + (r.total ?? 0), 0);

/** Distinct pick-up (or return) moments in an order. */
export const distinctCount = (items: RentalDoc[], f: (r: RentalDoc) => number) => new Set(items.map(f)).size;

/** Upcoming money line: never "Paid" before the hand-over. */
export function upcomingMoneyLine(items: RentalDoc[]): string {
  return c.toPayAtPickup(lak(orderTotal(items)));
}

/** Past money / outcome line for a reservation group (same figures as the receipt). */
export function pastMoneyLine(items: RentalDoc[]): string {
  const first = items[0];
  if (isCancelledLike(first)) return c.nothingCharged;
  const paid = c.paid(lak(orderTotal(items)));
  if (first.status === 'lost') return paid;
  if (!items.every(r => r.returnFinalizedAt)) return `${paid} · ${c.depositChecking}`;
  let due = false;
  const charges = new Map<string, number>();
  for (const r of items) {
    const data = deriveReceiptData(r, null);
    const outcome = deriveSettlementOutcome(r, data);
    if (outcome.kind === 'clientOwes' && outcome.resolution === 'unsettled') due = true;
    if (data.chargesTotal > 0) charges.set(data.depositCurrency, (charges.get(data.depositCurrency) ?? 0) + data.chargesTotal);
  }
  if (due) return `${paid} · ${c.balanceDue}`;
  if (charges.size > 0) {
    const text = [...charges.entries()].map(([cur, n]) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`).join(' + ');
    return `${paid} · ${c.charged(text)}`;
  }
  return `${paid} · ${c.depositRefunded}`;
}

/** Past status word (grey). */
export function pastStatus(r: RentalDoc): string {
  if (r.status === 'cancelled') return c.cancelled;
  if (r.status === 'no_show' || isStaleMissed(r)) return c.missedPickup;
  if (r.status === 'lost') return c.notReturned;
  return c.returned;
}
