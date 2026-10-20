// Single source of truth for every derived figure on the end-of-service receipt —
// consumed by the app (components/RentalReceipt.tsx on screen, lib/receiptPdf.ts for the
// PDF, both via utils/receiptData.ts) AND by the receipt email (functions/src/email), so
// no renderer can ever show different numbers for the same reservation. Pure aggregation
// of already-persisted (frozen) reservation fields — no new financial computation.
// Lives under functions/ so the Cloud Functions can import it (see latePenalty.ts).
// Keep it dependency-free.

/** 10% VAT-inclusive (TTC) placeholder used whenever config/pricing.vatPercent isn't set. */
export const DEFAULT_VAT_PERCENT = 10;

// Splits an already-LAK amount (the same figure stored/charged today) into its
// HT/VAT/TTC components for display — purely a render-time breakdown, never used to
// compute what's actually charged. `ttc` always equals the input `amountLak` unchanged;
// `ht` is rounded to the nearest whole LAK, `vat` is whatever's left so ht + vat === ttc
// exactly (no rounding drift between the two lines).
export function splitHtVat(amountLak: number, vatPercent: number): { ht: number; vat: number; ttc: number } {
  const ht = Math.round(amountLak / (1 + vatPercent / 100));
  return { ht, vat: amountLak - ht, ttc: amountLak };
}

export type DepositCurrency = 'LAK' | 'USD' | 'THB';

/** The frozen reservation fields the receipt reads — structurally satisfied by RentalDoc. */
export interface ReceiptInput {
  total: number;
  deposit: number;
  handoverChecklist?: { depositAmount?: number; depositCurrency?: DepositCurrency } | null;
  chargeCurrency?: DepositCurrency;
  depositAppliedToCharge?: number;
  outstandingBalance?: number;
}

export interface ReceiptData {
  vatPct: number;
  vatHt: number;
  vatAmount: number;
  depositHeldAmount: number;
  depositCurrency: DepositCurrency;
  depositAppliedToCharge: number;
  outstandingBalance: number;
  // One clean LAK figure only when the charge currency is LAK — the rental fee is
  // always LAK, but the deposit/charge currency is a staff choice at handover and can
  // be USD/THB. Blending them would need a new currency conversion at the CURRENT
  // exchange rate, which would also make the receipt drift if that rate ever changes
  // later. null means: render the rental fee and charges as two separate figures.
  netInLak: number | null;
  chargesTotal: number;
}

export function deriveReceiptData(rental: ReceiptInput, vatPercent: number | null | undefined): ReceiptData {
  const vatPct = vatPercent ?? DEFAULT_VAT_PERCENT;
  const { ht: vatHt, vat: vatAmount } = splitHtVat(rental.total, vatPct);

  const depositHeldAmount = rental.handoverChecklist?.depositAmount ?? rental.deposit;
  const depositCurrency: DepositCurrency =
    rental.chargeCurrency ?? rental.handoverChecklist?.depositCurrency ?? 'LAK';
  const depositAppliedToCharge = rental.depositAppliedToCharge ?? 0;
  const outstandingBalance = rental.outstandingBalance ?? 0;

  const netInLak = depositCurrency === 'LAK'
    ? rental.total + depositAppliedToCharge + outstandingBalance
    : null;
  const chargesTotal = depositAppliedToCharge + outstandingBalance;

  return {
    vatPct,
    vatHt,
    vatAmount,
    depositHeldAmount,
    depositCurrency,
    depositAppliedToCharge,
    outstandingBalance,
    netInLak,
    chargesTotal,
  };
}

// Settlement outcome line — mirrors SettlementSummary.tsx / lib/receiptPdf.ts's own
// 2-line derivation exactly (those two were deliberately left untouched; this copy is
// the one used by the receipt email).
export type SettlementOutcome =
  | { kind: 'clientOwes'; amount: number; resolution: 'settled' | 'writtenOff' | 'unsettled' }
  | { kind: 'owedToClient'; amount: number }
  | { kind: 'fullySettled' };

export function deriveSettlementOutcome(
  rental: { outstandingSettled?: boolean; outstandingWrittenOff?: boolean },
  data: ReceiptData,
): SettlementOutcome {
  if (data.outstandingBalance > 0) {
    return {
      kind: 'clientOwes',
      amount: data.outstandingBalance,
      resolution: rental.outstandingWrittenOff ? 'writtenOff' : rental.outstandingSettled ? 'settled' : 'unsettled',
    };
  }
  const owed = Math.max(0, data.depositHeldAmount - data.depositAppliedToCharge);
  return owed > 0 ? { kind: 'owedToClient', amount: owed } : { kind: 'fullySettled' };
}
