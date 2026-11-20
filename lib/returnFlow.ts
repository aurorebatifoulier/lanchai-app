import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { adminErrorMessage } from './adminErrors';
import type { ChecklistRating, ChargeCurrency } from '@/functions/src/shared/returnCharges';

// The 3-step return (app/admin/return.tsx) — thin wrappers over functions/src/returns.ts.
// quoteReturn = the Settlement step's figures (server-computed, no write); submitReturn
// = Client confirms (recomputes the same quote, refuses `quote-changed`).

export interface ReturnItem {
  reservationId: string;
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  chargeUnits: number;
}
export interface OwnerAdjustment { waiveLate?: boolean; lateAmount?: number; waiveDamage?: boolean; damageAmount?: number }
export interface QuoteLine {
  reservationId: string; productName: string; quantity: number;
  condition: ChecklistRating; depositHeld: number;
  lateDays: number; lateSuggested: number | null; late: number | null; lateWaived: boolean;
  damageSuggested: number | null; damage: number | null; damageWaived: boolean; damagePercent: number | null;
  chargeUnits: number; needsReview: boolean; applied: number; outstanding: number; refund: number;
}
export type QuoteResult = 'refund' | 'collect' | 'review';
export interface ReturnQuote {
  currency: ChargeCurrency; lines: QuoteLine[]; depositHeld: number; charges: number;
  refund: number; collect: number; result: QuoteResult; refundLak: number | null; collectLak: number | null;
}
export type Settlement = 'refund' | 'collected' | 'open' | 'review';

export class QuoteChangedError extends Error {
  constructor(message: string, public quote: ReturnQuote | null) { super(message); }
}

export async function quoteReturn(items: ReturnItem[], adjustments: Record<string, OwnerAdjustment>): Promise<ReturnQuote> {
  try {
    const r = await httpsCallable(functions, 'quoteReturn')({ items, adjustments });
    return r.data as ReturnQuote;
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t compute the settlement'));
  }
}

export async function submitReturnFlow(input: {
  items: ReturnItem[];
  adjustments: Record<string, OwnerAdjustment>;
  settlement: Settlement;
  quote: ReturnQuote;
  clientSignatureSvg: string;
}): Promise<ReturnQuote> {
  try {
    const r = await httpsCallable(functions, 'submitReturn')({
      items: input.items,
      adjustments: input.adjustments,
      settlement: input.settlement,
      quote: { result: input.quote.result, refund: input.quote.refund, collect: input.quote.collect },
      clientSignatureSvg: input.clientSignatureSvg,
    });
    return (r.data as { quote: ReturnQuote }).quote;
  } catch (err) {
    const e = err as { details?: { code?: string; quote?: ReturnQuote } };
    if (e?.details?.code === 'quote-changed') {
      throw new QuoteChangedError('The amounts changed since the settlement step — check them again.', e.details.quote ?? null);
    }
    throw new Error(adminErrorMessage(err, 'Couldn’t record the return'));
  }
}

/** "43 USD" / "989,000 LAK". */
export const money = (n: number, cur: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`;

/** The done screen's one sentence. */
export function resultSentence(q: ReturnQuote, settlement: Settlement): string {
  const cond = q.lines.every(l => l.condition === 'good' || l.condition === 'fair') ? 'in good condition' : 'with damage';
  const what = q.lines.length > 1 ? `${q.lines.length} items returned ${cond}` : `Returned ${cond}`;
  switch (settlement) {
    case 'refund': return `${what} — you gave back ${money(q.refund, q.currency)}.`;
    case 'collected': return `${what} — you collected ${money(q.collect, q.currency)}.`;
    case 'open': return `${what} — ${money(q.collect, q.currency)} still due; an owner will follow up.`;
    default: return `${what} — the deposit is kept until an owner reviews the damage.`;
  }
}
