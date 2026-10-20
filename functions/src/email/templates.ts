import { renderEmail, fmtLak, fmtCurrency, type Block, type Inner, type Button } from './layout';
import type { EmailShop, Rates, Recipient } from './context';
import { appLink, reviewLink } from './config';
import { googleCalendarUrl, icsAttachment, type CalendarEvent } from './calendar';
import {
  deriveReceiptData, deriveSettlementOutcome, splitHtVat, DEFAULT_VAT_PERCENT,
  type ReceiptInput, type DepositCurrency,
} from '../shared/receiptData';
import { mapsUrl, openHoursText, CONTACT_EMAIL } from '../shared/shop';
import { CANCELLATION_SUMMARY } from '../shared/policy';
import { vteDay, vteTime, vteDayTime } from '../shared/dates';
import { loyaltyPointsFor, TIER_LABELS, type LoyaltyTierKey } from '../shared/loyalty';
import {
  cancellationOutcome, CANCEL_REASONS, type CancelReason, type CancellationOutcome,
} from '../shared/cancellation';

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
  productId?: string;
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
  /** Product's "What's included" list (products/{id}.whatsIncluded), when loaded. */
  included?: string[];
  /** Product data loaded at send time (cancellation email). */
  isPremium?: boolean;
  categoryId?: string;
  /** Optional advance paid before pick-up — never set today (see shared/cancellation.ts). */
  advancePaidLak?: number;
  cancelledAtMs?: number;
  /** Actual return time (returnedAt), when set. */
  returnedAtMs?: number;
  /** Late-penalty suggestion frozen by lateReturnAlerts (LAK) and its rental days. */
  latePenaltyAmount?: number;
  latePenaltyDays?: number;
  chargePercent?: number;
  /** Frozen first product image (public URL) and the review-reward marker. */
  productImage?: string | null;
  reviewRewardApplied?: boolean;
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
export function returnReminderEmail(
  _name: string, rawItems: ResData[], shop: EmailShop, recipient?: Pick<Recipient, 'loyaltyExcluded'>,
): Rendered {
  const items = [...rawItems].sort((a, b) => a.returnAtMs - b.returnAtMs || a.id.localeCompare(b.id));
  const first = items[0];
  const orderId = orderIdOf(items);
  const day = vteDay(first.returnAtMs);
  const time = vteTime(first.returnAtMs);
  const sameReturn = items.every(r => r.returnAtMs === first.returnAtMs);
  const returnBy = (ms: number) => `Return by ${vteDay(ms)} at ${vteTime(ms)}`;
  const deposit = items.reduce((s, r) => s + (r.deposit ?? 0), 0);
  // Same rule as applyLoyaltyPoints (per reservation, on the frozen pre-coupon subtotal).
  const points = items.reduce((s, r) => s + loyaltyPointsFor(r.subtotal), 0);
  const wa = whatsappUrl(shop, `Hi LANCHAI, I'd like to extend my rental ${orderId}.`);

  const secondary: Button[] = [directions(shop)];
  if (wa) secondary.push({ label: 'Need more time?', url: wa, icon: 'whatsapp' });

  // "Your items": the return deadline only (once, or per item when it differs), names
  // with "× qty", and the product's "What's included" list when the product has one.
  const itemLines: Inner[] = [];
  if (sameReturn) itemLines.push({ type: 'dates', text: returnBy(first.returnAtMs) });
  for (const r of items) {
    const detail: string[] = [];
    if (!sameReturn) detail.push(returnBy(r.returnAtMs));
    if (r.included?.length) detail.push(`Included: ${r.included.join(', ')}`);
    itemLines.push({
      type: 'line',
      name: r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName,
      detail: detail.length ? detail : undefined,
      compact: detail.length === 0,
    });
  }

  const depositItems: Inner[] = [
    { type: 'amount', label: 'Your deposit', value: fmtLak(deposit) },
    { type: 'text', text: 'Refunded on the spot after a quick check — about 10 minutes.', tone: 'muted', small: true },
  ];
  if (points > 0 && !recipient?.loyaltyExcluded) {
    depositItems.push(
      { type: 'divider' },
      { type: 'bullet', text: `Return it and earn ${plural(points, 'point')}`, icon: { name: 'star', alt: 'Loyalty points' } },
    );
  }

  return build(
    `Return due tomorrow · ${day} at ${time}`,
    'Bring everything back and get your deposit refunded on the spot',
    'Return due tomorrow',
    [
      {
        type: 'hero',
        pillParts: [{ text: 'Rent.' }, { text: 'Return.', highlight: true }, { text: 'Repeat.' }],
        title: `Return due tomorrow, ${day} at ${time}`,
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: bookingLink(items),
        secondary,
      },
      { type: 'card', title: 'Your items', items: itemLines },
      {
        type: 'card',
        title: 'Before you come',
        items: [
          { type: 'bullet', text: 'All parts and accessories', icon: { name: 'checklist', alt: 'Checklist' } },
          { type: 'bullet', text: 'Clean and dry — no need to wash it', icon: { name: 'sparkles', alt: 'Clean' } },
          { type: 'bullet', text: 'Your booking QR code (app › My rentals)', icon: { name: 'qr-code', alt: 'QR code' } },
        ],
      },
      { type: 'card', items: depositItems },
      shopCard(shop, undefined, 'Return'),
      // Never mention the internal late-return grace period here.
      { type: 'center', text: 'Please return on time — late returns may add rental days.' },
    ],
    shop,
  );
}

