// Loyalty points earned per reservation — single source for applyLoyaltyPoints
// (functions/src/index.ts, which credits them when a reservation is returned) and the
// return-reminder email ("Return it and earn X points"). Based on the reservation's
// frozen pre-coupon `subtotal`. Business accounts are excluded from the program.
export const LAK_PER_LOYALTY_POINT = 10_000;

export function loyaltyPointsFor(subtotalLak: number | undefined | null): number {
  return Math.floor((subtotalLak ?? 0) / LAK_PER_LOYALTY_POINT);
}

/** Excluded from loyalty: business customers (and BtoB accounts, pending or approved). */
export function isLoyaltyExcluded(profile: { customerType?: unknown; accountType?: unknown }): boolean {
  return profile.customerType === 'business' || profile.accountType === 'btob';
}

export type LoyaltyTierKey = 'bronze' | 'silver' | 'gold' | 'platinum';
export const TIER_ORDER: LoyaltyTierKey[] = ['bronze', 'silver', 'gold', 'platinum'];
export const TIER_LABELS: Record<LoyaltyTierKey, string> = {
  bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum',
};

export interface TierThresholds { silver: number; gold: number; platinum: number }

/** Points needed to reach the next tier; null at the top tier or without config. */
export function pointsToNextTier(points: number, config: { thresholds: TierThresholds } | null): number | null {
  if (!config) return null;
  if (points < config.thresholds.silver)   return config.thresholds.silver - points;
  if (points < config.thresholds.gold)     return config.thresholds.gold - points;
  if (points < config.thresholds.platinum) return config.thresholds.platinum - points;
  return null;
}

export function nextTierName(points: number, config: { thresholds: TierThresholds } | null): LoyaltyTierKey | null {
  if (!config) return null;
  if (points < config.thresholds.silver)   return 'silver';
  if (points < config.thresholds.gold)     return 'gold';
  if (points < config.thresholds.platinum) return 'platinum';
  return null;
}
