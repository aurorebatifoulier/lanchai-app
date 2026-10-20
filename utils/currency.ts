// Converts a USD product-price amount to LAK using the live admin-set exchange rate.
// Rounds to the nearest 1000 LAK for a clean, readable display figure.
export function toLak(usdAmount: number, exchangeRate: number): number {
  return Math.round((usdAmount * exchangeRate) / 1000) * 1000;
}

// exchangeRate === null means "not configured yet / still loading" — never compute a
// bogus figure in that case, just show a placeholder.
export function formatLak(usdAmount: number, exchangeRate: number | null): string {
  if (exchangeRate == null) return '—';
  return `${toLak(usdAmount, exchangeRate).toLocaleString('en-US')} LAK`;
}

// Formats an already-LAK amount (no conversion) as "12,345 LAK" — for note lines
// (deposit reminders, the VAT-included note). Distinct from formatLak above, which
// converts a USD amount first; use this one whenever the figure is already in LAK.
export function formatLakAmount(amountLak: number): string {
  return `${amountLak.toLocaleString('en-US')} LAK`;
}

// Inverse of toLak — converts an already-LAK amount (e.g. a frozen reservation deposit)
// to USD/THB for display. Rounds UP to the nearest whole unit, no decimals — deliberately
// different from toLak/toUsd's precision elsewhere in the app.
export function lakToUsd(lakAmount: number, exchangeRate: number): number {
  return Math.ceil(lakAmount / exchangeRate);
}

export function lakToThb(lakAmount: number, thbRate: number): number {
  return Math.ceil(lakAmount / thbRate);
}

// Converts an already-LAK amount (e.g. the late-return penalty, always stored in LAK)
// into any of the app's three supported currencies, reusing the same conversion
// functions used everywhere else. Returns null only when a required rate isn't loaded.
export function convertLakTo(
  lak: number,
  currency: 'LAK' | 'USD' | 'THB',
  exchangeRate: number | null,
  thbRate: number | null,
): number | null {
  if (currency === 'LAK') return lak;
  if (currency === 'USD') return exchangeRate == null ? null : lakToUsd(lak, exchangeRate);
  return thbRate == null ? null : lakToThb(lak, thbRate);
}

// Splits an already-LAK amount (the same figure stored/charged today) into its
// HT/VAT/TTC components for display — purely a render-time breakdown, never used to
// compute what's actually charged. `ttc` always equals the input `amountLak` unchanged;
// `ht` is rounded to the nearest whole LAK, `vat` is whatever's left so ht + vat === ttc
// exactly (no rounding drift between the two lines).
export function splitHtVat(amountLak: number, vatPercent: number): { ht: number; vat: number; ttc: number } {
  const ht = Math.round(amountLak / (1 + vatPercent / 100));
  return { ht, vat: amountLak - ht, ttc: amountLak };
}

/** Compact kip format for product cards and price chips, e.g. "₭120,000". */
export function formatKip(value: number): string {
  return `₭${value.toLocaleString('en-US')}`;
}
