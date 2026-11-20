// Return charges — the ONE place the late fee + damage suggestion and the deposit split
// are computed from a return checklist. Pure, dependency-free (deployed with the
// functions; the app imports it as @/functions/src/shared/returnCharges).
// Used by: the staff return (submitReturn callable — the server decides every amount,
// staff can't change it) and the return checklist screen (live preview; owners may
// still lower / waive on screen as before). Same rounding as utils/currency.ts.
import { toLak } from './pricing';
import { computeLatePenalty } from './latePenalty';

export type ChecklistRating = 'good' | 'fair' | 'damaged' | 'unusable';
export type ChargeCurrency = 'LAK' | 'USD' | 'THB';

const RATING_ORDER: ChecklistRating[] = ['good', 'fair', 'damaged', 'unusable'];

/** The single most severe rating. */
export function worstOf(ratings: ChecklistRating[]): ChecklistRating {
  return ratings.reduce<ChecklistRating>(
    (worst, r) => (RATING_ORDER.indexOf(r) > RATING_ORDER.indexOf(worst) ? r : worst),
    'good',
  );
}

/** Damaged = the configured % (config/loyalty.damagedChargePercent), unusable = 100 %,
 *  good / fair = no charge. */
export function chargePercentFor(rating: ChecklistRating, damagedDefaultPercent: number): number | null {
  if (rating === 'good' || rating === 'fair') return null;
  if (rating === 'damaged') return damagedDefaultPercent;
  return 100;
}

/** LAK → USD / THB, rounded UP to a whole unit (utils/currency.ts lakToUsd / lakToThb). */
export const lakToUsdUp = (lak: number, rate: number) => Math.ceil(lak / rate);
export const lakToThbUp = (lak: number, rate: number) => Math.ceil(lak / rate);

/** An already-LAK amount in the deposit currency; null when a needed rate is missing. */
export function lakToCurrency(lak: number, cur: ChargeCurrency, usdRate: number | null, thbRate: number | null): number | null {
  if (cur === 'LAK') return lak;
  if (cur === 'USD') return usdRate == null ? null : lakToUsdUp(lak, usdRate);
  return thbRate == null ? null : lakToThbUp(lak, thbRate);
}

/** A USD amount (retail value, or a % of it) in the deposit currency; null when a rate is missing. */
export function usdToCurrency(usd: number, cur: ChargeCurrency, usdRate: number | null, thbRate: number | null): number | null {
  if (cur === 'USD') return Math.ceil(usd);
  if (usdRate == null) return null;
  const lak = toLak(usd, usdRate);
  if (cur === 'LAK') return lak;
  return thbRate == null ? null : lakToThbUp(lak, thbRate);
}

export type ReturnOutcome = 'clean' | 'late' | 'damage';

export interface ReturnChargesInput {
  ratings: ChecklistRating[];
  /** Units concerned by the damage (clamped to 1..quantity). */
  chargeUnits: number;
  quantity: number;
  retailPriceUsd: number | null;
  damagedChargePercent: number;
  depositCurrency: ChargeCurrency;
  /** Deposit actually held, in depositCurrency. */
  depositHeld: number;
  returnAtMs: number;
  nowMs: number;
  /** Booked tier rate per day, LAK (reservation.pricePerDay). */
  pricePerDayLak: number;
  graceHours: unknown;
  usdRate: number | null;
  thbRate: number | null;
}

export interface ReturnCharges {
  outcome: ReturnOutcome;
  worst: ChecklistRating;
  chargePercent: number | null;
  chargeUnits: number;
  /** Damage suggestion in depositCurrency (null = none, or a rate / retail value missing). */
  damageAmount: number | null;
  /** Late fee in depositCurrency (null = not late beyond the grace period). */
  lateAmount: number | null;
  lateAmountLak: number;
  /** Days charged (1, 1.5 or 2 — Terms §9) — "Late fee · 2 days". */
  lateDays: number;
  hoursLate: number;
  /** A charge is due but can't be computed (missing retail value / rate). */
  unresolved: boolean;
  total: number;
  depositApplied: number;
  outstanding: number;
  /** What goes back to the renter now (clean / late outcomes). */
  refund: number;
}

