import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Gap enforced after a reservation's return before the same unit can be handed to the
// next renter — absorbs late returns and gives staff time to clean/inspect. A unit is
// considered occupied from pickupAt until returnAt + this buffer, not just until
// returnAt, so same-day handoff is never allowed.
export const HANDOFF_BUFFER_MS = 12 * 60 * 60 * 1000; // 12 hours

// Fixed prep delay before a confirmed booking is actually ready for pickup — staff
// need this window to pull/check the item. Display-only: not consumed by
// computeAvailableUnits or any function in this file, just surfaced as informational
// copy on the product screen and the booking confirmation screen. Lives here (not a
// separate file) so it sits next to the other booking-timing buffer above.
export const PICKUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

// Reservations in these statuses occupy a unit for overlap purposes. 'lost' is
// deliberately excluded — a reservation reported lost/stolen is a terminal state
// (the rental itself is over); the resulting permanent stock loss is now tracked via
// the product's own lostUnits count (see effectiveStock below), not a date-range
// conflict against this specific reservation.
// 'returned' and 'cancelled' no longer occupy anything.
// Exported so callers needing the exact same set against a different collection (e.g.
// the admin per-product view querying `reservations` directly instead of the
// PII-free `reservationOccupancy` mirror) never redefine a second, divergent list.
export const OCCUPYING_STATUSES = ['pending_payment', 'confirmed', 'active'];

export interface OccupancyRecord {
  pickupAt: number;  // millis
  returnAt: number;  // millis — NOT buffer-adjusted; the buffer is applied at compute time
  quantity: number;
  reservationId: string; // the reservationOccupancy doc ID, which IS the reservation ID
}

// Single required source of truth for how much of a product's stock is actually
// bookable — always use this instead of reading product.stockLeft directly for any
// availability computation or "X available" copy. Units currently in repair or
// permanently lost are counted out of the total *before* any date-range check runs,
// so a partially-out-of-service multi-unit product is never over-offered.
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

// Fetches every non-terminal reservation-occupancy record for a product — a single,
// date-unfiltered query (Firestore can't express the pickupAt/returnAt overlap as a
// server-side filter alongside the status filter — see computeAvailableUnits). Reused by
// both a single-range check (getAvailableStock) and a whole-month per-day scan
// (the DateRangeCalendar component), so displaying a month of availability costs exactly
// one query, not one per day, and flipping between months costs zero additional queries.
//
// Queries reservationOccupancy, NOT reservations — the latter holds renter PII (name,
// pricing, notes) and is locked to owner-or-admin reads, which a renter checking a
// product's availability against every OTHER renter's bookings can never satisfy.
// reservationOccupancy is a PII-free mirror (functions/src/index.ts's
// syncReservationOccupancy), readable by any authenticated user, containing only
// non-terminal (pending_payment/confirmed/active) reservations — terminal ones are
// deleted from it rather than kept with a stale status, so the `status` filter below is
// defense-in-depth, not the primary correctness mechanism.
//
// Throws on Firestore error — caller must handle. No silent fallback to "fully
// available": a broken/failing query silently reporting full availability is exactly
// the over-booking bug this module was rewritten to fix.
export async function fetchOccupancy(productId: string): Promise<OccupancyRecord[]> {
  const q = query(
    collection(db, 'reservationOccupancy'),
    where('productId', '==', productId),
    where('status', 'in', OCCUPYING_STATUSES),
  );
  const snap = await getDocs(q);

  const records: OccupancyRecord[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const pickupAt: Timestamp | undefined = data.pickupAt;
    const returnAt: Timestamp | undefined = data.returnAt;
    if (!pickupAt || !returnAt) continue;
    records.push({
      pickupAt: pickupAt.toMillis(),
      returnAt: returnAt.toMillis(),
      quantity: data.quantity ?? 0,
      reservationId: d.id,
    });
  }
  return records;
}

// Pure — no Firestore access. Same overlap predicate as computeAvailableUnits (buffer
// included), but returns the matching records instead of a count — so "this day shows
// booked" and "here's who's booked it" can never disagree, since both are derived from
// the same check.
// Generic over T so a caller can pass richer records (e.g. OccupancyRecord plus a
// renterName attached for display) and get that same richer type back, instead of
// losing extra fields to the base OccupancyRecord shape.
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

// Pure — no Firestore access. Firestore forbids inequality filters on more than one
// field per query, so the pickupAt/returnAt overlap can't be expressed server-side
// alongside the status filter either way — this is that comparison, done client-side
// against an already-fetched occupancy set so it can be reused for many date ranges
// (or many single days, for month-view greying) without re-querying.
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

// Thin wrapper — fetch + compute for a single range. Unchanged signature/behavior from
// before this refactor; existing callers (booking/new.tsx's quantity stepper, bag.tsx's
// per-item conflict check) are unaffected.
export async function getAvailableStock(
  productId: string,
  startDate: Date,
  endDate: Date,
  totalStock: number,
): Promise<number> {
  const occupancy = await fetchOccupancy(productId);
  return computeAvailableUnits(occupancy, startDate, endDate, totalStock);
}

// Exported so callers (DateRangeCalendar) can build the same key format when looking up
// a specific day in the map this returns — never reformat/derive it a second way.
export function localDateKey(year: number, month: number, date: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

// Pure — no Firestore access. One entry per real calendar day in the given month, keyed
// by a LOCAL date string (not toISOString(), which shifts by the device's UTC offset and
// risks bucketing a reservation into the wrong day). Each day is tested as its own full
// [startOfDay, endOfDay) window built from local year/month/date — matching how the
// calendar grid itself constructs day cells.
//
// Testing the FULL day, not finer time slots, is a deliberate, safe heuristic: widening
// the tested window can only ever make the overlap condition easier to satisfy (never
// harder), so computeAvailableUnits for a full day is always <= its result for any
// narrower sub-window nested inside that day. "0 for the full day" therefore guarantees
// every possible time slot that day is also 0 — safe to grey out, never a false
// negative. It does NOT guarantee the reverse (a day showing >0 doesn't prove every
// specific pickup+return combination within it is free) — that's fine, since the exact-
// timestamp check still runs at booking-confirmation time via getAvailableStock. This is
// a coarse, conservative UI aid, not a replacement for that authoritative check.
export function computeMonthAvailability(
  occupancy: OccupancyRecord[],
  year: number,
  month: number,
  totalStock: number,
): Record<string, number> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: Record<string, number> = {};

  for (let date = 1; date <= daysInMonth; date++) {
    const dayStart = new Date(year, month, date, 0, 0, 0, 0);
    const dayEnd   = new Date(year, month, date + 1, 0, 0, 0, 0);
    result[localDateKey(year, month, date)] = computeAvailableUnits(occupancy, dayStart, dayEnd, totalStock);
  }

  return result;
}

// Convenience one-shot wrapper (fetch + computeMonthAvailability) for a single month
// lookup. DateRangeCalendar itself calls fetchOccupancy once and computeMonthAvailability
// per month-navigation directly, to avoid re-fetching on every prev/next tap — use this
// wrapper only for a one-off month check that doesn't need that caching.
export async function getMonthAvailability(
  productId: string,
  year: number,
  month: number,
  totalStock: number,
): Promise<Record<string, number>> {
  const occupancy = await fetchOccupancy(productId);
  return computeMonthAvailability(occupancy, year, month, totalStock);
}
