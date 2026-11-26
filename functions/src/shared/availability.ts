// Stock & occupancy rules — single source for the app (calendars, "Back on…" badges,
// quantity steppers) and the createReservations callable (server-side check inside the
// booking transaction). Dependency-free (see latePenalty.ts).

// Gap enforced after a reservation's return before the same unit can be handed to the
// next renter — absorbs late returns and gives staff time to clean/inspect. A unit is
// considered occupied from pickupAt until returnAt + this buffer.
export const HANDOFF_BUFFER_MS = 12 * 60 * 60 * 1000; // 12 hours

// Prep delay before a booking is ready for pickup: the "Ready within Xh" copy AND the
// same-day lead time (today's first slot = now + this delay).
export const PICKUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Reservation statuses that occupy stock. */
export const OCCUPYING_STATUSES = ['pending_payment', 'confirmed', 'active'];

export interface OccupancyRecord {
  pickupAt: number;  // millis
  returnAt: number;  // millis — NOT buffer-adjusted; the buffer is applied at compute time
  quantity: number;
  reservationId: string;
}

// Bookable stock: units in repair, lost or pending settlement are out before any date
// check. Never read product.stockLeft directly for availability.
export function effectiveStock(product: {
  stockLeft: number;
  inRepairUnits?: number;
  lostUnits?: number;
  pendingSettlementUnits?: number;
}): number {
  return Math.max(0, product.stockLeft
    - (product.inRepairUnits ?? 0)
    - (product.lostUnits ?? 0)
    - (product.pendingSettlementUnits ?? 0));
}

// Units still free over [start, end) given the occupancy (buffer included).
export function computeAvailableUnits(
  occupancy: OccupancyRecord[],
  startDate: Date,
  endDate: Date,
  totalStock: number,
): number {
  const newPickup = startDate.getTime();
  const newReturn = endDate.getTime();
  const reserved = occupancy.reduce((sum, rec) => {
    const occupiedFrom  = rec.pickupAt;
    const occupiedUntil = rec.returnAt + HANDOFF_BUFFER_MS;
    const overlaps = occupiedFrom < newReturn && occupiedUntil > newPickup;
    return overlaps ? sum + rec.quantity : sum;
  }, 0);
  return Math.max(0, totalStock - reserved);
}

// Same overlap predicate, returning the matching records.
export function getOverlappingOccupancy<T extends OccupancyRecord>(
  occupancy: T[],
  dayStart: Date,
  dayEnd: Date,
): T[] {
  const newPickup = dayStart.getTime();
  const newReturn = dayEnd.getTime();
  return occupancy.filter(rec => {
    const occupiedFrom  = rec.pickupAt;
    const occupiedUntil = rec.returnAt + HANDOFF_BUFFER_MS;
    return occupiedFrom < newReturn && occupiedUntil > newPickup;
  });
}

/**
 * Units PHYSICALLY in the shop right now — what a handover may give out:
 * stock − out with renters (active rentals, early handovers included) − in repair − lost
 * − pending settlement / cleaning. Distinct from effectiveStock(), which is the
 * date-based booking pool (rentals out are handled there by their booked dates).
 */
export function unitsOnHand(product: {
  stockLeft: number;
  inRepairUnits?: number;
  lostUnits?: number;
  pendingSettlementUnits?: number;
}, outWithRenters: number): number {
  return Math.max(0, effectiveStock(product) - Math.max(0, outWithRenters));
}

/** releaseSettledStock (functions/src/index.ts) runs every 15 minutes. */
export const STOCK_RELEASE_EVERY_MS = 15 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * End of the cleaning time after a return — measured from the ACTUAL return, NOT the
 * planned returnAt (that's HANDOFF_BUFFER_MS, the planning gap between bookings).
 * `cleaningUntilMs` is frozen by submitReturn (actual return + config/shop.cleaningHours);
 * older returns fall back to (returnedAt ?? planned returnAt) + the current setting.
 */
export function cleaningEndsMs(r: {
  cleaningUntilMs?: number | null; returnedAtMs?: number | null; returnAtMs: number; cleaningHours: number;
}): number {
  if (r.cleaningUntilMs != null) return r.cleaningUntilMs;
  return (r.returnedAtMs ?? r.returnAtMs) + r.cleaningHours * HOUR_MS;
}

/** releaseSettledStock: the deposit is settled AND the cleaning time is over. */
export function readyToRelease(r: { finalizedAtMs: number | null; cleaningEndsMs: number }, nowMs: number): boolean {
  return r.finalizedAtMs != null && nowMs >= r.cleaningEndsMs;
}

/**
 * Latest time a returned unit is back in stock: once the deposit is settled AND its
 * cleaning time is over, at the next releaseSettledStock run (≤ 15 min). null while
 * the deposit isn't settled.
 */
export function cleaningBackByMs(r: { cleaningEndsMs: number; finalizedAtMs: number | null }): number | null {
  if (r.finalizedAtMs == null) return null;
  return Math.max(r.finalizedAtMs, r.cleaningEndsMs) + STOCK_RELEASE_EVERY_MS;
}

/**
 * Earlier-time handover on the SAME pick-up day (an earlier DAY is refused — it changes
 * the booking): the line's pickupAt moves to now, so the extra hours [now, planned
 * pick-up) must be free. `items` = the order's lines of ONE product being handed over;
 * `others` = that product's other occupying bookings. Same rule as createReservations
 * (computeAvailableUnits on the booking pool, buffer included). Returns, per line that
 * doesn't fit, the overlapping bookings (earliest first).
 */
export function earlyHandoverConflicts<T extends OccupancyRecord>(input: {
  items: OccupancyRecord[]; others: T[]; totalStock: number; nowMs: number;
}): { reservationId: string; conflicts: T[] }[] {
  const moved = input.items.map(i => ({ ...i, pickupAt: Math.min(i.pickupAt, input.nowMs) }));
  const out: { reservationId: string; conflicts: T[] }[] = [];
  for (const item of input.items) {
    if (input.nowMs >= item.pickupAt) continue; // not early: nothing extra to block
    const occ = [...input.others, ...moved.filter(m => m.reservationId !== item.reservationId)];
    const from = new Date(input.nowMs), to = new Date(item.pickupAt);
    if (computeAvailableUnits(occ, from, to, input.totalStock) >= item.quantity) continue;
    const conflicts = getOverlappingOccupancy(input.others, from, to).sort((a, b) => a.pickupAt - b.pickupAt);
    out.push({ reservationId: item.reservationId, conflicts });
  }
  return out;
}