// ── 4. Cancellation — variant A (customer) / B (LANCHAI) ─────────────────────────
export interface CancellationContext {
  variant: 'A' | 'B';
  reason?: CancelReason | null;
  reasonText?: string | null;
  /** Lines of the same order that are still reserved (partial cancellation). */
  stillReserved: ResData[];
}

const HOUR = 60 * 60 * 1000;

/** Per-order outcome, from the SAME rules as the app (shared/cancellation.ts). */
function orderOutcome(items: ResData[], byLanchai: boolean): { kind: CancellationOutcome['kind']; amountLak: number; validUntilMs?: number } {
  const outcomes = items.map(r => cancellationOutcome({
    advancePaidLak: r.advancePaidLak,
    hoursUntilPickup: (r.pickupAtMs - (r.cancelledAtMs ?? Date.now())) / HOUR,
    isPremium: r.isPremium,
    byLanchai,
    cancelledAtMs: r.cancelledAtMs,
  }));
  // Most significant outcome for the headline; amounts summed over the lines that have it.
  const order: CancellationOutcome['kind'][] = ['retained', 'store_credit', 'full_refund', 'nothing_to_pay'];
  const kind = order.find(k => outcomes.some(o => o.kind === k)) ?? 'nothing_to_pay';
  const same = outcomes.filter(o => o.kind === kind) as Exclude<CancellationOutcome, { kind: 'nothing_to_pay' }>[];
  const amountLak = same.reduce((s, o) => s + ('amountLak' in o ? o.amountLak : 0), 0);
  const validUntilMs = same.find((o): o is Extract<CancellationOutcome, { kind: 'store_credit' }> => o.kind === 'store_credit')?.validUntilMs;
  return { kind, amountLak, validUntilMs };
}

function outcomeInner(o: ReturnType<typeof orderOutcome>): Inner {
  switch (o.kind) {
    case 'nothing_to_pay': return { type: 'outcome', title: 'Nothing to pay', text: 'Nothing is charged until you collect your items.' };
    case 'full_refund':    return { type: 'outcome', title: 'Full refund', text: `Your advance of ${fmtLak(o.amountLak)} will be refunded in full.` };
    case 'store_credit':   return { type: 'outcome', title: 'Store credit', text: `Your advance of ${fmtLak(o.amountLak)} becomes a store credit, valid until ${vteDay(o.validUntilMs ?? Date.now())}.` };
    case 'retained':       return { type: 'outcome', title: 'Advance kept', text: `As per our cancellation policy, your advance of ${fmtLak(o.amountLak)} is kept.` };
  }
}

