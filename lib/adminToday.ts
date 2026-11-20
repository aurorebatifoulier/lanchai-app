import { collection, getDocs, query, where, Timestamp, type QuerySnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { countToday, type TodayCounts, type TodayLine } from './adminTodayCounts';

export type { TodayCounts } from './adminTodayCounts';

// Admin "Today" panel data — existing single-field / equality queries only (no
// composite index). The day is the phone's local day, like the admin Calendar. A failed
// query only blanks the counters that need it.

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);
const lines = (snap: QuerySnapshot | null): TodayLine[] | null => snap?.docs.map(d => {
  const x = d.data();
  return {
    status: String(x.status ?? ''), pickupAtMs: ms(x.pickupAt), returnAtMs: ms(x.returnAt),
    archived: x.archived === true, returnFinalizedAt: x.returnFinalizedAt ?? null,
    chargeReviewPending: x.chargeReviewPending === true,
    outstandingBalance: typeof x.outstandingBalance === 'number' ? x.outstandingBalance : 0,
  };
}) ?? null;
const orNull = (p: Promise<QuerySnapshot>) => p.catch(() => null);

export async function fetchAdminToday(now = new Date()): Promise<TodayCounts> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [pickupSnap, activeSnap, idSnap, claimSnap, closedSnap] = await Promise.all([
    orNull(getDocs(query(collection(db, 'reservations'),
      where('pickupAt', '>=', Timestamp.fromDate(start)), where('pickupAt', '<', Timestamp.fromDate(end))))),
    orNull(getDocs(query(collection(db, 'reservations'), where('status', '==', 'active')))),
    orNull(getDocs(query(collection(db, 'users'), where('idOnFile', '==', true)))),
    orNull(getDocs(query(collection(db, 'claims'), where('status', 'in', ['open', 'in_review'])))),
    orNull(getDocs(query(collection(db, 'reservations'), where('status', 'in', ['returned', 'lost'])))),
  ]);
  return countToday({
    dayStartMs: start.getTime(),
    dayEndMs: end.getTime(),
    nowMs: now.getTime(),
    pickupDay: lines(pickupSnap),
    active: lines(activeSnap),
    idUsers: idSnap ? idSnap.docs.map(d => d.data()) : null,
    openClaims: claimSnap ? claimSnap.size : null,
    closed: lines(closedSnap),
  });
}
