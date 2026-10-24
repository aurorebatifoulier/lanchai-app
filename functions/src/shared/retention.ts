// Retention of identity and residency documents — pure rules shared by the daily job
// and the renter-facing callables (functions/src/retention.ts) and the app (My ID shows
// the planned deletion date). Dependency-free (see latePenalty.ts).
//
//   Proof of residence (visa, permit, lease): deleted proofRetentionDays after the
//     decision (approval or rejection); a rejected request resubmitted in time stops the
//     clock (status back to pending). Replaced proof files and proofs of a withdrawn
//     request: deleted at the next run.
//   Identity document (passport, ID card, Lao ID card): kept while any rental is in
//     progress (pending, confirmed or active), then deleted idRetentionMonths after the
//     end of the last rental; never rented → proofRetentionDays after upload. Replaced or
//     declined identity files: proofRetentionDays after they were superseded.
//   NEVER delete anything while a blocker exists (active rental, unpaid balance,
//     non-return flag, unresolved no-show, open claim) — retried at the next run.

export interface RetentionConfig {
  proofRetentionDays: number;
  idRetentionMonths: number;
}

export const RETENTION_DEFAULTS: RetentionConfig = { proofRetentionDays: 30, idRetentionMonths: 6 };

/** config/residency → sane values (1–365 days, 1–60 months), defaults otherwise. */
export function sanitizeRetention(raw: Record<string, unknown> | null | undefined): RetentionConfig {
  const int = (v: unknown, min: number, max: number, dflt: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : dflt;
  return {
    proofRetentionDays: int(raw?.proofRetentionDays, 1, 365, RETENTION_DEFAULTS.proofRetentionDays),
    idRetentionMonths: int(raw?.idRetentionMonths, 1, 60, RETENTION_DEFAULTS.idRetentionMonths),
  };
}

export const DAY_MS = 86_400_000;

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/** Minimal reservation shape (Timestamps → ms by the caller). */
export interface RetentionReservation {
  status: string;
  returnedAtMs?: number | null;
  returnAtMs?: number | null;
  updatedAtMs?: number | null;
  outstandingBalance?: number | null;
  outstandingSettled?: boolean;
  outstandingWrittenOff?: boolean;
  hasNonReturn?: boolean;
  noShowHoldLifted?: boolean;
}

export type DeletionBlocker = 'active_rental' | 'outstanding_balance' | 'non_return' | 'no_show' | 'open_claim';

export function deletionBlockers(reservations: RetentionReservation[], claimStatuses: string[]): DeletionBlocker[] {
  const out = new Set<DeletionBlocker>();
  for (const r of reservations) {
    if (r.status === 'active') out.add('active_rental');
    if ((r.outstandingBalance ?? 0) > 0 && !r.outstandingSettled && !r.outstandingWrittenOff) out.add('outstanding_balance');
    if (r.hasNonReturn && (r.status === 'active' || r.status === 'lost')) out.add('non_return');
    if (r.status === 'no_show' && !r.noShowHoldLifted) out.add('no_show');
  }
  if (claimStatuses.some(s => s === 'open' || s === 'in_review')) out.add('open_claim');
  return [...out];
}

/** A rental still to be picked up or in progress — the ID must stay on file. */
export const rentalInProgress = (reservations: RetentionReservation[]) =>
  reservations.some(r => r.status === 'pending_payment' || r.status === 'confirmed' || r.status === 'active');

/** End of the renter's last finished rental (returned, or reported lost), or null. */
export function lastRentalEndMs(reservations: RetentionReservation[]): number | null {
  let last: number | null = null;
  for (const r of reservations) {
    const end = r.status === 'returned' ? (r.returnedAtMs ?? r.returnAtMs)
      : r.status === 'lost' ? (r.updatedAtMs ?? r.returnAtMs) : null;
    if (end != null && (last == null || end > last)) last = end;
  }
  return last;
}

/**
 * When the CURRENT identity document may be deleted (ms), or null while a rental is in
 * progress (kept). Blockers are checked separately, at deletion time.
 */
export function identityPurgeDueMs(input: {
  uploadedAtMs: number | null;
  reservations: RetentionReservation[];
  cfg: RetentionConfig;
}): number | null {
  if (rentalInProgress(input.reservations)) return null;
  const last = lastRentalEndMs(input.reservations);
  if (last != null) return addMonths(last, input.cfg.idRetentionMonths);
  return (input.uploadedAtMs ?? 0) + input.cfg.proofRetentionDays * DAY_MS;
}
