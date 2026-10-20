import { renderEmail, fmtLak, fmtCurrency, type Block, type Inner, type Button } from './layout';
import type { EmailShop, Rates } from './context';
import { appLink } from './config';
import { googleCalendarUrl, icsAttachment, type CalendarEvent } from './calendar';
import {
  deriveReceiptData, deriveSettlementOutcome, splitHtVat, DEFAULT_VAT_PERCENT,
  type ReceiptInput, type DepositCurrency,
} from '../shared/receiptData';
import { mapsUrl, openHoursText, CONTACT_EMAIL } from '../shared/shop';
import { CANCELLATION_SUMMARY } from '../shared/policy';
import { vteDay, vteTime, vteDayTime } from '../shared/dates';

// Every LANCHAI email's content, on the shared card layout (layout.ts).
// - Amounts ONLY from frozen reservation fields — never recalculated.
// - Dates formatted in Vientiane time from pickupAt/returnAt (functions run in UTC).
// - Renter-facing copy NEVER mentions the internal late-return grace period.

export interface Rendered {
  subject: string;
  html: string;
  text: string;
  attachments?: { name: string; content: string }[];
}

/** The reservation fields the templates read (admin SDK doc data, Timestamps → ms). */
export interface ResData extends ReceiptInput {
  id: string;
  orderId?: string;
  productName: string;
  quantity: number;
  pickupLabel: string;
  returnLabel: string;
  pickupAtMs: number;
  returnAtMs: number;
  pricePerDay: number;
  durationDays: number;
  subtotal: number;
  couponApplied?: { percent: number; discountAmount: number } | null;
  chargeAmount?: number;
  chargeReason?: string;
  lateChargeAmount?: number;
  lateChargeReason?: string;
  outstandingSettled?: boolean;
  outstandingWrittenOff?: boolean;
}

// ── Shared pieces ──────────────────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const orderIdOf = (items: ResData[]) => items[0]?.orderId ?? items[0]?.id.replace(/_\d+$/, '') ?? '';
const sortByPickup = (items: ResData[]) => [...items].sort((a, b) => a.pickupAtMs - b.pickupAtMs || a.id.localeCompare(b.id));
const sameDates = (items: ResData[]) =>
  items.every(r => r.pickupAtMs === items[0].pickupAtMs && r.returnAtMs === items[0].returnAtMs);
const range = (r: ResData) => `${vteDayTime(r.pickupAtMs)} → ${vteDayTime(r.returnAtMs)}`;

function bookingLink(items: ResData[]): Button {
  return {
    label: 'View my booking',
    url: items.length === 1 ? appLink(`rentals/${items[0].id}`) : appLink('reservations'),
  };
}

const directions = (shop: EmailShop): Button => ({ label: 'Get directions', url: mapsUrl(shop), icon: 'map-pin' });

/**
 * "Your items" card. When ALL items share pickupAt + returnAt, the dates are shown ONCE
 * right under the title (clock icon) and each item only shows its price detail;
 * otherwise each item carries its own dates. With prices: rate × days × qty, totals.
 */
function itemsCard(items: ResData[], opts: { prices?: boolean; vatPercent?: number | null } = {}): Block {
  const same = sameDates(items);
  const inner: Inner[] = [];
  if (same) {
    inner.push({ type: 'dates', text: `${range(items[0])} · ${plural(items[0].durationDays, 'day')}` });
  }
  for (const r of items) {
    if (opts.prices) {
      const priceDetail = `${fmtLak(r.pricePerDay)} × ${plural(r.durationDays, 'day')} × ${r.quantity}`;
      inner.push({ type: 'line', name: r.productName, detail: same ? priceDetail : `${range(r)} · ${priceDetail}`, amount: fmtLak(r.subtotal) });
    } else {
      // Names only, compact: "Portable speaker × 2"; per-item dates only when they differ.
      inner.push({
        type: 'line',
        name: r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName,
        detail: same ? undefined : range(r),
        compact: same,
      });
    }
  }
  if (opts.prices) {
    const total    = items.reduce((s, r) => s + (r.total ?? 0), 0);
    const deposit  = items.reduce((s, r) => s + (r.deposit ?? 0), 0);
    const discount = items.reduce((s, r) => s + (r.couponApplied?.discountAmount ?? 0), 0);
    const vatPct   = opts.vatPercent ?? DEFAULT_VAT_PERCENT;
    // Same build-up as the app's confirmation screen (CLAUDE.md): VAT split of the
    // post-coupon total, for every customer type; the deposit never goes through VAT.
    const { ht, vat } = splitHtVat(total, vatPct);
    inner.push({ type: 'divider' });
    if (discount > 0) inner.push({ type: 'row', label: 'Coupon', value: `− ${fmtLak(discount)}`, tone: 'muted' });
    inner.push({ type: 'row', label: 'Subtotal (excl. VAT)', value: fmtLak(ht), tone: 'muted' });
    inner.push({ type: 'row', label: `VAT (${vatPct}%)`, value: fmtLak(vat), tone: 'muted' });
    inner.push({ type: 'row', label: 'Total to pay at pick-up', value: fmtLak(total), strong: true, gapTop: 6 });
    inner.push({ type: 'row', label: 'Refundable deposit', value: fmtLak(deposit), gapTop: 2 });
  }
  return { type: 'card', title: 'Your items', items: inner };
}

