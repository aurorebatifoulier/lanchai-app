import type { Product } from '@/lib/mockData';
import { vteMonthKey } from '@/functions/src/shared/dates';
import { EXPLORE_COPY } from '@/constants/exploreCopy';

// The ONE signal line under a product card's price — real data only, never invented
// urgency, and NEVER availability (no "Unavailable" / "Back on" / "Fully booked" on any
// card: availability lives on the product page and in the quick-add sheet; on cards the
// "+" colour is the only hint). Positive signals first: the active "Free this weekend"
// window has 1 unit left → "Only 1 left this weekend"; ≥ 3 returns this month →
// "Rented n× this month". Otherwise:
//  • grid cards (Explore, category, Liked…): "★ r · ↻ n rentals" — rating from
//    MIN_REVIEWS_GRID review(s), only the parts that exist;
//  • narrow Home rail cards (compact): ONE piece — "★ r" from MIN_REVIEWS_HOME_RAIL
//    reviews, else "↻ n rentals", else nothing.
export const MIN_REVIEWS_HOME_RAIL = 3;
export const MIN_REVIEWS_GRID = 1;

export type SignalTone = 'muted' | 'amber' | 'plain';
/** One piece of the line: an optional icon (star / repeat = amber, clock = grey) + text. */
/** text (bold when strong) + optional grey suffix (" rentals"); sep = a "·" separator. */
export interface SignalPart { icon?: 'clock' | 'star' | 'repeat'; text: string; strong?: boolean; suffix?: string; sep?: boolean }
export interface ProductSignal { tone: SignalTone; parts: SignalPart[] }

export function productSignal(
  p: Product,
  { weekendUnits, nowMs = Date.now(), compact = false }: {
    weekendUnits?: number | null; nowMs?: number;
    /** Narrow cards (Home rails): ONE piece — ★ rating / ↻ n rentals / nothing. */
    compact?: boolean;
  } = {},
): ProductSignal | null {
  const c = EXPLORE_COPY.signal;
  const rentalsN = p.rentalCount ?? p.bookingsCount ?? 0;
  const reviews = p.reviewCount ?? 0;
  const hasRating = p.averageRating != null && p.averageRating > 0;
  const rentalParts: SignalPart[] = rentalsN > 0
    ? [{ icon: 'repeat', text: `${rentalsN}`, strong: true, suffix: c.rentalsWord(rentalsN) }]
    : [];
  if (compact) {
    if (hasRating && reviews >= MIN_REVIEWS_HOME_RAIL) return { tone: 'plain', parts: [{ icon: 'star', text: p.averageRating!.toFixed(1), strong: true }] };
    if (rentalParts.length) return { tone: 'plain', parts: rentalParts };
    return null;
  }
  if (weekendUnits === 1) return { tone: 'amber', parts: [{ text: c.lastOneWeekend }] };
  const month = p.rentalsByMonth?.[vteMonthKey(nowMs)] ?? 0;
  if (month >= 3) return { tone: 'amber', parts: [{ text: c.rentedThisMonth(month) }] };
  if (hasRating && reviews >= MIN_REVIEWS_GRID) {
    return {
      tone: 'plain',
      parts: [{ icon: 'star', text: p.averageRating!.toFixed(1), strong: true }, ...(rentalParts.length ? [{ text: '', sep: true }, ...rentalParts] : [])],
    };
  }
  if (rentalParts.length) return { tone: 'plain', parts: rentalParts };
  return null;
}
