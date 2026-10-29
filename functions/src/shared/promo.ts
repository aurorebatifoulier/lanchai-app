// Promo codes — the ONE rule, shared by the validatePromoCode callable, createReservations
// (re-validated inside the transaction) and the app (admin status chips, labels).
// Separate from the loyalty coupons; ONE discount per booking (coupon OR promo).
// Dependency-free (see latePenalty.ts). Discount always computed server-side.

import { vteIsoDay } from './dates';

export type PromoType = 'percent' | 'fixed';

export interface PromoCode {
  code: string;
  description?: string;
  type: PromoType;
  /** percent: 1–100 · fixed: LAK. */
  value: number;
  minRentalLak?: number | null;
  /** Whole Vientiane days, "YYYY-MM-DD", inclusive. */
  validFrom?: string | null;
  validTo?: string | null;
  maxUses?: number | null;
  maxUsesPerRenter?: number | null;
  firstRentalOnly?: boolean;
  scope?: { categoryIds?: string[]; productIds?: string[] } | null;
  businessAllowed?: boolean;
  active: boolean;
  usedCount?: number;
  discountGivenLak?: number;
}

export const PROMO_CODE_RE = /^[A-Z0-9]{4,20}$/;
export const normalizePromoCode = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().toUpperCase().replace(/\s+/g, '') : '';

/** Attempts allowed per account and sliding hour (validatePromoCode — no code listing). */
export const PROMO_ATTEMPTS_PER_HOUR = 10;

/** Reservation statuses that make a renter "not new" for first-rental-only codes. */
export const NOT_FIRST_RENTAL_STATUSES = ['pending_payment', 'confirmed', 'active', 'returned', 'lost', 'no_show'];

export type PromoStatus = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';

export function promoStatus(p: PromoCode, nowMs: number): PromoStatus {
  if (!p.active) return 'inactive';
  const today = vteIsoDay(nowMs);
  if (p.validTo && today > p.validTo) return 'expired';
  if (p.maxUses != null && (p.usedCount ?? 0) >= p.maxUses) return 'exhausted';
  if (p.validFrom && today < p.validFrom) return 'scheduled';
  return 'active';
}

export type PromoError =
  | 'not-found' | 'inactive' | 'not-started' | 'expired' | 'exhausted' | 'already-used'
  | 'first-rental-only' | 'business-not-allowed' | 'not-in-scope' | 'min-amount' | 'too-many-attempts';

export interface PromoLine { subtotal: number; productId: string; categoryId: string | null }

export interface PromoContext {
  lines: PromoLine[];
  nowMs: number;
  isBusiness: boolean;
  /** The renter has a booking that isn't cancelled (NOT_FIRST_RENTAL_STATUSES). */
  hasPriorBooking: boolean;
  usesByRenter: number;
}

export type PromoResult =
  | { ok: true; total: number; perLine: number[] }
  | { ok: false; error: PromoError; minLak?: number };

/** In scope: no scope = every line; else the line's product OR category is listed. */
export function lineInScope(p: PromoCode, l: PromoLine): boolean {
  const cats = p.scope?.categoryIds ?? [];
  const prods = p.scope?.productIds ?? [];
  if (cats.length === 0 && prods.length === 0) return true;
  return prods.includes(l.productId) || (!!l.categoryId && cats.includes(l.categoryId));
}

/** Spreads `total` over the in-scope lines by subtotal (remainder on the last one). */
export function spreadDiscount(subtotals: number[], inScope: boolean[], total: number): number[] {
  const base = subtotals.reduce((s, v, i) => s + (inScope[i] ? v : 0), 0);
  const out = subtotals.map(() => 0);
  if (total <= 0 || base <= 0) return out;
  let last = -1;
  subtotals.forEach((v, i) => {
    if (!inScope[i]) return;
    out[i] = Math.round((total * v) / base);
    last = i;
  });
  out[last] += total - out.reduce((s, v) => s + v, 0);
  return out;
}

