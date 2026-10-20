import { renderEmail, fmtLak, fmtCurrency, type Block, type Row } from './layout';
import type { EmailShop } from './context';
import { deriveReceiptData, deriveSettlementOutcome, type ReceiptInput, type DepositCurrency } from '../shared/receiptData';

// Every LANCHAI email's content. Amounts ONLY from frozen reservation fields; dates are
// the reservation's stored pickupLabel/returnLabel (functions run in UTC — never
// re-format dates here). Renter-facing copy must NEVER mention the internal late-return
// grace period.

export interface Rendered { subject: string; html: string; text: string }

/** The reservation fields the templates read (admin SDK doc data). */
export interface ResData extends ReceiptInput {
  id: string;
  orderId?: string;
  productName: string;
  quantity: number;
  pickupLabel: string;
  returnLabel: string;
  subtotal: number;
  couponApplied?: { percent: number; discountAmount: number } | null;
  chargeAmount?: number;
  chargeReason?: string;
  lateChargeAmount?: number;
  lateChargeReason?: string;
  outstandingSettled?: boolean;
  outstandingWrittenOff?: boolean;
}

const qty = (r: ResData) => (r.quantity > 1 ? ` × ${r.quantity}` : '');
const refLine = (r: ResData) => `Reservation ID: ${r.id}`;
const hi = (name: string) => `Hi ${name},`;

function itemBlocks(items: ResData[], lines: (r: ResData) => string[]): Block[] {
  return items.map(r => ({ type: 'item' as const, title: `${r.productName}${qty(r)}`, lines: lines(r) }));
}

// ── 1. Booking confirmation (one per order) ─────────────────────────────────────
export function bookingConfirmationEmail(name: string, orderId: string, items: ResData[], shop: EmailShop): Rendered {
  const total   = items.reduce((s, r) => s + (r.total ?? 0), 0);
  const deposit = items.reduce((s, r) => s + (r.deposit ?? 0), 0);
  const discount = items.reduce((s, r) => s + (r.couponApplied?.discountAmount ?? 0), 0);
  const rows: Row[] = [];
  if (discount > 0) rows.push({ label: 'Coupon discount', value: `− ${fmtLak(discount)}`, tone: 'muted' });
  rows.push({ label: 'Total to pay at pick-up', value: fmtLak(total), strong: true });
  rows.push({ label: 'Deposit (refundable, collected at pick-up)', value: fmtLak(deposit) });

  const subject = `Booking confirmation — ${orderId}`;
  const { html, text } = renderEmail({
    preheader: `Your LANCHAI booking ${orderId} is registered. Payment happens at pick-up.`,
    title: 'Booking confirmation',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: `Thanks for renting with LANCHAI! Your booking is registered — payment happens in store at pick-up.` },
      { type: 'note', text: `Order ID: ${orderId}` },
      ...itemBlocks(items, r => [`Pick-up: ${r.pickupLabel}`, `Return: ${r.returnLabel}`, refLine(r)]),
      { type: 'rows', rows },
      { type: 'note', text: 'The deposit is refunded at return once the item has been checked (about 10 minutes). Bring your booking QR code — you can find it in the app under My rentals.' },
      { type: 'shop' },
    ],
  }, shop);
  return { subject, html, text };
}

// ── 2. Pickup reminder ───────────────────────────────────────────────────────────
export function pickupReminderEmail(name: string, items: ResData[], shop: EmailShop): Rendered {
  const { html, text } = renderEmail({
    preheader: 'Your LANCHAI pick-up is tomorrow.',
    title: 'Your pick-up is tomorrow',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: 'A quick reminder: your rental is ready to be picked up tomorrow.' },
      ...itemBlocks(items, r => [`Pick-up: ${r.pickupLabel}`, refLine(r)]),
      { type: 'note', text: 'Bring your booking QR code (in the app, under My rentals) and a valid ID. The rental fee balance and the refundable deposit are paid at pick-up.' },
      { type: 'shop' },
    ],
  }, shop);
  return { subject: 'Reminder: your pick-up is tomorrow', html, text };
}

