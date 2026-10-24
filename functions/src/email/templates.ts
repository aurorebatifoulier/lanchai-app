import { renderEmail, fmtLak, fmtCurrency, type Block, type Inner, type Button } from './layout';
import type { EmailShop, Rates, Recipient } from './context';
import { appLink, reviewLink } from './config';
import { googleCalendarUrl, icsAttachment, type CalendarEvent } from './calendar';
import {
  deriveReceiptData, deriveSettlementOutcome, splitHtVat,
  type ReceiptInput, type DepositCurrency,
} from '../shared/receiptData';
import { mapsUrl, openHoursText, CONTACT_EMAIL } from '../shared/shop';
import { CANCELLATION_SUMMARY } from '../shared/policy';
import { vteDay, vteTime, vteDayTime } from '../shared/dates';
import { nextLateThresholdMs, computeLatePenalty, formatPenaltyDays } from '../shared/latePenalty';
import { BTOB_REJECTION_REASONS, BTOB_REVIEW_TIME_NOTE, btobNeedLine, type BtobRejectionKey } from '../shared/btob';
import { loyaltyPointsFor, TIER_LABELS, type LoyaltyTierKey } from '../shared/loyalty';
import { buildReceiptSummary } from '../shared/receiptSummary';
import { RESIDENCY_REJECTION_REASONS, type ResidencyRejectionKey } from '../shared/residency';
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
  /** Explicit staff waivers — shown as "… · waived by our team" (buildReceiptSummary). */
  lateChargeWaived?: boolean;
  damageChargeWaived?: boolean;
  outstandingSettledBy?: string;
  outstandingWrittenOffBy?: string;
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
    // Same build-up as the app's confirmation screen (CLAUDE.md): VAT split of the
    // post-coupon total, for every customer type; the deposit never goes through VAT.
    // vatPercent null = VAT display off (vatDisplayPercent) → plain total only.
    inner.push({ type: 'divider' });
    if (discount > 0) inner.push({ type: 'row', label: 'Coupon', value: `− ${fmtLak(discount)}`, tone: 'muted' });
    if (opts.vatPercent != null) {
      const { ht, vat } = splitHtVat(total, opts.vatPercent);
      inner.push({ type: 'row', label: 'Subtotal (excl. VAT)', value: fmtLak(ht), tone: 'muted' });
      inner.push({ type: 'row', label: `VAT (${opts.vatPercent}%)`, value: fmtLak(vat), tone: 'muted' });
    }
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
  const orderId = orderIdOf([r]);
  const outcome = deriveSettlementOutcome(r, data);
  const hasCharges = (r.chargeAmount ?? 0) > 0 || (r.lateChargeAmount ?? 0) > 0;
  const hasWaiver = !!r.lateChargeWaived || !!r.damageChargeWaived;
  const cur: DepositCurrency = data.depositCurrency;
  const fmt = (n: number) => fmtCurrency(n, cur);
  const returnedMs = r.returnedAtMs ?? r.returnAtMs;

  // ONE summary card — the SAME lines as the app's receipt screen and PDF
  // (buildReceiptSummary, shared/receiptSummary.ts). Never staff names.
  const { lines, totalLabel, totalValues } = buildReceiptSummary(r, vatPercent);
  const summary: Inner[] = [];
  if (!hasCharges && !hasWaiver && outcome.kind === 'owedToClient') {
    summary.push({ type: 'outcome', title: 'Deposit refunded in full', text: 'Checked — all good' });
  }
  for (const l of lines) {
    if (l.kind === 'row') {
      summary.push({ type: 'row', label: l.label, value: l.value, strong: l.strong, tone: l.danger ? 'danger' : undefined, gapTop: l.strong ? 4 : undefined });
    } else {
      summary.push({ type: 'subtle', text: l.kind === 'pill' ? l.label : l.text });
    }
  }
  summary.push({ type: 'divider' });
  summary.push({ type: 'row', label: totalLabel, value: totalValues.join(' '), strong: true });
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
    { type: 'card', title: hasCharges || hasWaiver ? 'Your rental summary' : undefined, items: summary },
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
// No company name in titles (greet the person). Presets from shared/btob.ts.