export function evaluatePromo(p: PromoCode, ctx: PromoContext): PromoResult {
  const status = promoStatus(p, ctx.nowMs);
  if (status === 'inactive') return { ok: false, error: 'inactive' };
  if (status === 'expired') return { ok: false, error: 'expired' };
  if (status === 'scheduled') return { ok: false, error: 'not-started' };
  if (status === 'exhausted') return { ok: false, error: 'exhausted' };
  if (ctx.isBusiness && !p.businessAllowed) return { ok: false, error: 'business-not-allowed' };
  if (p.firstRentalOnly && ctx.hasPriorBooking) return { ok: false, error: 'first-rental-only' };
  if (ctx.usesByRenter >= Math.max(1, p.maxUsesPerRenter ?? 1)) return { ok: false, error: 'already-used' };

  const inScope = ctx.lines.map(l => lineInScope(p, l));
  const base = ctx.lines.reduce((s, l, i) => s + (inScope[i] ? l.subtotal : 0), 0);
  if (base <= 0) return { ok: false, error: 'not-in-scope' };
  if (p.minRentalLak && base < p.minRentalLak) return { ok: false, error: 'min-amount', minLak: p.minRentalLak };

  const raw = p.type === 'percent'
    ? Math.round((base * Math.min(100, Math.max(0, p.value))) / 100)
    : Math.min(Math.max(0, Math.round(p.value)), base);
  // Never a free booking (createReservations requires total > 0 on every line).
  const total = Math.min(raw, base - 1000 * ctx.lines.filter((_, i) => inScope[i]).length);
  if (total <= 0) return { ok: false, error: 'not-in-scope' };
  return { ok: true, total, perLine: spreadDiscount(ctx.lines.map(l => l.subtotal), inScope, total) };
}

/** Renter-facing messages (app + callable errors). */
export const PROMO_ERROR_TEXT: Record<PromoError, string> = {
  'not-found': 'This code doesn’t exist.',
  inactive: 'This code isn’t active.',
  'not-started': 'This code isn’t valid yet.',
  expired: 'This code has expired.',
  exhausted: 'This code has reached its limit.',
  'already-used': 'Already used.',
  'first-rental-only': 'This code is for a first rental only.',
  'business-not-allowed': 'This code isn’t valid for business accounts.',
  'not-in-scope': 'Not valid for these items.',
  'min-amount': 'The minimum rental isn’t reached.',
  'too-many-attempts': 'Too many tries — please wait a little and try again.',
};

export const promoErrorText = (e: PromoError, minLak?: number) =>
  e === 'min-amount' && minLak ? `Minimum ${minLak.toLocaleString('en-US')} LAK` : PROMO_ERROR_TEXT[e];

/** "Promo SUMMER10" — receipts, emails, rental detail, agreement. */
export const promoLabel = (code: string) => `Promo ${code}`;

/** The ONE description of a booking line's discount — loyalty coupon or promo code —
 *  for receipts (screen / PDF / email), emails, rental + admin detail, agreement. */
export interface DiscountInput {
  couponApplied?: { percent: number; discountAmount: number } | null;
  promoApplied?: { code: string; discountAmount: number } | null;
}
export function discountOf(r: DiscountInput): { label: string; amount: number } | null {
  if (r.promoApplied && r.promoApplied.discountAmount > 0) return { label: promoLabel(r.promoApplied.code), amount: r.promoApplied.discountAmount };
  if (r.couponApplied && r.couponApplied.discountAmount > 0) return { label: `Loyalty coupon (${r.couponApplied.percent}%)`, amount: r.couponApplied.discountAmount };
  return null;
}
/** Several lines of one order: summed, labelled from the first discounted line. */
export function orderDiscountOf(lines: DiscountInput[]): { label: string; amount: number } | null {
  const parts = lines.map(discountOf).filter((d): d is { label: string; amount: number } => !!d);
  return parts.length ? { label: parts[0].label, amount: parts.reduce((s, d) => s + d.amount, 0) } : null;
}
