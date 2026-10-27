import { toLak } from '@/functions/src/shared/pricing';
// USD → LAK (nearest 1,000 LAK) — defined in functions/src/shared/pricing.ts so the
// createReservations callable uses the exact same rounding.
export { toLak };

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

// splitHtVat lives in functions/src/shared/receiptData.ts (shared with the receipt
// email) — re-exported here so app imports stay unchanged.
export { splitHtVat } from '@/functions/src/shared/receiptData';

/** Compact kip format for product cards and price chips, e.g. "₭120,000". */
// Prices are always shown as "126,000 LAK" (never the ₭ sign).
export function formatKip(value: number): string {
  return `${value.toLocaleString('en-US')} LAK`;
}

/** Price filter range: "0 – 100,000 LAK". */
export function formatLakRange(min: number, max: number): string {
  return `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')} LAK`;
}