function whatToBringCard(shop: EmailShop, opts: { payment?: boolean } = { payment: true }): Block {
  const items: Inner[] = [
    { type: 'bullet', text: 'Your ID document', icon: { name: 'id-card', alt: 'ID card' } },
    { type: 'bullet', text: 'Your booking QR code (app › My rentals)', icon: { name: 'qr-code', alt: 'QR code' } },
  ];
  if (opts.payment) items.push({ type: 'bullet', text: shop.paymentMethods, icon: { name: 'cash', alt: 'Payment' } });
  return { type: 'card', title: 'What to bring', items };
}

/** wa.me link with a prefilled message, or null when no WhatsApp number is configured. */
function whatsappUrl(shop: EmailShop, message: string): string | null {
  return shop.whatsappNumber ? `https://wa.me/${shop.whatsappNumber}?text=${encodeURIComponent(message)}` : null;
}

/** "approx. $27 · ฿940" from the admin exchange rates; null if either rate is missing. */
function approxForeign(amountLak: number, rates: Rates): string | null {
  if (!rates.usdToLak || !rates.thbToLak) return null;
  const usd = Math.round(amountLak / rates.usdToLak);
  const thb = Math.round(amountLak / rates.thbToLak);
  return `approx. $${usd.toLocaleString('en-US')} · ฿${thb.toLocaleString('en-US')}`;
}

function shopCard(shop: EmailShop, note?: string, title = 'Pick-up and return'): Block {
  return {
    type: 'card',
    title,
    items: [{ type: 'stack', lines: [shop.name, `${shop.addressLine}, ${shop.city}`, openHoursText(shop.hours)], note }],
  };
}

const DEPOSIT_NOTE = 'Your deposit is refunded at return, once the item has been checked — about 10 minutes.';

const cancellationLine = (): Block => ({
  type: 'center',
  text: CANCELLATION_SUMMARY,
  link: { label: 'Cancellation policy', url: appLink('legal/cancellation') },
});