export function computeReturnCharges(i: ReturnChargesInput): ReturnCharges {
  const quantity = Math.max(1, Math.floor(i.quantity || 1));
  const chargeUnits = Math.min(Math.max(1, Math.floor(i.chargeUnits || 1)), quantity);
  const worst = worstOf(i.ratings);
  const chargePercent = chargePercentFor(worst, i.damagedChargePercent);
  const damageAmount = chargePercent != null && i.retailPriceUsd != null
    ? usdToCurrency(i.retailPriceUsd * chargePercent / 100 * chargeUnits, i.depositCurrency, i.usdRate, i.thbRate)
    : null;

  const late = computeLatePenalty({
    returnAtMs: i.returnAtMs, nowMs: i.nowMs, pricePerDay: i.pricePerDayLak, quantity, graceHours: i.graceHours,
  });
  const lateAmount = late.amountLak > 0 ? lakToCurrency(late.amountLak, i.depositCurrency, i.usdRate, i.thbRate) : null;

  const unresolved = (chargePercent != null && damageAmount == null) || (late.amountLak > 0 && lateAmount == null);
  const total = (damageAmount ?? 0) + (lateAmount ?? 0);
  const held = Math.max(0, i.depositHeld || 0);
  const depositApplied = Math.min(total, held);
  const outstanding = Math.max(0, total - held);
  const outcome: ReturnOutcome = chargePercent != null ? 'damage' : late.amountLak > 0 ? 'late' : 'clean';
  return {
    outcome, worst, chargePercent, chargeUnits, damageAmount, lateAmount,
    lateAmountLak: late.amountLak, lateDays: late.days, hoursLate: late.hoursLate, unresolved,
    total, depositApplied, outstanding, refund: Math.max(0, held - depositApplied),
  };
}

/** "Returned 5h late" / "Late return penalty" — the reason stored with the late fee. */
export function lateReasonText(hoursLate: number): string {
  const h = Math.floor(hoursLate);
  return h > 0 ? `Returned ${h}h late` : 'Late return penalty';
}

/** Checklist category ids — same list as CHECKLIST_CATEGORIES (lib/firestore.ts);
 *  tests/unit/returnCharges.test.ts fails while they differ. */
export const CHECKLIST_CATEGORY_IDS = [
  'mainItem', 'cleanliness', 'basicUsage', 'power', 'accessories', 'cables', 'protectiveCase', 'storageCase', 'other',
] as const;
export const CHECKLIST_RATINGS: ChecklistRating[] = ['good', 'fair', 'damaged', 'unusable'];

const CATEGORY_LABELS: Record<string, string> = {
  mainItem: 'Main item condition', cleanliness: 'Cleanliness', basicUsage: 'Basic usage',
  power: 'Power / activation', accessories: 'Accessories', cables: 'Cables / parts',
  protectiveCase: 'Protective case', storageCase: 'Storage case', other: 'Other components',
};
const RATING_TEXT: Record<ChecklistRating, string> = { good: 'Good', fair: 'Fair', damaged: 'Damaged', unusable: 'Unusable' };

/** "Main item condition — Damaged": the first category with the worst rating (same text
 *  as the return checklist screen). */
export function damageReasonText(categories: Record<string, { rating: ChecklistRating }>, worst: ChecklistRating): string {
  const id = CHECKLIST_CATEGORY_IDS.find(k => categories[k]?.rating === worst) ?? 'mainItem';
  return `${CATEGORY_LABELS[id]} — ${RATING_TEXT[worst]}`;
}

/**
 * The deposit RECEIVED at handover, in its currency — the ONLY base for a return
 * settlement. Frozen in `handoverChecklist.depositAmount` at handover; it is NEVER
 * re-converted from the LAK `deposit` at today's rate (that showed "128 USD" for a
 * deposit collected as 74 USD — LNC-261023-KW97). Legacy reservations without a frozen
 * amount fall back to a conversion of `deposit` (LAK).
 */
export function depositHeldOf(
  r: { deposit?: unknown; handoverChecklist?: { depositCurrency?: unknown; depositAmount?: unknown } | null },
  usdRate: number | null,
  thbRate: number | null,
): { currency: ChargeCurrency; amount: number; frozen: boolean } {
  const h = r.handoverChecklist ?? {};
  const currency: ChargeCurrency = h.depositCurrency === 'USD' || h.depositCurrency === 'THB' ? h.depositCurrency : 'LAK';
  if (typeof h.depositAmount === 'number' && h.depositAmount >= 0) return { currency, amount: h.depositAmount, frozen: true };
  const lak = typeof r.deposit === 'number' ? r.deposit : 0;
  return { currency, amount: lakToCurrency(lak, currency, usdRate, thbRate) ?? 0, frozen: false };
}

/** An amount in a deposit currency → LAK (display only: "≈ 989,000 LAK"). */
export function currencyToLak(amount: number, cur: ChargeCurrency, usdRate: number | null, thbRate: number | null): number | null {
  if (cur === 'LAK') return amount;
  const rate = cur === 'USD' ? usdRate : thbRate;
  return rate == null ? null : Math.round(amount * rate);
}