export interface BtobApprovedContext {
  firstName: string;
  /** config/loyalty.depositPercentByType.business — 0 = no deposit, 100 = standard. */
  businessDepositPercent: number | null;
  /** VAT display on (vatDisplayPercent) — otherwise no "VAT-ready" wording. */
  showVat?: boolean;
}

export function btobApprovedEmail(_name: string, shop: EmailShop, ctx: BtobApprovedContext): Rendered {
  const pct = ctx.businessDepositPercent;
  const noDeposit = pct === 0;
  const wa = whatsappUrl(shop, 'Hi LANCHAI, I\'d like a quote for… ');
  const items: Inner[] = [];
  if (noDeposit) items.push({ type: 'bullet', text: 'No deposit on your rentals', icon: { name: 'shield-check', alt: 'No deposit' } });
  else if (pct != null && pct > 0 && pct < 100) items.push({ type: 'bullet', text: `Reduced deposit: ${pct}% of the standard amount`, icon: { name: 'shield-check', alt: 'Reduced deposit' } });
  items.push(
    { type: 'bullet', text: ctx.showVat ? 'VAT-ready receipts — prices excl. VAT, ready for your accounting' : 'Clear receipts for your accounting', icon: { name: 'receipt', alt: 'Receipts' } },
    { type: 'bullet', text: shop.paymentMethods, icon: { name: 'bank', alt: 'Payment' } },
    { type: 'bullet', text: 'Several items in one order — perfect for events', icon: { name: 'shopping-bag', alt: 'Orders' } },
  );
  return build(
    'Welcome to LANCHAI Business',
    ctx.showVat
      ? (noDeposit ? 'No deposit, VAT-ready receipts — start booking' : 'VAT-ready receipts — start booking')
      : (noDeposit ? 'No deposit, clear receipts — start booking' : 'Clear receipts — start booking'),
    'Welcome to LANCHAI Business',
    [
      {
        type: 'hero',
        pill: 'Business account approved',
        pillTone: 'success',
        title: 'Welcome to LANCHAI Business!',
        sub: `Hi ${ctx.firstName} — your account is ready.`,
        primary: { label: 'Book your first items', url: appLink('explore') },
        secondary: wa ? [{ label: 'Ask for a quote', url: wa, icon: 'whatsapp' }] : undefined,
      },
      { type: 'card', title: 'What your business account includes', items },
      ...(wa ? [{ type: 'center' as const, text: 'Planning something big?', link: { label: 'Message us for a tailored quote.', url: wa } }] : []),
    ],
    shop,
  );
}

export interface BtobRejectedContext {
  firstName: string;
  reason: BtobRejectionKey | null;
  text: string | null;
  fixable: boolean;
}