function calendarEvents(items: ResData[], orderId: string): CalendarEvent[] {
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const r of sortByPickup(items)) {
    const key = `${r.pickupAtMs}|${r.returnAtMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = items.filter(i => i.pickupAtMs === r.pickupAtMs && i.returnAtMs === r.returnAtMs).map(i => i.productName).join(', ');
    events.push(
      { uid: `${orderId}-${r.pickupAtMs}-pickup`, title: 'LANCHAI pick-up', startMs: r.pickupAtMs, durationMin: 30,
        description: `Pick up: ${names}. Order ${orderId}. Bring your ID and booking QR code.` },
      { uid: `${orderId}-${r.returnAtMs}-return`, title: 'LANCHAI return', startMs: r.returnAtMs, durationMin: 30,
        description: `Return: ${names}. Order ${orderId}.` },
    );
  }
  return events;
}

function build(subject: string, preheader: string, title: string, blocks: Block[], shop: EmailShop,
  attachments?: Rendered['attachments']): Rendered {
  const { html, text } = renderEmail({ preheader, title, blocks }, shop);
  return { subject, html, text, attachments };
}

// ── 1. Booking confirmation (one per order) ─────────────────────────────────────
export function bookingConfirmationEmail(
  _name: string, orderId: string, rawItems: ResData[], shop: EmailShop, vatPercent: number | null = null,
): Rendered {
  const items = sortByPickup(rawItems);
  const first = items[0];
  const total = items.reduce((s, r) => s + (r.total ?? 0), 0);
  const events = calendarEvents(items, orderId);
  return build(
    `Your LANCHAI booking is confirmed · Pick-up ${vteDay(first.pickupAtMs)}`,
    `${plural(items.length, 'item')} · ${fmtLak(total)} to pay at pick-up`,
    'Booking confirmation',
    [
      {
        type: 'hero',
        pill: 'Your items are reserved',
        title: `See you ${vteDay(first.pickupAtMs)} at ${vteTime(first.pickupAtMs)}`,
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: bookingLink(items),
        secondary: [directions(shop), { label: 'Add to calendar', url: googleCalendarUrl(events[0], shop), icon: 'calendar-plus' }],
      },
      itemsCard(items, { prices: true, vatPercent }),
      whatToBringCard(shop),
      shopCard(shop, DEPOSIT_NOTE),
      cancellationLine(),
    ],
    shop,
    [icsAttachment(events, shop)],
  );
}

// ── 2. Pick-up reminder ──────────────────────────────────────────────────────────
export function pickupReminderEmail(_name: string, rawItems: ResData[], shop: EmailShop, rates: Rates): Rendered {
  const items = sortByPickup(rawItems);
  const first = items[0];
  const orderId = orderIdOf(items);
  const day = vteDay(first.pickupAtMs);
  const time = vteTime(first.pickupAtMs);
  // Frozen reservation fields, summed over the order — no breakdown, no VAT here.
  const total   = items.reduce((s, r) => s + (r.total ?? 0), 0);
  const deposit = items.reduce((s, r) => s + (r.deposit ?? 0), 0);
  const wa = whatsappUrl(shop, `Hi LANCHAI, about my order ${orderId} (pick-up ${day} at ${time}): `);

  const secondary: Button[] = [directions(shop)];
  if (wa) secondary.push({ label: 'Message us', url: wa, icon: 'whatsapp' });

  return build(
    `Pick-up tomorrow · ${day} at ${time}`,
    `Bring your ID, your QR code and ${fmtLak(total)} + deposit`,
    'Pick-up tomorrow',
    [
      {
        type: 'hero',
        pill: 'Ready for pick-up',
        title: `See you tomorrow, ${day} at ${time}`,
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: bookingLink(items),
        secondary,
      },
      {
        type: 'card',
        title: 'To pay at pick-up',
        items: [
          { type: 'amount', label: 'Total', value: fmtLak(total), approx: approxForeign(total, rates) ?? undefined },
          { type: 'amount', label: 'Deposit', value: fmtLak(deposit), approx: approxForeign(deposit, rates) ?? undefined },
          { type: 'text', text: 'The deposit is refunded at return after a quick check.', tone: 'muted', small: true },
          { type: 'divider' },
          { type: 'bullet', text: shop.paymentMethods, icon: { name: 'cash', alt: 'Payment' } },
        ],
      },
      itemsCard(items),
      whatToBringCard(shop, { payment: false }),
      shopCard(shop, 'Pick-up takes about 10 minutes: we check each item with you.', 'Pick-up'),
      wa
        ? { type: 'center', text: 'Running late or can’t make it?', link: { label: 'Message us on WhatsApp.', url: wa } }
        : { type: 'center', text: 'Running late or can’t make it?', link: { label: `Email ${CONTACT_EMAIL}.`, url: `mailto:${CONTACT_EMAIL}` } },
    ],
    shop,
  );
}

// ── 3. Return reminder ───────────────────────────────────────────────────────────
export function returnReminderEmail(_name: string, rawItems: ResData[], shop: EmailShop): Rendered {
  const items = [...rawItems].sort((a, b) => a.returnAtMs - b.returnAtMs);
  const first = items[0];
  const orderId = orderIdOf(items);
  return build(
    `Return due tomorrow · ${vteDay(first.returnAtMs)} at ${vteTime(first.returnAtMs)}`,
    'Bring everything back with its accessories — your deposit is refunded on the spot',
    'Return due tomorrow',
    [
      {
        type: 'hero',
        pill: 'Return tomorrow',
        title: `Return due tomorrow at ${vteTime(first.returnAtMs)}`,
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: bookingLink(items),
        secondary: [directions(shop)],
      },
      itemsCard(items),
      shopCard(shop, 'Please bring every item back with all its accessories. ' + DEPOSIT_NOTE),
    ],
    shop,
  );
}

// ── 4. Cancellation ──────────────────────────────────────────────────────────────
export function cancellationEmail(_name: string, rawItems: ResData[], shop: EmailShop): Rendered {
  const items = sortByPickup(rawItems);
  const orderId = orderIdOf(items);
  return build(
    `Your LANCHAI booking is cancelled · ${orderId}`,
    `${plural(items.length, 'item')} cancelled`,
    'Booking cancelled',
    [
      {
        type: 'hero',
        pill: 'Booking cancelled',
        title: items.length > 1 ? 'Your items have been cancelled' : 'Your booking has been cancelled',
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: { label: 'View my rentals', url: appLink('reservations') },
      },
      itemsCard(items),
      { type: 'card', items: [
        { type: 'text', text: 'Any refund of your advance follows our cancellation policy.', tone: 'muted' },
        { type: 'text', text: 'Didn’t request this cancellation? Just reply to this email.', tone: 'muted', small: true },
      ] },
      cancellationLine(),
    ],
    shop,
  );
}

// ── 5. End-of-rental receipt (figures via deriveReceiptData — single source) ─────
export function receiptEmail(_name: string, r: ResData, vatPercent: number | null, shop: EmailShop): Rendered {
  const data = deriveReceiptData(r, vatPercent);
  const cur: DepositCurrency = data.depositCurrency;
  const fmt = (n: number) => fmtCurrency(n, cur);
  const orderId = orderIdOf([r]);

  const charges: Inner[] = [];
  if (r.chargeAmount != null) charges.push({ type: 'line', name: 'Damage/condition charge', detail: r.chargeReason, amount: fmt(r.chargeAmount) });
  if (r.lateChargeAmount != null) charges.push({ type: 'line', name: 'Late return penalty', detail: r.lateChargeReason, amount: fmt(r.lateChargeAmount) });
  charges.push({ type: 'row', label: 'Deposit held', value: fmt(data.depositHeldAmount), tone: 'muted' });
  const outcome = deriveSettlementOutcome(r, data);
  if (outcome.kind === 'clientOwes') {
    charges.push({ type: 'row', label: 'Balance due', value: fmt(outcome.amount), strong: true, tone: 'danger' });
    charges.push({ type: 'subtle', text: outcome.resolution === 'settled' ? 'Settled' : outcome.resolution === 'writtenOff' ? 'Written off' : 'Not yet settled' });
  } else if (outcome.kind === 'owedToClient') {
    charges.push({ type: 'row', label: 'Deposit refunded to you', value: fmt(outcome.amount), strong: true });
  } else {
    charges.push({ type: 'row', label: 'Fully settled — nothing owed', value: '', strong: true });
  }

  const totals: Inner[] = data.netInLak != null
    ? [{ type: 'row', label: 'Total paid', value: fmtLak(data.netInLak), strong: true }]
    : [{ type: 'row', label: 'Rental fee paid', value: fmtLak(r.total), strong: true },
       ...(data.chargesTotal > 0 ? [{ type: 'row' as const, label: 'Charges (see above)', value: fmt(data.chargesTotal) }] : [])];

  const preheaderTotal = data.netInLak != null ? `Total paid ${fmtLak(data.netInLak)}` : `Rental fee ${fmtLak(r.total)}`;
  return build(
    `Your LANCHAI receipt · ${r.productName}`,
    `${preheaderTotal} · thanks for renting with LANCHAI`,
    'Your rental receipt',
    [
      {
        type: 'hero',
        pill: 'Rental closed',
        title: 'Thanks for renting with us',
        sub: `${r.productName} · Order ${orderId}`,
        primary: { label: 'View my receipt', url: appLink(`rentals/${r.id}`) },
      },
      { type: 'card', title: 'Rental fee', items: [
        { type: 'dates', text: `${range(r)} · ${plural(r.durationDays, 'day')}` },
        { type: 'line', name: r.productName, detail: `${fmtLak(r.pricePerDay)} × ${plural(r.durationDays, 'day')} × ${r.quantity}` },
        { type: 'divider' },
        { type: 'row', label: 'Subtotal (excl. VAT)', value: fmtLak(data.vatHt), tone: 'muted' },
        { type: 'row', label: `VAT (${data.vatPct}%)`, value: fmtLak(data.vatAmount), tone: 'muted' },
        { type: 'row', label: 'Rental fee paid', value: fmtLak(r.total), strong: true },
      ] },
      { type: 'card', title: 'Deposit & charges', items: charges },
      { type: 'card', title: 'Total', items: [
        ...totals,
        { type: 'text', text: 'You can download this receipt as a PDF in the app: My rentals › this rental › Receipt.', tone: 'muted', small: true },
      ] },
    ],
    shop,
  );
}

// ── 6. Business account decision ─────────────────────────────────────────────────
export function btobApprovedEmail(_name: string, shop: EmailShop): Rendered {
  return build(
    'Your LANCHAI business account is approved',
    'Business pricing and VAT details are now on your bookings',
    'Business account approved',
    [
      {
        type: 'hero',
        pill: 'Business account',
        title: 'Your account is approved',
        sub: 'You can now book with your business account.',
        primary: { label: 'Open the app', url: appLink('home') },
      },
      { type: 'card', items: [
        { type: 'text', text: 'Your bookings now show prices with the VAT breakdown, ready for your accounting.' },
      ] },
    ],
    shop,
  );
}

export function btobRejectedEmail(_name: string, reason: string | null, shop: EmailShop): Rendered {
  const items: Inner[] = [];
  if (reason) items.push({ type: 'row', label: 'Reason', value: '' }, { type: 'text', text: reason });
  items.push({ type: 'text', text: 'You can update your details in the app and apply again, or reply to this email if you have a question.', tone: 'muted' });
  return build(
    'Your LANCHAI business account application',
    'We couldn’t approve it this time — here’s why',
    'Business account application',
    [
      {
        type: 'hero',
        pill: 'Business account',
        title: 'We couldn’t approve your application',
        primary: { label: 'Open the app', url: appLink('home') },
      },
      { type: 'card', items },
    ],
    shop,
  );
}

// ── 7. Late return (end of grace / 24h / 48h / 72h) — mirrors the in-app copy ────
// NEVER mention the internal grace period: the first email just says "overdue".
export type LateEmailStage = 'tier1' | 'tier2' | 'tier3' | 'nonReturn';

export function lateReturnEmail(
  _name: string,
  stage: LateEmailStage,
  r: { id: string; productName: string; returnLabel: string },
  amountLak: number,
  shop: EmailShop,
): Rendered {
  const amount = fmtLak(amountLak);
  const copy: Record<LateEmailStage, { subject: string; preheader: string; pill: string; title: string; body: string }> = {
    tier1: {
      subject: 'Your LANCHAI return is overdue',
      preheader: `A late fee of ${amount} (1 rental day) may apply`,
      pill: 'Return overdue',
      title: 'Your return is overdue',
      body: `Your ${r.productName} is overdue. A late fee of ${amount} (1 rental day) may apply, pending confirmation from our team — please return the item as soon as possible.`,
    },
    tier2: {
      subject: 'Your LANCHAI return is over 24 hours late',
      preheader: `The late fee may now be ${amount} (1.5 rental days)`,
      pill: 'Over 24 hours late',
      title: 'Your return is over 24 hours late',
      body: `Your ${r.productName} is more than 24 hours overdue. The late fee may now be ${amount} (1.5 rental days), pending confirmation from our team — please return it as soon as possible.`,
    },
    tier3: {
      subject: 'Your LANCHAI return is over 48 hours late',
      preheader: `The late fee may now be ${amount} (2 rental days)`,
      pill: 'Over 48 hours late',
      title: 'Your return is over 48 hours late',
      body: `Your ${r.productName} is more than 48 hours overdue. The late fee may now be ${amount} (2 rental days), pending confirmation from our team. After 72 hours, it will be treated as a non-return.`,
    },
    nonReturn: {
      subject: 'Your LANCHAI rental is treated as a non-return',
      preheader: 'Please contact us right away',
      pill: 'Non-return',
      title: 'Your rental is treated as a non-return',
      body: `Your ${r.productName} is now more than 72 hours overdue and is treated as a non-return. Your deposit may be kept and our contract procedure applies. Please contact us right away.`,
    },
  };
  const c = copy[stage];
  return build(
    c.subject,
    c.preheader,
    c.title,
    [
      {
        type: 'hero',
        pill: c.pill,
        title: c.title,
        sub: `${r.productName} · return was due ${r.returnLabel}`,
        primary: { label: 'View my booking', url: appLink(`rentals/${r.id}`) },
        secondary: [directions(shop)],
      },
      { type: 'card', items: [{ type: 'text', text: c.body }] },
      shopCard(shop),
    ],
    shop,
  );
}
