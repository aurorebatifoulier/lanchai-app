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