export function btobRejectedEmail(_name: string, shop: EmailShop, ctx: BtobRejectedContext): Rendered {
  const preset = ctx.reason ? BTOB_REJECTION_REASONS[ctx.reason] : null;
  const wa = whatsappUrl(shop, 'Hi LANCHAI, about my business account application: ');
  const message: Button[] = wa ? [{ label: 'Message us', url: wa, icon: 'whatsapp' }] : [];
  const extra = ctx.text?.trim();

  if (ctx.fixable) {
    // Variant A — something to fix, then resubmit from the app.
    const inner: Inner[] = [];
    if (preset?.need) inner.push({ type: 'text', text: preset.need });
    for (const b of preset?.needBullets ?? []) inner.push({ type: 'bullet', text: b.text, icon: { name: b.icon, alt: b.icon === 'camera' ? 'Photo' : 'PDF' } });
    if (extra) inner.push({ type: 'text', text: extra, tone: 'muted' });
    if (BTOB_REVIEW_TIME_NOTE) inner.push({ type: 'text', text: BTOB_REVIEW_TIME_NOTE, tone: 'muted', small: true });
    return build(
      'Action needed: your LANCHAI business account',
      btobNeedLine(ctx.reason),
      'Your business account application',
      [
        {
          type: 'hero',
          pill: 'Business account',
          title: 'Almost there — we just need one more thing',
          sub: `Hi ${ctx.firstName}`,
          primary: { label: 'Update my application', url: appLink('profile/business-document') },
          secondary: message.length ? message : undefined,
        },
        { type: 'card', title: 'What we need', items: inner },
        // Pending/rejected business accounts can browse (app/_layout.tsx gating).
        { type: 'center', text: 'In the meantime, you can still browse the catalogue in the app.' },
      ],
      shop,
    );
  }

  // Variant B — final.
  const inner: Inner[] = [];
  const sentence = preset?.reason ?? (ctx.reason === 'other' ? null : 'We couldn’t approve your business account.');
  if (sentence) inner.push({ type: 'text', text: sentence });
  if (extra) inner.push({ type: 'text', text: extra, tone: sentence ? 'muted' : undefined });
  inner.push({ type: 'text', text: 'Thank you for your interest in LANCHAI. If you think this is a mistake, just reply to this email or message us — we’re happy to take another look.', tone: 'muted', small: true });
  return build(
    'Your LANCHAI business account application',
    'We couldn’t approve it this time',
    'Your business account application',
    [
      {
        type: 'hero',
        pill: 'Business account',
        title: 'We couldn’t approve your application',
        sub: `Hi ${ctx.firstName}`,
        // Rejected business accounts can still browse the catalogue.
        primary: { label: 'Browse the catalogue', url: appLink('explore') },
        secondary: message.length ? message : undefined,
      },
      { type: 'card', title: 'Reason', items: inner },
    ],
    shop,
  );
}

// ── 7. Late return (end of grace / 24h / 48h / 72h) — ONE email per order ───────
// NEVER mention or hint at the internal grace period: the first email just says
// "overdue". Fees come from computeLatePenalty (passed in as latePenaltyAmount/Days),
// thresholds from the shared LATE_TIERS (nextLateThresholdMs) — no formula here.
export type LateEmailStage = 'tier1' | 'tier2' | 'tier3' | 'nonReturn';

/** A late line of the order, with its own current stage (lines can differ). */
export interface LateLine { r: ResData; stage: LateEmailStage }

export interface LateEmailContext {
  firstName: string;
  orderId: string;
  /** bookingHolds is active for this renter (always after the grace, except admins). */
  holdActive: boolean;
}

/**
 * Current fee, next threshold and the fee just after it, for an order's late lines —
 * shared by the email and scripts/simulate-late-returns.js. Next threshold = earliest
 * nextLateThresholdMs over the lines; next fee = computeLatePenalty for every line at
 * that threshold + 1 ms (upper bounds are inclusive), summed — exactly what will be
 * suggested then (lines whose own tier hasn't ended keep their amount). Past 24h the
 * grace setting can't matter, so the default is passed. No next fee at tier3 (the next
 * step is the non-return) or at non-return.
 */
export function lateFeeSummary(lines: LateLine[], stage: LateEmailStage): {
  amountLak: number; next: number | null; nextAmountLak: number | null; nextDays: number | null;
} {
  const amountLak = lines.reduce((s, l) => s + (l.r.latePenaltyAmount ?? 0), 0);
  const thresholds = lines.map(l => nextLateThresholdMs(l.r.returnAtMs, l.stage)).filter((x): x is number => x != null);
  const next = thresholds.length ? Math.min(...thresholds) : null;
  if (next == null || stage === 'tier3' || stage === 'nonReturn') return { amountLak, next, nextAmountLak: null, nextDays: null };
  const after = lines.map(l => computeLatePenalty({
    returnAtMs: l.r.returnAtMs, nowMs: next + 1, pricePerDay: l.r.pricePerDay, quantity: l.r.quantity, graceHours: undefined,
  }));
  return {
    amountLak, next,
    nextAmountLak: after.reduce((s, p) => s + p.amountLak, 0),
    nextDays: after.every(p => p.days === after[0].days) ? after[0].days : null,
  };
}