// ── 3. Return reminder ───────────────────────────────────────────────────────────
export function returnReminderEmail(name: string, items: ResData[], shop: EmailShop): Rendered {
  const { html, text } = renderEmail({
    preheader: 'Your LANCHAI return is due tomorrow.',
    title: 'Your return is due tomorrow',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: 'A quick reminder: your rental is due back tomorrow.' },
      ...itemBlocks(items, r => [`Return: ${r.returnLabel}`, refLine(r)]),
      { type: 'note', text: 'Please bring the item back with all its accessories. It is checked on the spot (about 10 minutes) and your deposit is refunded right away.' },
      { type: 'shop' },
    ],
  }, shop);
  return { subject: 'Reminder: your return is due tomorrow', html, text };
}

// ── 4. Cancellation ──────────────────────────────────────────────────────────────
export function cancellationEmail(name: string, items: ResData[], shop: EmailShop): Rendered {
  const { html, text } = renderEmail({
    preheader: 'Your LANCHAI booking has been cancelled.',
    title: 'Your booking has been cancelled',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: items.length > 1 ? 'The following items have been cancelled:' : 'The following booking has been cancelled:' },
      ...itemBlocks(items, r => [`Pick-up: ${r.pickupLabel}`, `Return: ${r.returnLabel}`, refLine(r)]),
      { type: 'note', text: 'Any refund of your advance follows our cancellation terms (available in the app). If you did not request this cancellation or have a question, just reply to this email.' },
    ],
  }, shop);
  return { subject: 'Your booking has been cancelled', html, text };
}

// ── 5. End-of-rental receipt (figures via deriveReceiptData — single source) ─────
export function receiptEmail(name: string, r: ResData, vatPercent: number | null, shop: EmailShop): Rendered {
  const data = deriveReceiptData(r, vatPercent);
  const cur: DepositCurrency = data.depositCurrency;
  const fmt = (n: number) => fmtCurrency(n, cur);

  const feeRows: Row[] = [
    { label: 'Subtotal (excl. VAT)', value: fmtLak(data.vatHt), tone: 'muted' },
    { label: `VAT (${data.vatPct}%)`, value: fmtLak(data.vatAmount), tone: 'muted' },
    { label: 'Rental fee paid', value: fmtLak(r.total), strong: true },
  ];

  const chargeRows: Row[] = [];
  if (r.chargeAmount != null) chargeRows.push({ label: `Damage/condition charge${r.chargeReason ? ` — ${r.chargeReason}` : ''}`, value: fmt(r.chargeAmount), tone: 'danger' });
  if (r.lateChargeAmount != null) chargeRows.push({ label: `Late return penalty${r.lateChargeReason ? ` — ${r.lateChargeReason}` : ''}`, value: fmt(r.lateChargeAmount), tone: 'danger' });
  chargeRows.push({ label: 'Deposit held', value: fmt(data.depositHeldAmount), tone: 'muted' });

  const outcome = deriveSettlementOutcome(r, data);
  let outcomeNote: string | undefined;
  if (outcome.kind === 'clientOwes') {
    chargeRows.push({ label: 'Balance due', value: fmt(outcome.amount), strong: true, tone: 'danger' });
    outcomeNote = outcome.resolution === 'settled' ? 'Settled' : outcome.resolution === 'writtenOff' ? 'Written off' : 'Not yet settled';
  } else if (outcome.kind === 'owedToClient') {
    chargeRows.push({ label: 'Deposit refunded to you', value: fmt(outcome.amount), strong: true });
  } else {
    chargeRows.push({ label: 'Fully settled — nothing owed', value: '', strong: true });
  }

  const totalRows: Row[] = data.netInLak != null
    ? [{ label: 'Total paid', value: fmtLak(data.netInLak), strong: true }]
    : [{ label: 'Rental fee paid', value: fmtLak(r.total), strong: true },
       ...(data.chargesTotal > 0 ? [{ label: 'Charges (see above)', value: fmt(data.chargesTotal) }] : [])];

  const { html, text } = renderEmail({
    preheader: `Your LANCHAI receipt for ${r.productName}.`,
    title: 'Your rental receipt',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: 'Thanks for renting with LANCHAI — here is the summary of your rental.' },
      { type: 'item', title: `${r.productName}${qty(r)}`, lines: [`Pick-up: ${r.pickupLabel}`, `Return: ${r.returnLabel}`, refLine(r)] },
      { type: 'heading', text: 'Rental fee' },
      { type: 'rows', rows: feeRows },
      { type: 'heading', text: 'Deposit & charges' },
      { type: 'rows', rows: chargeRows, note: outcomeNote },
      { type: 'heading', text: 'Total' },
      { type: 'rows', rows: totalRows },
      { type: 'note', text: 'You can download this receipt as a PDF in the app: My rentals → this rental → Receipt.' },
    ],
  }, shop);
  return { subject: `Your rental receipt — ${r.id}`, html, text };
}

