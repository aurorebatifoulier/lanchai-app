// Rental agreement signed at pick-up — the ONE model of its content, used by the app's
// PDF (lib/rentalAgreement.ts), the finalizeRentalAgreement callable and the email.
// Dependency-free (see latePenalty.ts). One agreement per handover SESSION: usually the
// whole order, or only the items handed over together when an order is picked up in
// several visits. Never mentions the internal late-return grace period.

/** Bumped whenever the agreement's wording or layout changes (stamped on each agreement). */
export const AGREEMENT_TEMPLATE_VERSION = '2026-10-29.3';

export type AgreementMethod = 'signature' | 'paper';

/** `{orderId}-{base36 time}` — new on every signing (a "Sign again" never overwrites). */
export function newAgreementId(orderId: string, nowMs: number): string {
  return `${orderId}-${nowMs.toString(36)}`;
}

/** Server check of a client-proposed id: belongs to that order, safe for a Storage path. */
export function isAgreementIdFor(agreementId: string, orderId: string): boolean {
  return agreementId.startsWith(`${orderId}-`) && /^[A-Za-z0-9_-]{4,80}-[a-z0-9]{6,12}$/.test(agreementId);
}

export const agreementPdfPath = (agreementId: string, method: AgreementMethod) =>
  `rentalAgreements/${agreementId}/${method === 'paper' ? 'paper-agreement' : 'agreement'}.pdf`;

/** How the rental was paid at pick-up — recorded by staff on the handover checklist
 *  (handoverChecklist.rentalPaymentMethod), required before signing. */
export const RENTAL_PAYMENT_METHODS = [
  { key: 'cash_lak', label: 'Cash LAK' },
  { key: 'cash_usd', label: 'Cash USD' },
  { key: 'cash_thb', label: 'Cash THB' },
  { key: 'bank_transfer', label: 'Bank transfer' },
  { key: 'qr', label: 'QR' },
] as const;
export type RentalPaymentMethod = typeof RENTAL_PAYMENT_METHODS[number]['key'];
export const paymentMethodLabel = (k: string | null | undefined) =>
  RENTAL_PAYMENT_METHODS.find(m => m.key === k)?.label ?? null;

export interface AgreementLine {
  reservationId: string;
  productName: string;
  quantity: number;
  pickupLabel: string;
  returnLabel: string;
  durationDays: number;
  /** Booked tier rate per day (LAK). */
  pricePerDay: number;
  /** Before coupon (LAK). */
  subtotal: number;
  /** Coupon / promo on this line (LAK), 0 when none. */
  couponDiscount: number;
  /** "Loyalty coupon (10%)" / "Promo SUMMER10" (shared discountOf), null when none. */
  discountLabel?: string | null;
  /** Rental amount AFTER coupon (frozen `total`, LAK). */
  total: number;
  depositPerUnit: number;
  /** depositPerUnit × quantity (LAK). */
  deposit: number;
  /** What staff actually collected (handover currency), null on the blank form. */
  depositReceived: { amount: number; currency: string } | null;
  /** Elements not rated good ("Accessories · Fair · strap missing"), or "All checked…". Empty = blank form. */
  condition: string[];
  /** Condition photos taken at pick-up; null on the blank form. */
  photoCount: number | null;
}

export interface AgreementData {
  agreementId: string;
  orderLabel: string;
  shop: { name: string; address: string; email: string; whatsapp: string | null };
  renter: { name: string; phone: string | null; email: string | null; idType: string | null; idCheckedAtLabel: string | null };
  lines: AgreementLine[];
  rentalTotal: number;
  depositTotal: number;
  /** Payment method of the rental at pick-up (label), null on the blank form. */
  paymentMethod: string | null;
  /** Deposit actually collected, all items (same handover currency), null on the blank form. */
  depositReceivedTotal: { amount: number; currency: string } | null;
  termsEffectiveDate: string;
  templateVersion: string;
}

/** Older reservations have no depositPerUnit: their deposit was per line. */
export function depositPerUnitOf(r: { deposit: number; depositPerUnit?: number | null; quantity: number }): number {
  return typeof r.depositPerUnit === 'number' && r.depositPerUnit >= 0
    ? r.depositPerUnit
    : Math.round((r.deposit || 0) / Math.max(1, r.quantity || 1));
}

// ── Wording (document + email) — sentence case, plain words ────────────────────

export const AGREEMENT_COPY = {
  title: 'Rental agreement',
  intro: 'This agreement is made between LANCHAI and the renter below for the items listed, under the LANCHAI Terms of service attached at the end of this document.',
  lanchai: 'LANCHAI',  // block title; the block then shows the address lines only
  renter: 'Renter',
  idChecked: (type: string, date: string) => `${type} · checked on ${date}`,
  idNotChecked: 'ID checked at pick-up',
  items: 'Items',
  qty: (n: number) => `× ${n}`,
  from: 'Pick-up',
  to: 'Return',
  rentalDays: (days: number, rate: string) => `${days} ${days === 1 ? 'day' : 'days'} × ${rate} LAK`,
  coupon: 'Coupon',
  rental: 'Rental',
  rentalTotal: 'Rental after coupon',
  deposit: 'Refundable deposit',
  depositDetail: (qty: number, unit: string) => `${qty} × ${unit} LAK`,
  depositReceived: 'Deposit received',
  /** "140 USD (≈ 3,010,000 LAK)", or "3,010,000 LAK". */
  depositAmount: (amount: string, currency: string, lak: string) => (currency === 'LAK' ? `${lak} LAK` : `${amount} ${currency} (≈ ${lak} LAK)`),
  totals: 'Totals',
  paidAtPickup: (amount: string, method: string) => `Rental paid at pick-up: ${amount} LAK · ${method}`,
  toPayAtPickup: (amount: string) => `Rental to pay at pick-up: ${amount} LAK`,
  totalDeposit: 'Refundable deposit',
  condition: 'Condition at pick-up',
  photos: (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'} on file`,
  allGood: 'All checked: good condition',
  conditionBlank: 'Condition noted with you at pick-up:',
  rules: 'Key rules',
  keyRules: [
    'Rental days are counted in 24-hour blocks from the pick-up time above.',
    'Returning late adds rental days: up to 24 hours late adds 1 day, 24–48 hours adds 1.5 days, and 48–72 hours adds 2 days. After 72 hours the rental is treated as a non-return: the deposit may be kept and our contract procedure applies.',
    'Damage: a share of the item’s replacement value is charged, depending on the damage, for each unit concerned. Lost, stolen or damaged beyond repair: the full replacement value of each unit concerned.',
    'The deposit is refunded on the spot at return, after a quick check (about 10 minutes). Charges are deducted from it; if they are more than the deposit, the difference is due.',
    'Our team can reduce or waive late fees and damage charges.',
  ],
  terms: (date: string) => `LANCHAI Terms of service, effective ${date} — attached in full at the end of this document, and available in the app (Account → Legal).`,
  accept: 'I confirm the items’ condition and accept these terms.',
  signature: 'Renter’s signature',
  signedOn: (label: string) => `Signed on ${label}`,
  signedOnBlank: 'Date and time: ______________________',
  paperTitle: 'Signed paper agreement',
  paperNote: (label: string) => `Photo of the paper agreement signed at pick-up, recorded on ${label}.`,
  annex: (date: string) => `Annex — Terms of service (effective ${date})`,
  version: (v: string, id: string) => `Agreement ${id} · template ${v}`,
  pageFooter: (order: string) => `Order ${order} · Page`,
} as const;
