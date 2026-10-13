// Single source of truth for the late-return penalty — imported by BOTH the Cloud
// Functions (functions/src/index.ts) and the app (via `@/functions/src/shared/latePenalty`).
// It lives under functions/ because `firebase deploy` only uploads that folder, so the
// functions can't import app code, while the app can import from here. Keep this file
// dependency-free (no firebase/react imports) so it compiles in both toolchains.
//
// Rule (FAQ / Terms §9): the penalty is measured from the SCHEDULED return time and is
// not cumulative — ]grace;24h] = 1 day, ]24;48h] = 1.5 days, ]48;72h] = 2 days (upper
// bounds inclusive), capped at 2 days beyond 72h, where the rental is also treated as a
// non-return. Base = reservation.pricePerDay (booked tier rate, pre-coupon) × quantity,
// rounded UP to the nearest 1,000 LAK. Always a suggestion — staff confirm it at return.
//
// The grace period is INTERNAL ONLY (config/latePolicy, admin-readable only): never
// surface it, or a "0"/"free" amount, in any renter-facing text.

export const DEFAULT_LATE_GRACE_HOURS = 2;
export const NON_RETURN_AFTER_HOURS = 72;
export const PENALTY_ROUNDING_LAK = 1000;

export const LATE_TIERS: ReadonlyArray<{ maxHours: number; days: number }> = [
  { maxHours: 24, days: 1 },
  { maxHours: 48, days: 1.5 },
  { maxHours: 72, days: 2 },
];

export type LateStage = 'onTime' | 'grace' | 'tier1' | 'tier2' | 'tier3' | 'nonReturn';

export interface LatePenaltyResult {
  stage: LateStage;
  hoursLate: number;  // real elapsed hours since returnAt (nights included), 0 if on time
  days: number;       // 0 while on time / within grace
  amountLak: number;  // 0 while on time / within grace
}

/** Invalid or out-of-range values (must be within [0, 24[) fall back to the 2h default. */
export function sanitizeGraceHours(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 24
    ? value
    : DEFAULT_LATE_GRACE_HOURS;
}

export function roundUpLak(amount: number): number {
  return Math.ceil(amount / PENALTY_ROUNDING_LAK) * PENALTY_ROUNDING_LAK;
}

export function computeLatePenalty(input: {
  returnAtMs: number;
  nowMs: number;
  pricePerDay: number;
  quantity: number;
  graceHours: unknown;
}): LatePenaltyResult {
  const hoursLate = Math.max(0, (input.nowMs - input.returnAtMs) / 3_600_000);
  if (hoursLate <= 0) return { stage: 'onTime', hoursLate: 0, days: 0, amountLak: 0 };
  if (hoursLate <= sanitizeGraceHours(input.graceHours)) {
    return { stage: 'grace', hoursLate, days: 0, amountLak: 0 };
  }

  const tierIndex = LATE_TIERS.findIndex(t => hoursLate <= t.maxHours);
  const stage: LateStage = tierIndex === -1
    ? 'nonReturn'
    : (['tier1', 'tier2', 'tier3'] as const)[tierIndex];
  const days = tierIndex === -1 ? LATE_TIERS[LATE_TIERS.length - 1].days : LATE_TIERS[tierIndex].days;

  const pricePerDay = Number.isFinite(input.pricePerDay) && input.pricePerDay > 0 ? input.pricePerDay : 0;
  const quantity    = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;
  return { stage, hoursLate, days, amountLak: roundUpLak(pricePerDay * days * quantity) };
}

/** Penalty stage is past the grace period (i.e. an actual penalty is suggested). */
export function isPenaltyStage(stage: LateStage): boolean {
  return stage === 'tier1' || stage === 'tier2' || stage === 'tier3' || stage === 'nonReturn';
}

/** "1 day", "1.5 days", "2 days". */
export function formatPenaltyDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
