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

// ── Progress, perks and defaults for the loyalty UI (My Account card, tier-up modal,
// booking reminder, Loyalty screen). Pure — shared by the app and the functions.

/** Fallback points of a typical rental (new renters) — config/loyalty.typicalRentalPoints. */
export const DEFAULT_TYPICAL_RENTAL_POINTS = 20;
/** Points for both sides when a referred renter's first rental is returned. */
export const DEFAULT_REFERRAL_REWARD_POINTS = 50;

export function tierForPoints(points: number, thresholds: TierThresholds | null | undefined): LoyaltyTierKey {
  if (!thresholds) return 'bronze';
  if (points >= thresholds.platinum) return 'platinum';
  if (points >= thresholds.gold) return 'gold';
  if (points >= thresholds.silver) return 'silver';
  return 'bronze';
}

const tierFloor = (tier: LoyaltyTierKey, t: TierThresholds) =>
  tier === 'bronze' ? 0 : t[tier];

export interface TierProgress {
  current: LoyaltyTierKey;
  next: LoyaltyTierKey | null;
  /** Points to reach `next` (null at the top tier). */
  remaining: number | null;
  /** 0..1 of the way from the current tier's threshold to the next one (1 at the top). */
  fraction: number;
}

export function tierProgress(points: number, config: { thresholds?: TierThresholds } | null | undefined): TierProgress | null {
  const t = config?.thresholds;
  if (!t) return null;
  const current = tierForPoints(points, t);
  const next = TIER_ORDER[TIER_ORDER.indexOf(current) + 1] ?? null;
  if (!next) return { current, next: null, remaining: null, fraction: 1 };
  const floor = tierFloor(current, t);
  const ceiling = t[next as PaidTier];
  const span = Math.max(1, ceiling - floor);
  return { current, next, remaining: Math.max(0, ceiling - points), fraction: Math.min(1, Math.max(0, (points - floor) / span)) };
}

export interface PerksConfig extends LoyaltyChangeConfig {
  depositPercentByType?: { resident?: number; residentPlatinum?: number };
  /** Admin-editable perks line per tier (Loyalty settings) — overrides the default. */
  perksTextByTier?: Partial<Record<PaidTier, string>>;
}

/**
 * Default "what this tier unlocks", built ONLY from the real config: the tier coupon %,
 * plus a lower deposit for Platinum residents (only shown to residents, and only if
 * residentPlatinum < resident). Never mentions early access — that's per product.
 */
export function defaultTierPerks(tier: PaidTier, cfg: PerksConfig | null | undefined, isResident: boolean): string {
  const parts: string[] = [];
  const pct = cfg?.couponPercentByTier?.[tier];
  if (typeof pct === 'number' && pct > 0) parts.push(`a ${pct}% coupon`);
  const dep = cfg?.depositPercentByType;
  if (tier === 'platinum' && isResident && typeof dep?.residentPlatinum === 'number'
    && typeof dep?.resident === 'number' && dep.residentPlatinum < dep.resident) {
    parts.push('a lower deposit');
  }
  return parts.length ? `Unlocks ${parts.join(' and ')}` : `Unlocks ${TIER_LABELS[tier]} status`;
}

/** The perks line shown for a tier: the admin's text when set, else the default. */
export function tierPerksText(tier: PaidTier, cfg: PerksConfig | null | undefined, isResident: boolean): string {
  const custom = cfg?.perksTextByTier?.[tier]?.trim();
  return custom || defaultTierPerks(tier, cfg, isResident);
}
