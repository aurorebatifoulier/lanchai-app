import type { ChecklistData, ChecklistRating } from '@/lib/firestore';
import { toLak, lakToThb } from './currency';

const RATING_ORDER: ChecklistRating[] = ['good', 'fair', 'damaged', 'unusable'];

// The single most severe category rating across all rated categories.
export function worstRating(categories: ChecklistData['categories']): ChecklistRating {
  return Object.values(categories).reduce<ChecklistRating>(
    (worst, c) => RATING_ORDER.indexOf(c.rating) > RATING_ORDER.indexOf(worst) ? c.rating : worst,
    'good',
  );
}

// Damaged uses the admin-configured default (staff can still override the resulting
// amount); Unusable is always a fixed 100%, not configurable. Good/Fair never charge.
export function chargePercentFor(rating: ChecklistRating, damagedDefaultPercent: number): number | null {
  if (rating === 'good' || rating === 'fair') return null;
  if (rating === 'damaged') return damagedDefaultPercent;
  return 100; // unusable
}

// Converts a USD amount (product.retailPrice, or a percentage of it) into the given
// target currency, composing through the same toLak/lakToThb helpers used everywhere
// else in the app — both already whole numbers. The USD case has no such helper to pass
// through, so it's rounded up here directly, matching the app's whole-unit convention
// (same Math.ceil rounding as lakToUsd/lakToThb in utils/currency.ts).
// Returns null only when a required rate isn't loaded yet.
export function convertUsdTo(
  usd: number,
  currency: 'LAK' | 'USD' | 'THB',
  exchangeRate: number | null,
  thbRate: number | null,
): number | null {
  if (currency === 'USD') return Math.ceil(usd);
  if (exchangeRate == null) return null;
  const lak = toLak(usd, exchangeRate);
  if (currency === 'LAK') return lak;
  return thbRate == null ? null : lakToThb(lak, thbRate);
}