export function lateReturnEmail(
  _name: string,
  stage: LateEmailStage,
  lines: LateLine[],
  shop: EmailShop,
  ctx: LateEmailContext,
): Rendered {
  const items = [...lines].sort((a, b) => a.r.returnAtMs - b.r.returnAtMs || a.r.id.localeCompare(b.r.id));
  const first = items[0].r;
  const at = (ms: number) => `${vteDay(ms)} at ${vteTime(ms)}`;
  const amount = fmtLak(items.reduce((s, l) => s + (l.r.latePenaltyAmount ?? 0), 0));
  const days = items[0].r.latePenaltyDays ?? 0;
  const sameDays = items.every(l => (l.r.latePenaltyDays ?? 0) === days);
  const { next, nextAmountLak, nextDays } = lateFeeSummary(items, stage);
  const nextAmount = nextAmountLak != null ? fmtLak(nextAmountLak) : null;
  const goesUp = next != null && nextAmount
    ? `after that, the fee goes up to ${nextAmount}${nextDays ? ` (${formatPenaltyDays(nextDays).replace(/days?$/, m => `rental ${m}`)})` : ''}`
    : null;
  const feePreheader = next != null && nextAmount
    ? `Late fee so far: ${amount} · it goes up to ${nextAmount} after ${at(next)}`
    : `Late fee so far: ${amount}`;
  const productLabel = items.length > 1 ? `${first.productName} + ${items.length - 1} more` : first.productName;

  // Deposit held at handover, in its original currency, summed per currency.
  const depositByCur = new Map<DepositCurrency, number>();
  for (const { r } of items) {
    const cur = r.handoverChecklist?.depositCurrency ?? 'LAK';
    depositByCur.set(cur, (depositByCur.get(cur) ?? 0) + (r.handoverChecklist?.depositAmount ?? r.deposit ?? 0));
  }
  const depositText = [...depositByCur].filter(([, v]) => v > 0).map(([c, v]) => fmtCurrency(v, c)).join(' + ');

  const wa = whatsappUrl(shop, `Hi LANCHAI, about my late return ${ctx.orderId}…`);
  const mail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Late return ${ctx.orderId}`)}`;
  const messageUs = (label: string): Button => (wa ? { label, url: wa, icon: 'whatsapp' } : { label: 'Email us', url: mail });
  const dir = directions(shop);

  const copy: Record<LateEmailStage, {
    subject: string; preheader: string; pill: string; pillTone?: 'alert' | 'danger'; title: string;
    primary: Button; secondary: Button[];
  }> = {
    tier1: {
      subject: `Your LANCHAI return is overdue · ${productLabel}`,
      preheader: feePreheader,
      pill: 'Return overdue',
      title: 'Running late?',
      primary: dir,
      secondary: [messageUs('Can’t make it today? Message us')],
    },
    tier2: {
      subject: `Please return your item today · ${productLabel}`,
      preheader: feePreheader,
      pill: 'Over 24 hours late',
      title: 'Please return your item today',
      primary: dir,
      secondary: [messageUs('Can’t make it today? Message us')],
    },
    tier3: {
      subject: `Your LANCHAI return is 2 days late · ${productLabel}`,
      preheader: `Late fee so far: ${amount} · please contact us or return it today`,
      pill: 'Over 48 hours late',
      pillTone: 'alert',
      title: 'Your return is 2 days late',
      primary: wa ? { label: 'Message us', url: wa, icon: 'whatsapp' } : { label: 'Email us', url: mail },
      secondary: [dir],
    },
    nonReturn: {
      subject: 'Your LANCHAI rental is treated as a non-return',
      preheader: 'Please contact us right away',
      pill: 'Non-return',
      pillTone: 'danger',
      title: 'Please contact us right away',
      primary: wa ? { label: 'Contact us now', url: wa, icon: 'whatsapp' } : { label: 'Contact us now', url: mail },
      secondary: [dir],
    },
  };
  const c = copy[stage];

  const feeCard: Block = stage === 'nonReturn'
    ? {
        type: 'card',
        items: [{
          type: 'text',
          text: 'Your rental is now more than 72 hours late and is treated as a non-return. Your deposit may be kept and our contract procedure applies. If you still have the item, contact us — we’ll find the simplest way to sort it out.',
        }],
      }
    : {
        type: 'card',
        title: 'Late fee so far',
        items: [
          { type: 'amount', label: sameDays ? `${days} rental ${days === 1 ? 'day' : 'days'}` : 'Total', value: amount },
          ...(next ? [stage === 'tier3'
            ? { type: 'notice' as const, tone: 'alert' as const, text: `After 72 hours (${at(next)}), it will be treated as a non-return.` }
            : { type: 'notice' as const, tone: 'amber' as const, icon: { name: 'clock' as const, alt: 'Deadline' }, text: goesUp ? `Return before ${at(next)} — ${goesUp}.` : `Return before ${at(next)}.` }] : []),
          {
            type: 'text', tone: 'muted', small: true,
            text: depositText
              ? `Deducted from your ${depositText} deposit at return — the rest is refunded on the spot. The final amount is confirmed by our team at return.`
              : 'Settled at return. The final amount is confirmed by our team at return.',
          },
        ],
      };

  // "Your items": the due time once when identical, otherwise per item.
  const sameDue = items.every(l => l.r.returnAtMs === first.returnAtMs);
  const itemLines: Inner[] = [];
  if (sameDue) itemLines.push({ type: 'dates', text: `Was due ${at(first.returnAtMs)}` });
  for (const { r } of items) {
    itemLines.push({
      type: 'line',
      name: r.quantity > 1 ? `${r.productName} × ${r.quantity}` : r.productName,
      detail: sameDue ? undefined : `Was due ${at(r.returnAtMs)}`,
      compact: sameDue,
    });
  }

  const blocks: Block[] = [
    {
      type: 'hero',
      pill: c.pill,
      pillTone: c.pillTone,
      title: c.title,
      sub: `Hi ${ctx.firstName} · Order ${ctx.orderId}`,
      primary: c.primary,
      secondary: c.secondary,
    },
    feeCard,
    { type: 'card', title: 'Your items', items: itemLines },
    shopCard(shop, undefined, 'Return'),
  ];
  if (ctx.holdActive) blocks.push({ type: 'center', strong: true, text: 'New bookings are paused until this rental is returned.' });
  blocks.push({ type: 'center', text: 'Already returned it? Please ignore this email.' });
  return build(c.subject, c.preheader, c.title, blocks, shop);
}

