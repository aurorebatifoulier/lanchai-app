import type { Product } from '@/lib/mockData';
import type { GridAvailability } from '@/utils/availability';
import { vteMonthKey } from '@/functions/src/shared/dates';
import { EXPLORE_COPY } from '@/constants/exploreCopy';

// The ONE honest signal line under a product card's price — first applicable, real data
// only, never invented urgency: not bookable today → back on / fully booked; the active
// "Free this weekend" window has 1 unit left → "Only 1 left this weekend"; ≥ 3 returns
// this month (rentalsByMonth) → "Rented n× this month"; a rating → "★ r · n rentals";
// rentals → "n rentals"; else nothing.
/** A rating shows on every product card (Home rails included) from this many reviews. */
export const MIN_REVIEWS_FOR_RATING = 3;

export type SignalTone = 'muted' | 'amber' | 'plain';
/** One piece of the line: an optional icon (star / repeat = amber, clock = grey) + text. */
/** text (bold when strong) + optional grey suffix (" rentals"); sep = a "·" separator. */
export interface SignalPart { icon?: 'clock' | 'star' | 'repeat'; text: string; strong?: boolean; suffix?: string; sep?: boolean }
export interface ProductSignal { tone: SignalTone; parts: SignalPart[] }

const fmtDay = (d: Date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}`;

export function productSignal(
  p: Product,
  { availability, weekendUnits, nowMs = Date.now(), compact = false }: {
    availability?: GridAvailability; weekendUnits?: number | null; nowMs?: number;
    /** Narrow cards (Home rails): ONE piece — back on / ★ rating / ↻ n rentals / nothing. */
    compact?: boolean;
  },
): ProductSignal | null {
  const c = EXPLORE_COPY.signal;
  if (availability) {
    if (availability.kind === 'backOn') return { tone: 'muted', parts: [{ icon: 'clock', text: c.backOn(fmtDay(availability.date)) }] };
    return { tone: 'muted', parts: [{ text: availability.kind === 'fullyBooked' ? c.fullyBooked : c.unavailable }] };
  }
  const rated = p.averageRating != null && p.averageRating > 0 && (p.reviewCount ?? 0) >= MIN_REVIEWS_FOR_RATING;
  const rentalsN = p.rentalCount ?? p.bookingsCount ?? 0;
  if (compact) {
    if (rated) return { tone: 'plain', parts: [{ icon: 'star', text: p.averageRating!.toFixed(1), strong: true }] };
    if (rentalsN > 0) return { tone: 'plain', parts: [{ icon: 'repeat', text: `${rentalsN}`, strong: true, suffix: c.rentalsWord(rentalsN) }] };
    return null;
  }
  if (weekendUnits === 1) return { tone: 'amber', parts: [{ text: c.lastOneWeekend }] };
  const month = p.rentalsByMonth?.[vteMonthKey(nowMs)] ?? 0;
  if (month >= 3) return { tone: 'amber', parts: [{ text: c.rentedThisMonth(month) }] };
  // Amber icon + bold number + grey word.
  const rentalParts: SignalPart[] = rentalsN > 0
    ? [{ icon: 'repeat', text: `${rentalsN}`, strong: true, suffix: c.rentalsWord(rentalsN) }]
    : [];
  if (rated) {
    return {
      tone: 'plain',
      parts: [{ icon: 'star', text: p.averageRating!.toFixed(1), strong: true }, ...(rentalParts.length ? [{ text: '', sep: true }, ...rentalParts] : [])],
    };
  }
  if (rentalParts.length) return { tone: 'plain', parts: rentalParts };
  return null;
}
