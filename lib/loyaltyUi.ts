import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './auth';
import { getMyReservations } from './firestore';
import {
  useLoyaltyConfig, tierProgress, isLoyaltyExcluded, loyaltyPointsFor,
  DEFAULT_TYPICAL_RENTAL_POINTS, DEFAULT_REVIEW_REWARD_POINTS,
  type LoyaltyConfig, type TierProgress, type LoyaltyTierKey,
} from './loyalty';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';

// Loyalty UI state for the signed-in renter — live users doc (points, tier, celebrated
// tier, customer/account type) + config. Used by the My Account card, the tier-up
// celebration, the booking reminder and the Loyalty screen. Points are only ever
// changed server-side; this is display only.

export interface MyLoyalty {
  loading: boolean;
  /** Excluded (business / BtoB) or signed out → hide every loyalty UI. */
  excluded: boolean;
  points: number;
  tier: LoyaltyTierKey;
  celebratedTier: LoyaltyTierKey | null;
  isResident: boolean;
  config: LoyaltyConfig | null;
  progress: TierProgress | null;
  coupons: { tier: string; percent: number; used: boolean }[];
}

export function useMyLoyalty(): MyLoyalty {
  const config = useLoyaltyConfig();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoaded(true); return; }
    return onSnapshot(doc(db, 'users', uid), s => { setUser(s.data() ?? {}); setLoaded(true); }, () => setLoaded(true));
  }, []);
  const points = typeof user?.loyaltyPoints === 'number' ? user.loyaltyPoints : 0;
  return {
    loading: !loaded,
    excluded: !auth.currentUser || !user || isLoyaltyExcluded(user),
    points,
    tier: ((user?.loyaltyTier as LoyaltyTierKey) ?? 'bronze'),
    celebratedTier: (user?.celebratedTier as LoyaltyTierKey) ?? null,
    isResident: user?.customerType === 'resident',
    config,
    progress: tierProgress(points, config),
    coupons: Array.isArray(user?.coupons) ? (user!.coupons as MyLoyalty['coupons']) : [],
  };
}

/** The renter's average points per returned rental (shared loyaltyPointsFor), or null. */
export function useAveragePointsPerRental(): number | null {
  const [avg, setAvg] = useState<number | null>(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getMyReservations(uid).then(rs => {
      const done = rs.filter(r => r.status === 'returned');
      if (!done.length) return;
      const total = done.reduce((s, r) => s + loyaltyPointsFor(r.subtotal), 0);
      setAvg(Math.max(1, Math.round(total / done.length)));
    }).catch(() => {});
  }, []);
  return avg;
}

/**
 * Card sub-line (LOYALTY_COPY): top tier, almost there (one review / one rental),
 * just started (< 10% of the way), otherwise "About {k} more rentals".
 */
export function loyaltyCardSubline(progress: TierProgress, avgPoints: number | null, config: LoyaltyConfig | null): string {
  if (!progress.next || progress.remaining == null) return LOYALTY_COPY.topTier;
  const n = progress.remaining;
  const review = config?.reviewRewardPoints ?? DEFAULT_REVIEW_REWARD_POINTS;
  const perRental = avgPoints ?? config?.typicalRentalPoints ?? DEFAULT_TYPICAL_RENTAL_POINTS;
  if (n <= review) return LOYALTY_COPY.almostReview(n);
  if (n <= perRental) return LOYALTY_COPY.almostRental;
  if (progress.fraction < 0.1) return LOYALTY_COPY.justStarted;
  return LOYALTY_COPY.middle(Math.max(1, Math.ceil(n / Math.max(1, perRental))));
}