export function cancellationEmail(_name: string, rawItems: ResData[], shop: EmailShop, ctx: CancellationContext): Rendered {
  const items = sortByPickup(rawItems);
  const orderId = orderIdOf(items);
  const byLanchai = ctx.variant === 'B';
  const outcome = orderOutcome(items, byLanchai);
  const same = sameDates(items);

  // "Cancelled items": struck-through dates (once if identical), greyed names, "× n".
  const cancelledInner: Inner[] = [];
  if (same) cancelledInner.push({ type: 'struckDates', text: `${range(items[0])} · ${plural(items[0].durationDays, 'day')}` });
  for (const r of items) {
    cancelledInner.push({
      type: 'line',
      name: r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName,
      detail: same ? undefined : range(r),
      strikeDetail: true,
      muted: true,
      compact: same,
    });
  }

  const blocks: Block[] = [];
  const wa = whatsappUrl(shop, `Hi LANCHAI, about my cancelled order ${orderId}: `);
  if (ctx.variant === 'A') {
    blocks.push({
      type: 'hero',
      pill: 'Booking cancelled',
      title: 'No worries — plans change',
      sub: `${plural(items.length, 'item')} · Order ${orderId}`,
      primary: {
        label: 'Book again',
        url: items.length === 1 && items[0].productId ? appLink(`product/${items[0].productId}`) : appLink('explore'),
      },
      secondary: [{ label: 'View my rentals', url: appLink('reservations') }],
    });
    blocks.push({ type: 'card', items: [outcomeInner(outcome)] });
  } else {
    const preset = ctx.reason ? CANCEL_REASONS[ctx.reason] : null;
    const sentence = preset?.renterSentence ?? 'We had to cancel your booking.';
    const extra = ctx.reasonText?.trim();
    const category = items.find(r => r.categoryId)?.categoryId;
    blocks.push({
      type: 'hero',
      pill: 'Booking cancelled',
      title: 'We’re sorry, we had to cancel',
      sub: `${plural(items.length, 'item')} · Order ${orderId}`,
      primary: { label: 'Find something similar', url: category ? appLink(`category/${category}`) : appLink('explore') },
      secondary: wa ? [{ label: 'Message us', url: wa, icon: 'whatsapp' }] : undefined,
    });
    blocks.push({
      type: 'card',
      title: 'What happened',
      items: [
        { type: 'text', text: sentence },
        ...(extra && ctx.reason === 'other' ? [{ type: 'text' as const, text: extra, tone: 'muted' as const }] : []),
        { type: 'divider' },
        outcomeInner(outcome),
      ],
    });
  }

  if (ctx.stillReserved.length > 0) {
    blocks.push({
      type: 'banner',
      lines: sortByPickup(ctx.stillReserved).map(r =>
        `Still reserved: ${r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName} — ${vteDay(r.pickupAtMs)} at ${vteTime(r.pickupAtMs)}`),
    });
  }

  blocks.push({ type: 'card', title: 'Cancelled items', items: cancelledInner });

  if (ctx.variant === 'A') {
    blocks.push({ type: 'center', text: 'Didn’t request this cancellation? Just reply to this email.' });
  }
  blocks.push({ type: 'center', text: '', link: { label: 'Cancellation policy', url: appLink('legal/cancellation') } });

  const preheader = byLanchai
    ? (outcome.kind === 'full_refund'
      ? 'We’re sorry — your advance will be refunded in full'
      : 'We’re sorry — nothing to pay, let’s find you an alternative')
    : outcome.kind === 'store_credit'
      ? `Your store credit of ${fmtLak(outcome.amountLak)} is ready`
      : outcome.kind === 'nothing_to_pay'
        ? 'Nothing to pay — hope to see you again soon'
        : 'Your booking is cancelled';

  return build(`Your LANCHAI booking is cancelled · ${orderId}`, preheader, 'Booking cancelled', blocks, shop);
}

// ── 4b. Missed pick-up ("We missed you") — friendly, never accusatory ───────────
export function noShowEmail(_name: string, rawItems: ResData[], shop: EmailShop): Rendered {
  const items = sortByPickup(rawItems);
  const orderId = orderIdOf(items);
  const day = vteDay(items[0].pickupAtMs);
  const wa = whatsappUrl(shop, `Hi LANCHAI, I missed my pick-up for order ${orderId} and I'd like to book again.`);
  const contact: Button = wa
    ? { label: 'Message us', url: wa, icon: 'whatsapp' }
    : { label: 'Email us', url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Missed pick-up · ${orderId}`)}` };
  const same = sameDates(items);

  const missedInner: Inner[] = [];
  if (same) missedInner.push({ type: 'struckDates', text: `${range(items[0])} · ${plural(items[0].durationDays, 'day')}` });
  for (const r of items) {
    missedInner.push({
      type: 'line',
      name: r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName,
      detail: same ? undefined : range(r),
      strikeDetail: true,
      muted: true,
      compact: same,
    });
  }

  return build(
    `We missed you · ${orderId}`,
    'Nothing to pay — just send us a message to book again',
    'We missed you',
    [
      {
        type: 'hero',
        pill: 'Missed pick-up',
        title: 'We missed you',
        sub: `${plural(items.length, 'item')} · Order ${orderId}`,
        primary: contact,
        secondary: [{ label: 'View my rentals', url: appLink('reservations') }],
      },
      {
        type: 'card',
        items: [
          { type: 'text', text: `Your pick-up on ${day} didn’t happen, so we’ve released your items for other renters.` },
          { type: 'outcome', title: 'Nothing to pay', text: 'Nothing is charged until you collect your items.' },
          { type: 'divider' },
          { type: 'text', text: 'To keep bookings fair for everyone, new bookings are paused on your account until we hear from you — just send us a quick message and we’ll sort it out.', tone: 'muted' },
        ],
      },
      { type: 'card', title: 'Your booking', items: missedInner },
    ],
    shop,
  );
}

