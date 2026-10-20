import { useState, useEffect } from 'react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { getUserProfile, type LoyaltyTier } from './firestore';
import { useAuth } from '@/contexts/AuthContext';

// Tier names and next-tier math live in functions/src/shared/loyalty.ts (shared with
// the receipt email) — re-exported here so app imports stay unchanged.
export {
  TIER_ORDER, TIER_LABELS, pointsToNextTier, nextTierName, isLoyaltyExcluded, DEFAULT_REVIEW_REWARD_POINTS,
} from '@/functions/src/shared/loyalty';

export interface LoyaltyConfig {
  thresholds: { silver: number; gold: number; platinum: number };
  couponPercentByTier: { silver: number; gold: number; platinum: number };
  depositPercentByType: {
    business: number;         // e.g. 0 — no deposit, regardless of loyalty tier
    resident: number;         // e.g. 70 — standard
    residentPlatinum: number; // e.g. 60 — resident + platinum loyalty tier
    tourist: number;          // e.g. 100 — always, no loyalty modifier
  };
  damagedChargePercent?: number; // default % of replacement value charged for "Damaged" severity — admin-adjustable; "Unusable" is always a fixed 100%, not configurable
  reviewRewardPoints?: number;   // points per review (any rating), credited server-side by applyReviewReward — default DEFAULT_REVIEW_REWARD_POINTS
  updatedAt?: Timestamp;
}

// Returns null when config/loyalty doesn't exist yet — i.e. the loyalty program hasn't
// been set up from the admin Loyalty screen.
export async function getLoyaltyConfig(): Promise<LoyaltyConfig | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'loyalty'));
    if (!snap.exists()) return null;
    return snap.data() as LoyaltyConfig;
  } catch {
    return null;
  }
}

export function useLoyaltyConfig(): LoyaltyConfig | null {
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  useEffect(() => {
    getLoyaltyConfig().then(setConfig);
  }, []);
  return config;
}

// Current user's loyalty tier, fetched once per mount — undefined while loading, null
// for a guest/no-profile/no-tier-yet user (treated as below every real tier for
// Loyalty Phase 2 access gating).
export function useLoyaltyTier(): LoyaltyTier | null | undefined {
  const { user } = useAuth();
  const [tier, setTier] = useState<LoyaltyTier | null | undefined>(undefined);
  useEffect(() => {
    if (!user) { setTier(null); return; }
    getUserProfile(user.uid)
      .then(p => setTier(p?.loyaltyTier ?? null))
      .catch(() => setTier(null));
  }, [user]);
  return tier;
}

// Percent of the standard deposit to charge, based on customer type and (for residents)
// platinum loyalty tier. Falls back to 100 (full deposit) when config or the field is
// missing — safe default, consistent with how missing customerType already defaults to
// 'tourist' elsewhere (utils/customerType.ts's getCustomerTypeConfig).
export function depositPercentFor(
  customerType: string | undefined,
  loyaltyTier: LoyaltyTier | undefined,
  config: LoyaltyConfig | null,
): number {
  if (!config?.depositPercentByType) return 100;
  if (customerType === 'business') return config.depositPercentByType.business;
  if (customerType === 'resident') {
    return loyaltyTier === 'platinum'
      ? config.depositPercentByType.residentPlatinum
      : config.depositPercentByType.resident;
  }
  return config.depositPercentByType.tourist; // tourist, or unset/unknown — same fallback
}
