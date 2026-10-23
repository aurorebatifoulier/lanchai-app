import type { RentalDoc } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import { deriveReceiptData, deriveSettlementOutcome } from '@/utils/receiptData';

// The "Your rental summary" lines, in order — the ONE source for the on-screen receipt
// (components/RentalReceipt.tsx) and the PDF (lib/receiptPdf.ts), aligned with the
// receipt email. Every figure from deriveReceiptData / deriveSettlementOutcome; no new
// calculation. The rental fee is always LAK; deposit/charges are in the handover
// currency — when it differs, the total shows both, never added together.

export type SummaryLine =
  | { kind: 'row'; label: string; value: string; danger?: boolean; strong?: boolean }
  | { kind: 'detail'; text: string }
  | { kind: 'pill'; label: string; tone: 'success' | 'danger' | 'muted' };

export interface ReceiptSummary {
  lines: SummaryLine[];
  totalLabel: string;
  /** One value, or two ("1,140,800 LAK", "+ 106 USD") when the currencies differ. */
  totalValues: string[];
}

export function buildReceiptSummary(
  r: RentalDoc,
  vatPercent: number | null,
  opts: { staffView?: boolean } = {},
): ReceiptSummary {
  const data = deriveReceiptData(r, vatPercent);
  const outcome = deriveSettlementOutcome(r, data);
  const cur = data.depositCurrency;
  const fmt = (n: number) => (cur === 'LAK' ? formatLakAmount(n) : `${n.toLocaleString('en-US')} ${cur}`);
  const lines: SummaryLine[] = [];

  lines.push({ kind: 'row', label: 'Rental fee', value: formatLakAmount(r.total) });
  lines.push({ kind: 'detail', text: `incl. VAT ${data.vatPct}%: ${formatLakAmount(data.vatAmount)}` });
  lines.push({ kind: 'row', label: 'Deposit paid', value: fmt(data.depositHeldAmount) });

  if (r.lateChargeAmount != null) {
    lines.push({ kind: 'row', label: 'Late return', value: `− ${fmt(r.lateChargeAmount)}`, danger: true });
    const detail = [
      r.lateChargeReason?.replace(/^Returned\s+/i, ''),
      r.latePenaltyDays ? `${r.latePenaltyDays} rental ${r.latePenaltyDays === 1 ? 'day' : 'days'}` : null,
      // Only comparable when both are LAK (the suggestion is always LAK).
      cur === 'LAK' && r.latePenaltyAmount && r.lateChargeAmount < r.latePenaltyAmount ? 'adjusted by our team' : null,
    ].filter(Boolean).join(' · ');
    if (detail) lines.push({ kind: 'detail', text: detail });
  }
  if (r.chargeAmount != null) {
    lines.push({ kind: 'row', label: 'Damage charge', value: `− ${fmt(r.chargeAmount)}`, danger: true });
    const detail = [r.chargeReason, r.chargePercent != null ? `${r.chargePercent}% of replacement value` : null]
      .filter(Boolean).join(' · ');
    if (detail) lines.push({ kind: 'detail', text: detail });
  }

  if (outcome.kind === 'owedToClient') {
    lines.push({ kind: 'row', label: 'Deposit refunded to you', value: fmt(outcome.amount), strong: true });
  } else if (outcome.kind === 'clientOwes') {
    lines.push({
      kind: 'row', label: outcome.resolution === 'settled' ? 'You paid on top' : 'Balance due',
      value: fmt(outcome.amount), strong: true,
    });
    // Renters never see staff names; staffView (admin detail) adds them.
    lines.push(outcome.resolution === 'settled'
      ? { kind: 'pill', tone: 'success', label: opts.staffView && r.outstandingSettledBy ? `Settled by ${r.outstandingSettledBy}` : 'Settled' }
      : outcome.resolution === 'writtenOff'
        ? { kind: 'pill', tone: 'muted', label: opts.staffView && r.outstandingWrittenOffBy ? `Written off by ${r.outstandingWrittenOffBy}` : 'Written off' }
        : { kind: 'pill', tone: 'danger', label: 'Not yet settled' });
  } else {
    lines.push({ kind: 'row', label: 'Deposit fully used for charges', value: '', strong: true });
  }

  const totalValues = data.netInLak != null
    ? [formatLakAmount(data.netInLak)]
    : [formatLakAmount(r.total), ...(data.chargesTotal > 0 ? [`+ ${fmt(data.chargesTotal)}`] : [])];
  return { lines, totalLabel: 'Total cost of your rental', totalValues };
}
