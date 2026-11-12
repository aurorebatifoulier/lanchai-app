import { idCheckNeeded } from '../functions/src/shared/identity';
import { isPickupMissed } from '../functions/src/shared/dates';

// Admin "Today" panel — pure counting (tests/unit/adminToday.test.ts). Same rules as the
// calendar day screen (app/admin/calendar/[date].tsx) and lateReturnAlerts:
// - pick-ups today: pickupAt in the day, pending_payment / confirmed, not missed;
// - returns today: active, returnAt in the day;
// - late returns: active, returnAt already passed;
// - to check: users whose ID needs the first-pick-up check (Verifications → Identity
//   "Check pending") + open / in-review claims.
// Each source may be null (its query failed) → only the counters using it are null.

export interface TodayLine { status: string; pickupAtMs?: number | null; returnAtMs?: number | null }
type N = number | null;
export interface TodayCounts { pickups: N; returns: N; late: N; idChecks: N; claims: N; toCheck: N }

export function countToday(input: {
  dayStartMs: number;
  dayEndMs: number;
  nowMs: number;
  /** Reservations whose pickupAt falls in the day (any status). */
  pickupDay: TodayLine[] | null;
  /** Every `active` reservation. */
  active: TodayLine[] | null;
  /** users with idOnFile == true. */
  idUsers: { idOnFile?: unknown; idDocVersion?: unknown; idCheckedVersion?: unknown }[] | null;
  openClaims: number | null;
}): TodayCounts {
  const { dayStartMs, dayEndMs, nowMs } = input;
  const inDay = (ms?: number | null) => ms != null && ms >= dayStartMs && ms < dayEndMs;
  const pickups = input.pickupDay?.filter(r =>
    (r.status === 'pending_payment' || r.status === 'confirmed')
    && inDay(r.pickupAtMs)
    && !isPickupMissed(r.pickupAtMs ?? 0, nowMs)).length ?? null;
  const active = input.active?.filter(r => r.status === 'active') ?? null;
  const returns = active ? active.filter(r => inDay(r.returnAtMs)).length : null;
  const late = active ? active.filter(r => r.returnAtMs != null && r.returnAtMs < nowMs).length : null;
  const idChecks = input.idUsers?.filter(u => idCheckNeeded(u)).length ?? null;
  const claims = input.openClaims;
  const toCheck = idChecks == null && claims == null ? null : (idChecks ?? 0) + (claims ?? 0);
  return { pickups, returns, late, idChecks, claims, toCheck };
}