// ── 8. Account security — password reset / email verification ───────────────────
// Sent by the requestPasswordReset / requestEmailVerification callables (authEmails.ts)
// with `security: true` (always to the account's own address). `link` is the Firebase
// action link (lanchai-app.firebaseapp.com/__/auth/action) — never logged.

// Firebase doesn't publish the reset-link lifetime (and says it may change), so no
// number here. Edit this ONE line to state a duration if Firebase ever documents one.
export const RESET_LINK_EXPIRY_NOTE = 'For your security, this link expires soon — if it no longer works, just request a new one.';

export function passwordResetEmail(link: string, shop: EmailShop): Rendered {
  return build(
    'Reset your LANCHAI password',
    'Choose a new password in one tap',
    'Reset your password',
    [
      {
        type: 'hero',
        pill: 'Account security',
        pillIcon: 'lock',
        title: 'Reset your password',
        sub: 'We received a request to reset the password of your LANCHAI account.',
        primary: { label: 'Choose a new password', url: link },
        footnote: RESET_LINK_EXPIRY_NOTE,
      },
      {
        type: 'card',
        items: [{
          type: 'iconNote',
          icon: { name: 'shield-check', alt: 'Security' },
          title: 'Didn’t ask for this?',
          text: 'You can safely ignore this email — your password stays the same and your account is secure.',
        }],
      },
    ],
    shop,
  );
}

export function emailVerificationEmail(link: string, shop: EmailShop): Rendered {
  return build(
    'Confirm your LANCHAI email',
    'One tap to confirm your account',
    'Confirm your email',
    [
      {
        type: 'hero',
        pill: 'Welcome',
        title: 'Confirm your email',
        sub: 'One last step to finish setting up your LANCHAI account.',
        primary: { label: 'Confirm my email', url: link },
        footnote: 'If you didn’t create an account, you can ignore this email.',
      },
    ],
    shop,
  );
}

