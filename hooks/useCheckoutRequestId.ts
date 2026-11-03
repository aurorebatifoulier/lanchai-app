import { useMemo } from 'react';

// Idempotency key of ONE checkout attempt (createReservations `requestId`). It stays the
// same while the order is unchanged — so a retry after a slow-network error returns the
// order the server already created instead of booking it twice — and changes as soon as
// the order does (dates, items, quantities, discount…), i.e. a genuinely new booking.
export function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function useCheckoutRequestId(orderKey: string): string {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => newRequestId(), [orderKey]);
}
