import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '@/contexts/AuthContext';

// bookingHolds/{uid} — written ONLY by the syncBookingHold Cloud Function
// (functions/src/index.ts); clients can read their own doc but never write it. While it
// exists, new reservations are refused — by firestore.rules' reservations create rule
// (the real enforcement) and by the client guard below (for a clear error message).
export type BookingHoldReason = 'overdue' | 'outstanding' | 'noShow';

export interface BookingHold {
  reasons: BookingHoldReason[];
  reservationIds: string[];
}

export class BookingHoldError extends Error {
  constructor() {
    super('New bookings are paused for this account.');
    this.name = 'BookingHoldError';
  }
}

export async function getBookingHold(uid: string): Promise<BookingHold | null> {
  const snap = await getDoc(doc(db, 'bookingHolds', uid));
  return snap.exists() ? (snap.data() as BookingHold) : null;
}

/** Live hold for the signed-in renter. Always null for admins (they're never blocked). */
export function useBookingHold(): BookingHold | null {
  const { user, isAdmin } = useAuth();
  const [hold, setHold] = useState<BookingHold | null>(null);

  useEffect(() => {
    if (!user || isAdmin) { setHold(null); return; }
    return onSnapshot(
      doc(db, 'bookingHolds', user.uid),
      snap => setHold(snap.exists() ? (snap.data() as BookingHold) : null),
      () => setHold(null),
    );
  }, [user, isAdmin]);

  return hold;
}