// ── 6. Business account decision ─────────────────────────────────────────────────
export function btobApprovedEmail(name: string, shop: EmailShop): Rendered {
  const { html, text } = renderEmail({
    preheader: 'Your LANCHAI business account is approved.',
    title: 'Your business account is approved',
    greeting: hi(name),
    blocks: [
      { type: 'p', text: 'Good news — your business account has been approved. You can now book with your business pricing and receive VAT details on your bookings.' },
      { type: 'p', text: 'Open the app to start renting.' },
    ],
  }, shop);
  return { subject: 'Your business account is approved', html, text };
}

export function btobRejectedEmail(name: string, reason: string | null, shop: EmailShop): Rendered {
  const blocks: Block[] = [
    { type: 'p', text: 'Thank you for applying for a LANCHAI business account. Unfortunately we could not approve it this time.' },
  ];
  if (reason) blocks.push({ type: 'rows', rows: [{ label: 'Reason', value: reason }] });
  blocks.push({ type: 'p', text: 'You can update your details in the app and apply again, or reply to this email if you have questions.' });
  const { html, text } = renderEmail({
    preheader: 'An update on your LANCHAI business account.',
    title: 'Your business account application',
    greeting: hi(name),
    blocks,
  }, shop);
  return { subject: 'Your business account application', html, text };
}

// ── 7. Late return (end of grace / 24h / 48h / 72h) — mirrors the in-app copy ────
// NEVER mention the internal grace period: the first email just says "overdue".
export type LateEmailStage = 'tier1' | 'tier2' | 'tier3' | 'nonReturn';

export function lateReturnEmail(
  name: string,
  stage: LateEmailStage,
  r: { id: string; productName: string; returnLabel: string },
  amountLak: number,
  shop: EmailShop,
): Rendered {
  const amount = fmtLak(amountLak);
  const copy: Record<LateEmailStage, { subject: string; title: string; body: string }> = {
    tier1: {
      subject: 'Your return is overdue',
      title: 'Your return is overdue',
      body: `Your ${r.productName} is overdue. A late fee of ${amount} (1 rental day) may apply, pending confirmation from our team — please return the item as soon as possible.`,
    },
    tier2: {
      subject: 'Your return is over 24 hours late',
      title: 'Your return is over 24 hours late',
      body: `Your ${r.productName} is more than 24 hours overdue. The late fee may now be ${amount} (1.5 rental days), pending confirmation from our team — please return it as soon as possible.`,
    },
    tier3: {
      subject: 'Your return is over 48 hours late',
      title: 'Your return is over 48 hours late',
      body: `Your ${r.productName} is more than 48 hours overdue. The late fee may now be ${amount} (2 rental days), pending confirmation from our team. After 72 hours, it will be treated as a non-return.`,
    },
    nonReturn: {
      subject: 'Your rental is treated as a non-return',
      title: 'Your rental is treated as a non-return',
      body: `Your ${r.productName} is now more than 72 hours overdue and is treated as a non-return. Your deposit may be kept and our contract procedure applies. Please contact us right away.`,
    },
  };
  const c = copy[stage];
  const { html, text } = renderEmail({
    preheader: c.title,
    title: c.title,
    greeting: hi(name),
    blocks: [
      { type: 'p', text: c.body },
      { type: 'item', title: r.productName, lines: [`Return was due: ${r.returnLabel}`, `Reservation ID: ${r.id}`] },
      { type: 'shop' },
    ],
  }, shop);
  return { subject: c.subject, html, text };
}
