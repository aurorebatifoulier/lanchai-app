import { Product } from '@/lib/mockData';

export function calculateTotalPrice(
  pricePerDay: number,
  startDate: Date,
  endDate: Date,
  quantity: number
): number {
  const days = calculateDays(startDate, endDate);
  return pricePerDay * days * quantity;
}

export function calculateDays(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
}

// ── Tier pricing (matches booking/new.tsx billing logic) ──────────────────────
// Currency-agnostic — these functions just select the right raw product field for a
// given duration. Product fields are USD; callers convert to LAK via utils/currency.ts
// before displaying or writing a reservation.

export function getRateForDays(product: Product, days: number): number {
  if (days >= 30) return product.price30plus;
  if (days >= 14) return product.price14to29;
  if (days >= 7)  return product.price7to13;
  if (days >= 3)  return product.price3to6;
  return product.pricePerDay;
}

// Tier specs ordered highest-to-lowest. Used by getEffectiveRate.
const TIER_SPECS: { minDays: number; price: (p: Product) => number }[] = [
  { minDays: 30, price: p => p.price30plus  },
  { minDays: 14, price: p => p.price14to29  },
  { minDays: 7,  price: p => p.price7to13   },
  { minDays: 3,  price: p => p.price3to6    },
  { minDays: 1,  price: p => p.pricePerDay  },
];

// Returns the effective daily rate for a given duration, clamping down to the
// nearest lower tier when the matched tier has no price. Returns null if NO tier
// has any price (product genuinely unpriced).
export function getEffectiveRate(product: Product, days: number): number | null {
  const matchIdx = TIER_SPECS.findIndex(t => days >= t.minDays);
  if (matchIdx === -1) return null;
  for (let i = matchIdx; i < TIER_SPECS.length; i++) {
    const p = TIER_SPECS[i].price(product);
    if (p > 0) return p;
  }
  return null;
}

// Returns the lowest non-zero price across all tiers, or null if no pricing is set.
export function getMinPrice(product: Product): number | null {
  const prices = [
    product.pricePerDay,
    product.price3to6,
    product.price7to13,
    product.price14to29,
    product.price30plus,
  ].filter(p => p > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

// 24h-block billing: same formula as booking/new.tsx
export function billableDaysFromDates(pickupAt: Date, returnAt: Date): number {
  return Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / (1000 * 60 * 60 * 24)));
}

// Formats a Date as "Mon, 7 Jul · 09:00" — matches the pickupLabel/returnLabel format used in reservations.
const _DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function fmtReservationLabel(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${_DOW[d.getDay()]}, ${d.getDate()} ${_MON[d.getMonth()]} · ${h}:${m}`;
}