// ── 9. Identity & residency — never include the documents themselves ─────────────
// Sent by functions/src/identity.ts (verified / declined) and functions/src/residency.ts
// (approved / rejected A-B / expired). Links open ID & residency in the app.

export function idVerifiedEmail(shop: EmailShop, ctx: { firstName: string; idRetentionMonths: number }): Rendered {
  return build(
    'Your LANCHAI ID is verified',
    'Your next pick-ups will be faster',
    'Your ID is verified',
    [
      {
        type: 'hero',
        pill: 'Identity verified',
        pillTone: 'success',
        title: 'Your ID is verified',
        sub: `Hi ${ctx.firstName} — we checked your ID with you at pick-up, so your next pick-ups will be faster.`,
        primary: { label: 'Browse the catalogue', url: appLink('explore') },
      },
      {
        type: 'card',
        items: [
          {
            type: 'iconNote',
            icon: { name: 'shield-check', alt: 'Privacy' },
            title: 'How we keep your ID',
            text: `We keep your ID document while you have a rental in progress and for ${plural(ctx.idRetentionMonths, 'month')} after your last rental, then delete it automatically. Only you and our staff can see it.`,
          },
          { type: 'text', text: 'You can see it or ask us to delete it anytime in the app: Account › ID & residency.', tone: 'muted', small: true },
        ],
      },
    ],
    shop,
  );
}

export function idDeclinedEmail(shop: EmailShop, ctx: { firstName: string; text: string }): Rendered {
  const wa = whatsappUrl(shop, 'Hi LANCHAI, about my ID document: ');
  return build(
    'Action needed: please add a new ID',
    'Your ID document couldn\u2019t be accepted',
    'Please add a new ID',
    [
      {
        type: 'hero',
        pill: 'Identity',
        title: 'Please add a new ID',
        sub: `Hi ${ctx.firstName}`,
        primary: { label: 'Update my ID', url: appLink('profile/id-residency') },
        secondary: wa ? [{ label: 'Message us', url: wa, icon: 'whatsapp' }] : undefined,
      },
      {
        type: 'card',
        title: 'What we need',
        items: [
          { type: 'text', text: ctx.text },
          { type: 'bullet', text: 'A sharp photo, all four corners visible', icon: { name: 'camera', alt: 'Photo' } },
          { type: 'text', text: 'New bookings are paused until you add a new ID document.', tone: 'muted', small: true },
        ],
      },
    ],
    shop,
  );
}

export function residencyApprovedEmail(shop: EmailShop, ctx: { firstName: string; validUntilMs: number | null }): Rendered {
  return build(
    'You\u2019re verified as a resident',
    'Your reduced deposit applies to your next bookings',
    'Resident status approved',
    [
      {
        type: 'hero',
        pill: 'Resident status approved',
        pillTone: 'success',
        title: 'You\u2019re verified as a resident',
        sub: `Hi ${ctx.firstName} — your reduced deposit applies to your next bookings.`,
        note: ctx.validUntilMs ? `Valid until ${vteDay(ctx.validUntilMs)} ${new Date(ctx.validUntilMs + 7 * 3_600_000).getUTCFullYear()}` : undefined,
        primary: { label: 'Browse the catalogue', url: appLink('explore') },
      },
      {
        type: 'card',
        items: [
          { type: 'iconNote', icon: { name: 'shield-check', alt: 'Privacy' }, title: 'Your documents', text: 'We delete your proof of residence shortly after our decision and keep only a short record of the check.' },
          ...(ctx.validUntilMs ? [{ type: 'text' as const, text: 'Before that date, send updated documents in the app (Account › ID & residency) to keep the reduced deposit.', tone: 'muted' as const, small: true }] : []),
        ],
      },
    ],
    shop,
  );
}