// ── 5. End-of-rental receipt (figures ONLY via deriveReceiptData / deriveSettlementOutcome) ──
export interface ReceiptContext {
  firstName: string;
  /** Renter already reviewed this product → link to the product instead of stars. */
  alreadyReviewed: boolean;
  /** "+N points for your review" — null when the account is excluded or already rewarded. */
  reviewRewardPoints?: number | null;
  /** null = hidden (business/BtoB account, or no points for this rental). */
  loyalty: { earned: number; toNext: number | null; nextTier: LoyaltyTierKey | null; isTop: boolean } | null;
}

function starLinks(r: ResData): string[] {
  return [1, 2, 3, 4, 5].map(n => reviewLink(r.productId ?? '', r.id, n));
}

const rewardLine = (points: number | null | undefined) =>
  points && points > 0 ? `+${points} points for your review` : undefined;

// Compact review block (receipt): small product photo, question, stars (or a product
// link when already reviewed), and the reward line when eligible.
function reviewPrompt(r: ResData, alreadyReviewed: boolean, rewardPoints?: number | null) {
  const image = r.productImage ? { url: r.productImage, alt: r.productName, size: 64 } : undefined;
  return alreadyReviewed || !r.productId
    ? { question: `How was your ${r.productName}?`, image, link: r.productId ? { label: 'See the product', url: appLink(`product/${r.productId}`) } : undefined }
    : { question: `How was your ${r.productName}?`, image, starUrls: starLinks(r), rewardText: rewardLine(rewardPoints) };
}

