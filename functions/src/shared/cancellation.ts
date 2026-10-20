// Cancellation rules — single source for the app (renter cancellation screens, admin
// cancellation) and the cancellation email. Dependency-free (see latePenalty.ts).
//
// Business reality at launch: nothing is charged before pick-up (payment happens in
// store), so every outcome is "nothing to pay". The policy tiers (lib/legalContent.ts:
// >48h free, 24–48h store credit, <24h no refund, premium non-refundable) only kick in
// if a reservation ever carries an `advancePaidLak > 0` — keep this future-proof, but
// never mention money to a renter when nothing was paid.

export type CancelTier = 'free' | 'voucher' | 'no_refund' | 'premium';

export function cancelTier(hoursUntilPickup: number, isPremium?: boolean): CancelTier {
  if (isPremium) return 'premium';
  if (hoursUntilPickup > 48) return 'free';
  if (hoursUntilPickup > 24) return 'voucher';
  return 'no_refund';
}

export const STORE_CREDIT_VALIDITY_MONTHS = 6;

export type CancellationOutcome =
  | { kind: 'nothing_to_pay' }
  | { kind: 'full_refund'; amountLak: number }
  | { kind: 'store_credit'; amountLak: number; validUntilMs: number }
  | { kind: 'retained'; amountLak: number };

export function cancellationOutcome(input: {
  advancePaidLak?: number | null;
  hoursUntilPickup: number;
  isPremium?: boolean;
  /** Cancelled by LANCHAI (not at the customer's request) → any advance is refunded in full. */
  byLanchai?: boolean;
  cancelledAtMs?: number;
}): CancellationOutcome {
  const paid = input.advancePaidLak ?? 0;
  if (!(paid > 0)) return { kind: 'nothing_to_pay' };
  if (input.byLanchai) return { kind: 'full_refund', amountLak: paid };
  switch (cancelTier(input.hoursUntilPickup, input.isPremium)) {
    case 'free':
      return { kind: 'full_refund', amountLak: paid };
    case 'voucher': {
      const d = new Date(input.cancelledAtMs ?? Date.now());
      d.setUTCMonth(d.getUTCMonth() + STORE_CREDIT_VALIDITY_MONTHS);
      return { kind: 'store_credit', amountLak: paid, validUntilMs: d.getTime() };
    }
    default:
      return { kind: 'retained', amountLak: paid };
  }
}

// ── Admin cancellation reasons ──────────────────────────────────────────────────
export type CancelReason = 'item_unavailable' | 'item_damaged' | 'shop_closed' | 'customer_request' | 'other';

export const CANCEL_REASONS: Record<CancelReason, { label: string; renterSentence: string | null }> = {
  item_unavailable: { label: 'Item unavailable',                     renterSentence: 'The item isn’t available on your dates. It’s on us, not you.' },
  item_damaged:     { label: 'Item damaged',                         renterSentence: 'The item needs a repair and can’t go out safely on your dates. It’s on us, not you.' },
  shop_closed:      { label: 'Shop closed',                          renterSentence: 'Our shop is closed on your pick-up date. It’s on us, not you.' },
  customer_request: { label: 'Customer request (by phone/in store)', renterSentence: null },
  other:            { label: 'Other',                                renterSentence: 'We had to cancel your booking.' },
};

export const CANCEL_REASON_KEYS = Object.keys(CANCEL_REASONS) as CancelReason[];

/** Statuses an admin may cancel (an active rental is a return, not a cancellation). */
export const ADMIN_CANCELLABLE_STATUSES = ['pending_payment', 'confirmed'] as const;

/**
 * Which cancellation email to send: 'A' = requested by the customer (renter, or admin
 * on the customer's behalf), 'B' = cancelled by LANCHAI, null = no email (admin_release
 * is a data correction, not a cancellation).
 */
export function cancellationEmailVariant(cancelledBy: unknown, cancelReason: unknown): 'A' | 'B' | null {
  if (cancelledBy === 'admin_release') return null;
  if (cancelledBy === 'renter') return 'A';
  if (cancelledBy === 'admin' && cancelReason === 'customer_request') return 'A';
  return 'B';
}
