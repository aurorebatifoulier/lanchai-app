// Exchange-rate sanity check (Shop settings → Money): a new USD / THB rate that differs
// by more than RATE_CHANGE_WARN_PCT from the current one needs an explicit confirmation —
// a wrong rate under- or over-collects every deposit taken in that currency (a deposit
// of 2,941,200 LAK was collected as 74 USD at ~39,700 LAK/USD). Pure — unit tested.
export const RATE_CHANGE_WARN_PCT = 10;

/** Signed % change from `current` to `next` (null when there is no current rate). */
export function rateChangePct(current: number | null | undefined, next: number): number | null {
  if (current == null || !(current > 0) || !(next > 0)) return null;
  return ((next - current) / current) * 100;
}

/** True when saving `next` must be confirmed first. */
export function needsRateConfirm(current: number | null | undefined, next: number): boolean {
  const pct = rateChangePct(current, next);
  return pct != null && Math.abs(pct) > RATE_CHANGE_WARN_PCT;
}
