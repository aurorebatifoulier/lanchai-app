// Rental agreement signed at pick-up — the ONE model of its content, used by the app's
// PDF (lib/rentalAgreement.ts), the finalizeRentalAgreement callable and the email.
// Dependency-free (see latePenalty.ts). One agreement per handover SESSION: usually the
// whole order, or only the items handed over together when an order is picked up in
// several visits. Never mentions the internal late-return grace period.

/** Bumped whenever the agreement's wording or layout changes (stamped on each agreement). */
export const AGREEMENT_TEMPLATE_VERSION = '2026-10-29.1';

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

export interface AgreementLine {
  reservationId: string;
  productName: string;
  quantity: number;
  pickupLabel: string;
  returnLabel: string;
  /** Rental amount AFTER coupon (frozen `total`, LAK). */
  total: number;
  depositPerUnit: number;
  /** depositPerUnit × quantity (LAK). */
  deposit: number;
  /** One line per checked category, e.g. "Main item condition: Good". Empty = blank form. */
  condition: string[];
}

export interface AgreementData {
  agreementId: string;
  orderLabel: string;
  shop: { name: string; address: string; email: string; whatsapp: string | null };
  renter: { name: string; phone: string | null; email: string | null; idType: string | null; idCheckedAtLabel: string | null };
  lines: AgreementLine[];
  rentalTotal: number;
  depositTotal: number;
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
  lanchai: 'LANCHAI',
  renter: 'Renter',
  idChecked: (type: string, date: string) => `${type} · checked on ${date}`,
  idNotChecked: 'ID checked at pick-up',
  items: 'Items',
  qty: (n: number) => `× ${n}`,
  from: 'Pick-up',
  to: 'Return',
  rental: 'Rental (after any coupon)',
  deposit: 'Refundable deposit',
  depositDetail: (qty: number, unit: string) => `${qty} × ${unit} LAK`,
  totals: 'Totals',
  totalRental: 'Rental to pay at pick-up',
  totalDeposit: 'Refundable deposit',
  condition: 'Condition at pick-up',
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
} as const;
