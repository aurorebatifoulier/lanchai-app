import type { RentalDoc } from '@/lib/firestore';
import { DEFAULT_VAT_PERCENT } from '@/lib/exchangeRate';
import { splitHtVat } from './currency';

// Single source of truth for every derived figure on the end-of-service receipt —
// consumed by both the on-screen components/RentalReceipt.tsx and the PDF builder
// (lib/receiptPdf.ts), so the two renderers can never show different numbers for the
// same reservation. Pure aggregation of already-persisted RentalDoc fields — no new
// financial computation, matching RentalReceipt's own original convention.
export interface ReceiptData {
  vatPct: number;
  vatHt: number;
  vatAmount: number;
  depositHeldAmount: number;
  depositCurrency: 'LAK' | 'USD' | 'THB';
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

export function deriveReceiptData(rental: RentalDoc, vatPercent: number | null): ReceiptData {
  const vatPct = vatPercent ?? DEFAULT_VAT_PERCENT;
  const { ht: vatHt, vat: vatAmount } = splitHtVat(rental.total, vatPct);

  const depositHeldAmount = rental.handoverChecklist?.depositAmount ?? rental.deposit;
  const depositCurrency: 'LAK' | 'USD' | 'THB' =
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