export function residencyRejectedEmail(
  shop: EmailShop,
  ctx: { firstName: string; reason: ResidencyRejectionKey | null; text: string | null; fixable: boolean },
): Rendered {
  const preset = ctx.reason ? RESIDENCY_REJECTION_REASONS[ctx.reason] : null;
  const wa = whatsappUrl(shop, 'Hi LANCHAI, about my resident status: ');
  const message: Button[] = wa ? [{ label: 'Message us', url: wa, icon: 'whatsapp' }] : [];
  const extra = ctx.text?.trim();
  const inner: Inner[] = [];
  if (preset?.text) inner.push({ type: 'text', text: preset.text });
  if (extra) inner.push({ type: 'text', text: extra, tone: preset?.text ? 'muted' : undefined });

  if (ctx.fixable) {
    inner.push({ type: 'text', text: 'Until then, the standard deposit applies.', tone: 'muted', small: true });
    return build(
      'Action needed: your LANCHAI resident status',
      'We need one more thing to verify your status',
      'Your resident status',
      [
        {
          type: 'hero',
          pill: 'Resident status',
          title: 'Almost there — we just need one more thing',
          sub: `Hi ${ctx.firstName}`,
          primary: { label: 'Update my documents', url: appLink('profile/id-residency') },
          secondary: message.length ? message : undefined,
        },
        { type: 'card', title: 'What we need', items: inner },
      ],
      shop,
    );
  }
  inner.push({ type: 'text', text: 'You can still rent with the standard deposit. If you think this is a mistake, just reply to this email or message us.', tone: 'muted', small: true });
  return build(
    'Your LANCHAI resident status',
    'We couldn\u2019t approve it this time',
    'Your resident status',
    [
      {
        type: 'hero',
        pill: 'Resident status',
        title: 'We couldn\u2019t approve your resident status',
        sub: `Hi ${ctx.firstName}`,
        primary: { label: 'Browse the catalogue', url: appLink('explore') },
        secondary: message.length ? message : undefined,
      },
      { type: 'card', title: 'Reason', items: inner },
    ],
    shop,
  );
}

export function residencyExpiredEmail(shop: EmailShop, ctx: { firstName: string }): Rendered {
  return build(
    'Your LANCHAI resident status has expired',
    'Update your documents to keep the reduced deposit',
    'Resident status expired',
    [
      {
        type: 'hero',
        pill: 'Resident status',
        title: 'Your resident status has expired',
        sub: `Hi ${ctx.firstName} — update your documents to keep the reduced deposit on your next bookings.`,
        primary: { label: 'Update my documents', url: appLink('profile/id-residency') },
      },
      {
        type: 'card',
        items: [{ type: 'text', text: 'Until then, the standard deposit applies to new bookings. Bookings you already made keep their deposit.', tone: 'muted' }],
      },
    ],
    shop,
  );
}

// ── 10. Welcome — once, after the email address is verified (sendWelcomeEmail) ─────
export function welcomeEmail(shop: EmailShop, ctx: { firstName: string; residentSavingPct: number | null }): Rendered {
  return build(
    'Welcome to LANCHAI',
    'Rent. Return. Repeat. — here\u2019s how it works',
    'Welcome to LANCHAI',
    [
      {
        type: 'hero',
        pill: 'Welcome',
        title: 'Welcome to LANCHAI',
        sub: `Hi ${ctx.firstName} — why buy it when you can rent it?`,
        primary: { label: 'Browse the catalogue', url: appLink('explore') },
      },
      {
        type: 'card',
        title: 'How it works',
        items: [
          { type: 'bullet', text: 'Book in the app — nothing to pay online', icon: { name: 'shopping-bag', alt: 'Book' } },
          { type: 'bullet', text: 'Pick up at the shop — pay there, bring your ID', icon: { name: 'map-pin', alt: 'Pick up' } },
          { type: 'bullet', text: 'Return and get your deposit back on the spot', icon: { name: 'check-circle', alt: 'Return' } },
        ],
      },
      {
        type: 'card',
        title: 'Live in Vientiane? Get a lower deposit',
        items: [
          {
            type: 'text',
            text: ctx.residentSavingPct
              ? `Residents pay a ${ctx.residentSavingPct}% lower deposit. Verify your status once in the app.`
              : 'Residents pay a lower deposit. Verify your status once in the app.',
          },
          { type: 'button', label: 'Verify my status', url: appLink('profile/id-residency') },
        ],
      },
    ],
    shop,
  );
}
