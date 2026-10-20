// Tier-gated product access decision (early access / exclusive) — single source for
// the app's badges/CTA (utils/productAccess.ts) and the createReservations callable.
// Dependency-free (see latePenalty.ts).
import { TIER_ORDER, type LoyaltyTierKey } from './loyalty';

export interface AccessDecision {
  mode: 'public' | 'earlyAccess' | 'exclusive';
  /** earlyAccess window already over → treated as public. */
  expired: boolean;
  minTier: LoyaltyTierKey;
  meetsTier: boolean;
  locked: boolean;
}

export function accessDecision(
  product: { accessMode?: string | null; minTierRequired?: string | null; earlyAccessUntilMs?: number | null },
  userTier: string | null | undefined,
  nowMs: number = Date.now(),
): AccessDecision {
  const mode = (product.accessMode ?? 'public') as AccessDecision['mode'];
  const minTier = (product.minTierRequired ?? 'bronze') as LoyaltyTierKey;
  const meetsTier = userTier != null
    && TIER_ORDER.indexOf(userTier as LoyaltyTierKey) >= TIER_ORDER.indexOf(minTier);
  if (mode === 'public') return { mode, expired: false, minTier, meetsTier, locked: false };
  const expired = mode === 'earlyAccess' && product.earlyAccessUntilMs != null && product.earlyAccessUntilMs <= nowMs;
  return { mode, expired, minTier, meetsTier, locked: !expired && !meetsTier };
}
