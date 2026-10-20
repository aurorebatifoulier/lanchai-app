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

// ── Points change → tier + one-time tier coupons (single source) ─────────────────
// Used by every server-side credit (applyLoyaltyPoints for rentals, applyReviewReward
// for reviews) so tier upgrades and tier coupons never diverge between sources.

/** Points credited for a review, whatever the rating (config/loyalty.reviewRewardPoints). */
export const DEFAULT_REVIEW_REWARD_POINTS = 10;

export type PaidTier = 'silver' | 'gold' | 'platinum';

export interface LoyaltyChangeConfig {
  thresholds?: TierThresholds;
  couponPercentByTier?: Record<PaidTier, number>;
}

/**
 * Pure: new balance, new tier, and the tiers newly crossed by this change (each one
 * earns its one-time coupon at `couponPercentByTier[tier]`). Without thresholds, the
 * tier stays bronze and no coupon is issued — same as before the extraction.
 */
export function applyLoyaltyPointsChange(
  oldPoints: number,
  amount: number,
  cfg: LoyaltyChangeConfig | null | undefined,
): { newPoints: number; newTier: LoyaltyTierKey; crossed: { tier: PaidTier; percent: number }[] } {
  const newPoints = oldPoints + amount;
  const order: { tier: PaidTier; threshold: number }[] = cfg?.thresholds
    ? [
        { tier: 'silver',   threshold: cfg.thresholds.silver },
        { tier: 'gold',     threshold: cfg.thresholds.gold },
        { tier: 'platinum', threshold: cfg.thresholds.platinum },
      ]
    : [];
  const crossed = order
    .filter(t => oldPoints < t.threshold && newPoints >= t.threshold)
    .map(t => ({ tier: t.tier, percent: cfg?.couponPercentByTier?.[t.tier] ?? 0 }));
  const newTier: LoyaltyTierKey = [...order].reverse().find(t => newPoints >= t.threshold)?.tier ?? 'bronze';
  return { newPoints, newTier, crossed };
}
