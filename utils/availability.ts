import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Stock/occupancy constants and pure rules live in functions/src/shared/availability.ts
// — shared with the createReservations callable (server-side check in the booking
// transaction). Re-exported here so app imports stay unchanged.
import {
  HANDOFF_BUFFER_MS, PICKUP_DELAY_MS, OCCUPYING_STATUSES, effectiveStock,
  computeAvailableUnits, getOverlappingOccupancy, type OccupancyRecord,
} from '@/functions/src/shared/availability';
export {
  HANDOFF_BUFFER_MS, PICKUP_DELAY_MS, OCCUPYING_STATUSES, effectiveStock,
  computeAvailableUnits, getOverlappingOccupancy, type OccupancyRecord,
};

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

// ── Grid cards: one query for the whole catalogue ────────────────────────────

// Every non-terminal occupancy record for ALL products, grouped by productId — ONE
// equality-only query (no composite index needed) for a whole product grid, instead of
// one fetchOccupancy() per card. reservationOccupancy holds no personal data (productId,
// pickupAt, returnAt, quantity, status only) and is readable by any signed-in user, and
// terminal reservations are deleted from it, so the result stays small.
// Throws on Firestore error — callers should then show no booking badge at all
// (never a false "Back on").
export async function fetchAllOccupancy(): Promise<Map<string, OccupancyRecord[]>> {
  const snap = await getDocs(query(
    collection(db, 'reservationOccupancy'),
    where('status', 'in', OCCUPYING_STATUSES),
  ));
  const byProduct = new Map<string, OccupancyRecord[]>();
  for (const d of snap.docs) {
    const data = d.data();
    const pickupAt: Timestamp | undefined = data.pickupAt;
    const returnAt: Timestamp | undefined = data.returnAt;
    const productId: string | undefined = data.productId;
    if (!pickupAt || !returnAt || !productId) continue;
    const list = byProduct.get(productId) ?? [];
    list.push({
      pickupAt: pickupAt.toMillis(),
      returnAt: returnAt.toMillis(),
      quantity: data.quantity ?? 0,
      reservationId: d.id,
    });
    byProduct.set(productId, list);
  }
  return byProduct;
}

export const NEXT_FREE_DAY_SEARCH_DAYS = 90;

// Pure. null = at least one unit is free today. Otherwise the first later day with at
// least one free unit, or 'none' if nothing frees up within the search window. Each day
// is tested as a FULL local day — the same conservative rule computeMonthAvailability
// uses to grey out calendar days (buffer + occupying statuses via computeAvailableUnits).
export function nextAvailableDay(
  occupancy: OccupancyRecord[],
  totalStock: number,
  now: Date = new Date(),
): Date | 'none' | null {
  for (let d = 0; d <= NEXT_FREE_DAY_SEARCH_DAYS; d++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d + 1);
    if (computeAvailableUnits(occupancy, dayStart, dayEnd, totalStock) > 0) {
      return d === 0 ? null : dayStart;
    }
  }
  return 'none';
}

export type GridAvailability =
  | { kind: 'unavailable' }
  | { kind: 'backOn'; date: Date }
  | { kind: 'fullyBooked' }
  | null; // bookable today — no badge

// What a grid card should flag. `occupancy` is this product's records from
// fetchAllOccupancy(), or undefined if that fetch failed/hasn't loaded (→ only the
// stock check applies, never a booking badge).
export function gridAvailability(
  product: { available?: boolean; stockLeft: number; inRepairUnits?: number; lostUnits?: number; pendingSettlementUnits?: number },
  occupancy: OccupancyRecord[] | undefined,
): GridAvailability {
  const stock = effectiveStock(product);
  if (product.available === false || stock <= 0) return { kind: 'unavailable' };
  if (!occupancy) return null;
  const next = nextAvailableDay(occupancy, stock);
  if (next === null) return null;
  return next === 'none' ? { kind: 'fullyBooked' } : { kind: 'backOn', date: next };
}
