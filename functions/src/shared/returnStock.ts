// Stock moves when a reservation comes back — the ONE rule for the return checklist
// (single + chained), the "Mark as returned" fallback, "Report lost/stolen" and the
// releaseSettledStock job. Dependency-free (see latePenalty.ts).
//
// `chargeUnits` = how many of the reservation's units the damage / unusable / lost
// charge is about (staff choose it, 1..quantity). Absent on older reservations → the
// whole quantity (the previous behaviour).

export interface ReturnStockInput {
  quantity: number;
  chargeSeverity?: 'damaged' | 'unusable' | 'lostStolen' | null;
  chargeUnits?: number | null;
}

/** Units the charge is about, clamped to 1..quantity; the whole quantity when unset. */
export function chargeUnitsOf(r: ReturnStockInput): number {
  const q = Math.max(0, r.quantity || 0);
  const n = r.chargeUnits;
  if (typeof n !== 'number' || !Number.isFinite(n)) return q;
  return Math.min(q, Math.max(1, Math.floor(n)));
}

/**
 * At return: unusable units go straight to lostUnits (a write-off), every other unit
 * waits in pendingSettlementUnits until the deposit is settled.
 */
export function returnStockMoves(r: ReturnStockInput): { lostUnits: number; pendingUnits: number } {
  const q = Math.max(0, r.quantity || 0);
  const lostUnits = r.chargeSeverity === 'unusable' ? chargeUnitsOf(r) : 0;
  return { lostUnits, pendingUnits: q - lostUnits };
}

/**
 * At release (releaseSettledStock): the units that were pending settlement go back to
 * stock, except the damaged ones when staff chose "repair" — those go to inRepairUnits.
 */
export function releaseStockMoves(
  r: ReturnStockInput & { stockReleaseHandling?: 'release' | 'repair' | null },
): { pendingUnits: number; repairUnits: number; releasedUnits: number } {
  const { pendingUnits } = returnStockMoves(r);
  const repairUnits = r.stockReleaseHandling === 'repair' && r.chargeSeverity === 'damaged'
    ? Math.min(pendingUnits, chargeUnitsOf(r))
    : 0;
  return { pendingUnits, repairUnits, releasedUnits: pendingUnits - repairUnits };
}
