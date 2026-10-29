import type { Timestamp } from 'firebase/firestore';
import type { RentalDoc } from '@/lib/firestore';

// Renter "documents" helpers (Documents / All rentals / receipt screens). Pure — the
// data comes from ONE equality query (getMyReservations: renterId ==), filtered,
// sorted and paginated here, so no composite index is ever needed.

/** Same condition as the receipt screen and the receipt email. */
export const hasReceipt = (r: RentalDoc) => r.status === 'returned' && !!r.returnFinalizedAt;
export const hasPickupReport = (r: RentalDoc) => !!r.handoverChecklist?.confirmedAt;
export const hasReturnReport = (r: RentalDoc) => !!r.returnChecklist?.confirmedAt;

/** Human-readable order number (LNC-…), or null for legacy rows — never a raw doc ID. */
export function displayOrderId(r: Pick<RentalDoc, 'id' | 'orderId'>): string | null {
  if (r.orderId?.startsWith('LNC-')) return r.orderId;
  return r.id.startsWith('LNC-') ? r.id.replace(/_\d+$/, '') : null;
}

/** Rentals with at least one document (receipt or condition report), newest first. */
export function rentalsWithDocuments(rentals: RentalDoc[]): RentalDoc[] {
  return rentals
    .filter(r => hasReceipt(r) || hasPickupReport(r) || hasReturnReport(r) || !!r.agreementId)
    .sort((a, b) => (b.pickupAt?.toMillis() ?? 0) - (a.pickupAt?.toMillis() ?? 0));
}

export type RentalPeriod = 'all' | 'month' | '3months' | 'year';

/** Period filter on the pick-up date (device local time). */
export function inPeriod(r: RentalDoc, period: RentalPeriod, now = new Date()): boolean {
  if (period === 'all') return true;
  const d = r.pickupAt?.toDate();
  if (!d) return false;
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  return d >= from;
}

const DAY = (d: Date) => d.getDate();
const MON = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });

/** "31 Aug 2026" */
export const fmtDay = (ts?: Timestamp | null) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** "30–31 Aug 2026", "28 Aug – 2 Sep 2026", "30 Dec 2026 – 2 Jan 2027". */
export function fmtRange(start?: Timestamp | null, end?: Timestamp | null): string {
  if (!start || !end) return fmtDay(start ?? end);
  const a = start.toDate();
  const b = end.toDate();
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDay(start)} – ${fmtDay(end)}`;
  if (a.getMonth() !== b.getMonth()) return `${DAY(a)} ${MON(a)} – ${DAY(b)} ${MON(b)} ${b.getFullYear()}`;
  return DAY(a) === DAY(b) ? fmtDay(end) : `${DAY(a)}–${DAY(b)} ${MON(b)} ${b.getFullYear()}`;
}
