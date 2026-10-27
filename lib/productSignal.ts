import type { Product } from '@/lib/mockData';
import type { GridAvailability } from '@/utils/availability';
import { vteMonthKey } from '@/functions/src/shared/dates';
import { EXPLORE_COPY } from '@/constants/exploreCopy';

// The ONE honest signal line under a product card's price — first applicable, real data
// only, never invented urgency: not bookable today → back on / fully booked; the active
// "Free this weekend" window has 1 unit left → "Only 1 left this weekend"; ≥ 3 returns
// this month (rentalsByMonth) → "Rented n× this month"; a rating → "★ r · n rentals";
// rentals → "n rentals"; else nothing.
export type SignalTone = 'muted' | 'amber' | 'plain';
export interface ProductSignal { text: string; tone: SignalTone; icon?: 'clock' }

const fmtDay = (d: Date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}`;

export function productSignal(
  p: Product,
  { availability, weekendUnits, nowMs = Date.now() }: { availability?: GridAvailability; weekendUnits?: number | null; nowMs?: number },
): ProductSignal | null {
  const c = EXPLORE_COPY.signal;
  if (availability) {
    if (availability.kind === 'backOn') return { text: c.backOn(fmtDay(availability.date)), tone: 'muted', icon: 'clock' };
    if (availability.kind === 'fullyBooked') return { text: c.fullyBooked, tone: 'muted' };
    return { text: c.unavailable, tone: 'muted' };
  }
  if (weekendUnits === 1) return { text: c.lastOneWeekend, tone: 'amber' };
  const month = p.rentalsByMonth?.[vteMonthKey(nowMs)] ?? 0;
  if (month >= 3) return { text: c.rentedThisMonth(month), tone: 'amber' };
  const rentals = p.rentalCount ?? p.bookingsCount ?? 0;
  if (p.averageRating != null && p.averageRating > 0 && (p.reviewCount ?? 0) > 0) {
    return { text: c.rated(p.averageRating.toFixed(1), rentals), tone: 'plain' };
  }
  if (rentals > 0) return { text: c.rentals(rentals), tone: 'plain' };
  return null;
}