export function receiptEmail(_name: string, r: ResData, vatPercent: number | null, shop: EmailShop, ctx?: ReceiptContext): Rendered {
  const data = deriveReceiptData(r, vatPercent);
  const cur: DepositCurrency = data.depositCurrency;
  const fmt = (n: number) => fmtCurrency(n, cur);
  const orderId = orderIdOf([r]);
  const outcome = deriveSettlementOutcome(r, data);
  const hasCharges = r.chargeAmount != null || r.lateChargeAmount != null;
  const returnedMs = r.returnedAtMs ?? r.returnAtMs;

  // ONE summary card — every figure from deriveReceiptData / deriveSettlementOutcome.
  const summary: Inner[] = [];
  if (!hasCharges && outcome.kind === 'owedToClient') {
    summary.push({ type: 'outcome', title: 'Deposit refunded in full', text: 'Checked — all good' });
  }
  summary.push({ type: 'row', label: 'Rental fee', value: fmtLak(r.total) });
  summary.push({ type: 'row', label: 'Deposit paid', value: fmt(data.depositHeldAmount) });
  if (r.lateChargeAmount != null) {
    const detail: string[] = [];
    const late = [r.lateChargeReason?.replace(/^Returned\s+/i, ''), r.latePenaltyDays ? `${r.latePenaltyDays} rental ${r.latePenaltyDays === 1 ? 'day' : 'days'}` : null]
      .filter(Boolean).join(' · ');
    if (late) detail.push(late);
    // Only comparable when both are LAK (the suggestion is always LAK).
    if (cur === 'LAK' && r.latePenaltyAmount && r.lateChargeAmount < r.latePenaltyAmount) detail.push('adjusted by our team');
    summary.push({ type: 'line', name: 'Late return', detail, amount: `− ${fmt(r.lateChargeAmount)}`, compact: true });
  }
  if (r.chargeAmount != null) {
    const detail = [r.chargeReason, r.chargePercent != null ? `${r.chargePercent}% of replacement value` : null].filter(Boolean).join(' · ');
    summary.push({ type: 'line', name: 'Damage', detail: detail || undefined, amount: `− ${fmt(r.chargeAmount)}`, compact: true });
  }
  if (outcome.kind === 'clientOwes') {
    summary.push({ type: 'row', label: 'Balance due', value: fmt(outcome.amount), strong: true, tone: 'danger', gapTop: 4 });
    summary.push({ type: 'subtle', text: outcome.resolution === 'settled' ? 'Settled' : outcome.resolution === 'writtenOff' ? 'Written off' : 'Not yet settled' });
  } else if (outcome.kind === 'owedToClient') {
    summary.push({ type: 'row', label: 'Deposit refunded to you', value: fmt(outcome.amount), strong: true, gapTop: 4 });
  } else {
    summary.push({ type: 'row', label: 'Deposit fully used for charges', value: '', strong: true, gapTop: 4 });
  }
  summary.push({ type: 'divider' });
  if (data.netInLak != null) {
    summary.push({ type: 'row', label: 'Total cost of your rental', value: fmtLak(data.netInLak), strong: true });
  } else {
    summary.push({ type: 'row', label: 'Total cost of your rental', value: `${fmtLak(r.total)} + ${fmt(data.chargesTotal)}`, strong: true });
  }
  summary.push({ type: 'subtle', text: `Rental fee includes VAT ${fmtLak(data.vatAmount)} (${data.vatPct}%) · ${fmtLak(data.vatHt)} excl. VAT` });
  summary.push({ type: 'subtle', text: 'PDF receipt in the app: My rentals › this rental' });

  const blocks: Block[] = [
    {
      type: 'hero',
      pill: '✓ Returned',
      title: `Thanks, ${ctx?.firstName ?? 'there'}!`,
      sub: `${r.productName} · Order ${orderId}`,
      note: `Returned ${vteDay(returnedMs)} at ${vteTime(returnedMs)}`,
      reviews: [reviewPrompt(r, ctx?.alreadyReviewed ?? false, ctx?.reviewRewardPoints)],
      secondary: [{ label: 'View my receipt', url: appLink(`rentals/${r.id}`) }],
    },
    { type: 'card', title: hasCharges ? 'Your rental summary' : undefined, items: summary },
  ];

  const loyaltyItems: Inner[] = [];
  if (ctx?.loyalty && ctx.loyalty.earned > 0) {
    const l = ctx.loyalty;
    // isTop only when the loyalty config is known — never claim Platinum without it.
    const tail = l.nextTier && l.toNext != null
      ? ` · ${plural(l.toNext, 'point')} to ${TIER_LABELS[l.nextTier]}`
      : l.isTop ? ' · You’re Platinum — thank you!' : '';
    loyaltyItems.push({ type: 'bullet', text: `+${plural(l.earned, 'point')}${tail}`, icon: { name: 'star', alt: 'Loyalty points' } });
  }
  if (r.productId) loyaltyItems.push({ type: 'button', label: 'Rent again', url: appLink(`product/${r.productId}`) });
  if (loyaltyItems.length) blocks.push({ type: 'card', items: loyaltyItems });

  if (hasCharges) blocks.push({ type: 'center', text: 'Questions about a charge? Just reply to this email.' });

  const preheader = !hasCharges && outcome.kind === 'owedToClient'
    ? 'Deposit refunded in full · thanks for renting with us'
    : outcome.kind === 'owedToClient'
      ? `Deposit refunded: ${fmt(outcome.amount)} · see the details`
      : 'Your rental summary · see the details';
  return build(`Your LANCHAI receipt · ${r.productName}`, preheader, 'Your rental receipt', blocks, shop);
}

// ── 5b. Review follow-up — ONE gentle email, 2 days after return ─────────────────
export function reviewFollowUpEmail(
  _name: string, r: ResData, shop: EmailShop,
  opts: { firstName?: string | null; reviewRewardPoints?: number | null } = {},
): Rendered {
  const title = opts.firstName && opts.firstName !== 'there'
    ? `How was your rental, ${opts.firstName}?`
    : 'How was your rental?';
  return build(
    title,
    'Tap a star — your review helps other renters choose',
    title,
    [
      {
        type: 'hero',
        image: r.productImage ? { url: r.productImage, alt: r.productName, size: 120, caption: r.productName } : undefined,
        title,
        sub: 'It takes 10 seconds — your review helps other renters choose.',
        reviews: [{ question: '', starUrls: starLinks(r), rewardText: rewardLine(opts.reviewRewardPoints) }],
        secondary: r.productId ? [{ label: 'Rent it again', url: appLink(`product/${r.productId}`) }] : undefined,
      },
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
