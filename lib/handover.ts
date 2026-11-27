import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { adminErrorMessage } from './adminErrors';
import type { HandoverQuote, PickupPayment } from '@/functions/src/shared/handoverQuote';
import type { ChecklistRating } from '@/functions/src/shared/returnCharges';
import type { IdDocType } from '@/lib/identity';
import type { AgreementMethod } from '@/functions/src/shared/rentalAgreement';

// The 4-step Pick-up (app/admin/pickup.tsx) — thin wrappers over functions/src/handover.ts.
// quoteHandover = the Payment step's figures (server, no write); submitHandover = Client
// signs (re-checks everything in ONE transaction, refuses `quote-changed`, the physical
// unit check `no-unit-on-hand`, `earlier-day`, `booked-by-someone-else`).

export interface PickupItem {
  reservationId: string;
  checklist: { categories: Record<string, { rating: ChecklistRating; note?: string }>; photos: string[] };
}
export interface PickupIdCheck {
  matchesPerson: boolean;
  nameMatches: boolean;
  counterPhoto?: { docType: IdDocType; files: string[] };
}

export class HandoverQuoteChangedError extends Error {
  constructor(message: string, public quote: HandoverQuote | null) { super(message); }
}

export async function quoteHandover(ids: string[]): Promise<HandoverQuote> {
  try {
    const r = await httpsCallable(functions, 'quoteHandover')({ ids });
    return r.data as HandoverQuote;
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t compute the payment'));
  }
}

export async function submitHandover(input: {
  items: PickupItem[];
  payment: PickupPayment;
  collect: { rental: number; deposit: number };
  idCheck: PickupIdCheck | null;
  phoneVerified: boolean;
  agreement: { id: string; method: AgreementMethod };
}): Promise<{ rental: number; deposit: number }> {
  try {
    const r = await httpsCallable(functions, 'submitHandover')({
      items: input.items,
      payment: input.payment,
      quote: input.collect,
      idCheck: input.idCheck,
      phoneVerified: input.phoneVerified,
      agreement: input.agreement,
    });
    return (r.data as { collected: { rental: number; deposit: number } }).collected;
  } catch (err) {
    const e = err as { details?: { code?: string; quote?: HandoverQuote } };
    if (e?.details?.code === 'quote-changed') {
      throw new HandoverQuoteChangedError('The amounts changed since the payment step — check them again.', e.details.quote ?? null);
    }
    throw new Error(adminErrorMessage(err, 'Couldn’t record the pick-up'));
  }
}
