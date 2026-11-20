import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { adminErrorMessage } from './adminErrors';

// Every handover → the submitHandover callable (functions/src/handover.ts): state
// machine + a unit must be PHYSICALLY in the shop (else `no-unit-on-hand`, with the
// server's explanation: "No … in the shop to hand over (stock 1: 1 out with a renter)").

export interface HandoverChecklistPayload {
  categories: Record<string, { rating: string; note?: string }>;
  photos: string[];
  depositCurrency: 'LAK' | 'USD' | 'THB';
  depositAmount: number;
  confirmedByName: string;
  clientConfirmedByName: string;
  clientConfirmed: boolean;
  rentalPaymentMethod?: string;
}

export async function submitHandover(items: { reservationId: string; checklist?: HandoverChecklistPayload | null }[]): Promise<void> {
  try {
    await httpsCallable(functions, 'submitHandover')({ items });
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t record the handover'));
  }
}

/** A handover checklist object (as built by the screens) → the callable's payload. */
export function toHandoverPayload(c: {
  categories: Record<string, { rating: string; note?: string }>; photos: string[];
  depositCurrency: 'LAK' | 'USD' | 'THB'; depositAmount: number;
  confirmedByName: string; clientConfirmedByName: string; clientConfirmed: boolean;
  rentalPaymentMethod?: string;
}): HandoverChecklistPayload {
  return {
    categories: c.categories, photos: c.photos, depositCurrency: c.depositCurrency, depositAmount: c.depositAmount,
    confirmedByName: c.confirmedByName, clientConfirmedByName: c.clientConfirmedByName, clientConfirmed: c.clientConfirmed,
    ...(c.rentalPaymentMethod ? { rentalPaymentMethod: c.rentalPaymentMethod } : {}),
  };
}
