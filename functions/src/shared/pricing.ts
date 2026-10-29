// Rental pricing — single source for the app's previews (booking screens, bag,
// checkout) AND the createReservations callable, which recomputes every frozen
// reservation figure server-side. Dependency-free (see latePenalty.ts).
//
// Product prices are USD (tiered by duration); every reservation figure is LAK.

export interface PricedProduct {
  pricePerDay: number;
  price3to6: number;
  price7to13: number;
  price14to29: number;
  price30plus: number;
  deposit: number;       // USD, before the customer-type percentage
}

export function getRateForDays(product: PricedProduct, days: number): number {
  if (days >= 30) return product.price30plus;
  if (days >= 14) return product.price14to29;
  if (days >= 7)  return product.price7to13;
  if (days >= 3)  return product.price3to6;
  return product.pricePerDay;
}

// Tier specs ordered highest-to-lowest. Used by getEffectiveRate.
const TIER_SPECS: { minDays: number; price: (p: PricedProduct) => number }[] = [
  { minDays: 30, price: p => p.price30plus  },
  { minDays: 14, price: p => p.price14to29  },
  { minDays: 7,  price: p => p.price7to13   },
  { minDays: 3,  price: p => p.price3to6    },
  { minDays: 1,  price: p => p.pricePerDay  },
];

// Effective daily rate (USD) for a duration, clamping down to the nearest lower tier
// when the matched tier has no price. null if NO tier has a price (unpriced product).
export function getEffectiveRate(product: PricedProduct, days: number): number | null {
  const matchIdx = TIER_SPECS.findIndex(t => days >= t.minDays);
  if (matchIdx === -1) return null;
  for (let i = matchIdx; i < TIER_SPECS.length; i++) {
    const p = TIER_SPECS[i].price(product);
    if (p > 0) return p;
  }
  return null;
}

/** Lowest non-zero price across all tiers, or null if no pricing is set. */
export function getMinPrice(product: PricedProduct): number | null {
  const prices = [
    product.pricePerDay, product.price3to6, product.price7to13, product.price14to29, product.price30plus,
  ].filter(p => p > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** 24h-block billing: Fri 10:00 → Sat 10:00 = exactly 1 day; at least 1. */
export function billableDaysFromMs(pickupAtMs: number, returnAtMs: number): number {
  return Math.max(1, Math.ceil((returnAtMs - pickupAtMs) / (1000 * 60 * 60 * 24)));
}

/** USD → LAK at the admin exchange rate, rounded to the nearest 1,000 LAK. */
export function toLak(usdAmount: number, exchangeRate: number): number {
  return Math.round((usdAmount * exchangeRate) / 1000) * 1000;
}

export interface DepositPercentConfig {
  depositPercentByType?: { business: number; resident: number; residentPlatinum: number; tourist: number };
}

/**
 * % of the product's standard deposit to charge, by customer type (and platinum tier
 * for residents). 100 when config is missing — the safe default.
 */
export function depositPercentFor(
  customerType: string | undefined | null,
  loyaltyTier: string | undefined | null,
  config: DepositPercentConfig | null | undefined,
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

/**
 * Deposit of one reservation line (LAK) — PER UNIT: the unit deposit (product deposit
 * USD → LAK × the customer-type %) is rounded first, then × quantity, so "n × unit"
 * always matches the line total. The ONE formula for the booking screens, the bag, the
 * bag checkout and createReservations.
 */
export function depositForLine(
  productDepositUsd: number,
  exchangeRate: number,
  depositPercent: number,
  quantity: number,
): { depositPerUnit: number; deposit: number } {
  const depositPerUnit = Math.round(toLak(productDepositUsd || 0, exchangeRate) * depositPercent / 100);
  return { depositPerUnit, deposit: depositPerUnit * Math.max(1, quantity) };
}

/** One reservation line's frozen figures (all LAK). null = unpriced product. */
export function priceLine(input: {
  product: PricedProduct;
  pickupAtMs: number;
  returnAtMs: number;
  quantity: number;
  exchangeRate: number;
  depositPercent: number;
}): { durationDays: number; pricePerDay: number; subtotal: number; deposit: number; depositPerUnit: number } | null {
  const durationDays = billableDaysFromMs(input.pickupAtMs, input.returnAtMs);
  const rateUsd = getEffectiveRate(input.product, durationDays);
  if (rateUsd === null) return null;
  const pricePerDay = toLak(rateUsd, input.exchangeRate);
  return {
    durationDays,
    pricePerDay,
    subtotal: pricePerDay * durationDays * input.quantity,
    ...depositForLine(input.product.deposit, input.exchangeRate, input.depositPercent, input.quantity),
  };
}

/** Loyalty coupon % — ALWAYS from config by the coupon's tier, never from user data. */
export function couponPercentFor(
  tier: string | undefined | null,
  config: { couponPercentByTier?: Record<string, number> } | null | undefined,
): number {
  const p = tier ? config?.couponPercentByTier?.[tier] : undefined;
  return typeof p === 'number' && p > 0 && p <= 100 ? p : 0;
}

/** Order-level discount, prorated over lines by subtotal (remainder on the last line). */
export function orderDiscount(subtotals: number[], percent: number): { total: number; perLine: number[] } {
  const totalSubtotal = subtotals.reduce((s, v) => s + v, 0);
  const total = percent > 0 ? Math.round((totalSubtotal * percent) / 100) : 0;
  if (total <= 0 || totalSubtotal <= 0) return { total: 0, perLine: subtotals.map(() => 0) };
  const perLine = subtotals.map(v => Math.round((total * v) / totalSubtotal));
  const allocated = perLine.reduce((s, v) => s + v, 0);
  perLine[perLine.length - 1] += total - allocated;
  return { total, perLine };
}
