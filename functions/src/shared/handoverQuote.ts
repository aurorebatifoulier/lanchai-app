// Pick-up payment quote — the ONE calculation of what the client pays at pick-up, used by
// quoteHandover (Payment step) and re-checked by submitHandover in its transaction.
// Nothing is re-priced: the rental and the deposit are the figures FROZEN at booking
// (createReservations: `subtotal`, `total` after coupon / promo / pack, `deposit` = per
// unit × quantity). The rental and the deposit may be paid in different currencies and
// by different methods (e.g. rental by QR in LAK, deposit in USD cash). Conversion =
// rounded UP to a whole unit (lakToCurrency), the order total first, then prorated per
// line so the lines always add up exactly. Pure, dependency-free.
import { discountOf, orderDiscountOf, type DiscountInput } from './promo';
import { lakToCurrency, type ChargeCurrency } from './returnCharges';

export type PayCurrency = ChargeCurrency; // 'LAK' | 'USD' | 'THB'
export const PAY_CURRENCIES: PayCurrency[] = ['LAK', 'USD', 'THB'];
export type PayMethod = 'cash' | 'bank_transfer' | 'qr';
export const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank_transfer', label: 'Bank transfer' },
  { key: 'qr', label: 'QR' },
];

export interface QuoteLineInput extends DiscountInput {
  reservationId: string;
  productName?: string;
  quantity?: number;
  subtotal?: number;
  total?: number;
  deposit?: number;
}

export interface Rates {
  USD: { rate: number | null; setAtMs: number | null };
  THB: { rate: number | null; setAtMs: number | null };
}

export interface HandoverQuoteLine {
  reservationId: string;
  productName: string;
  quantity: number;
  subtotalLak: number;
  discount: { label: string; amount: number } | null;
  rentalLak: number;
  depositLak: number;
}

/** One currency's figures: whole-order totals + per-line split. */
export interface CurrencyFigures {
  currency: PayCurrency;
  /** LAK per unit (1 for LAK); and when that rate was set. */
  rate: number;
  rateSetAtMs: number | null;
  rental: number;
  deposit: number;
  rentalPerLine: number[];
  depositPerLine: number[];
}

export interface HandoverQuote {
  lines: HandoverQuoteLine[];
  rentalSubtotalLak: number;
  discount: { label: string; amount: number } | null;
  rentalLak: number;
  depositLak: number;
  /** Only the currencies with a rate (LAK always). */
  currencies: Partial<Record<PayCurrency, CurrencyFigures>>;
}

/** Proportional split of `total` by `weights`, remainder on the last line — sums exactly. */
export function prorate(weights: number[], total: number, decimals: number): number[] {
  const scale = 10 ** decimals;
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  const totalScaled = Math.round(total * scale);
  const shares = sum > 0 ? weights.map(w => Math.round((totalScaled * w) / sum)) : weights.map(() => 0);
  shares[shares.length - 1] += totalScaled - shares.reduce((s, v) => s + v, 0);
  return shares.map(v => v / scale);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export function buildHandoverQuote(input: QuoteLineInput[], rates: Rates): HandoverQuote {
  const lines: HandoverQuoteLine[] = input.map(r => {
    const rentalLak = num(r.total ?? r.subtotal);
    return {
      reservationId: r.reservationId,
      productName: String(r.productName ?? ''),
      quantity: Math.max(1, Number(r.quantity ?? 1)),
      subtotalLak: num(r.subtotal ?? r.total),
      discount: discountOf(r),
      rentalLak,
      depositLak: num(r.deposit),
    };
  });
  const rentalLak = lines.reduce((s, l) => s + l.rentalLak, 0);
  const depositLak = lines.reduce((s, l) => s + l.depositLak, 0);
  const currencies: HandoverQuote['currencies'] = {};
  for (const cur of PAY_CURRENCIES) {
    const info = cur === 'LAK' ? { rate: 1, setAtMs: null } : rates[cur];
    if (cur !== 'LAK' && (info.rate == null || !(info.rate > 0))) continue;
    const rental = lakToCurrency(rentalLak, cur, rates.USD.rate, rates.THB.rate)!;
    const deposit = lakToCurrency(depositLak, cur, rates.USD.rate, rates.THB.rate)!;
    currencies[cur] = {
      currency: cur, rate: info.rate!, rateSetAtMs: info.setAtMs,
      rental, deposit,
      rentalPerLine: prorate(lines.map(l => l.rentalLak), rental, cur === 'LAK' ? 0 : 2),
      depositPerLine: prorate(lines.map(l => l.depositLak), deposit, cur === 'LAK' ? 0 : 2),
    };
  }
  return {
    lines,
    rentalSubtotalLak: lines.reduce((s, l) => s + l.subtotalLak, 0),
    discount: orderDiscountOf(input),
    rentalLak,
    depositLak,
    currencies,
  };
}

/** What staff collected: the rental and the deposit, each in its own currency + method. */
export interface PickupPayment {
  rental: { currency: PayCurrency; method: PayMethod };
  deposit: { currency: PayCurrency; method: PayMethod };
}

export function parsePickupPayment(raw: unknown): PickupPayment | null {
  const p = (raw ?? {}) as Record<string, { currency?: unknown; method?: unknown } | undefined>;
  const part = (x: { currency?: unknown; method?: unknown } | undefined) => {
    const currency = PAY_CURRENCIES.find(c => c === x?.currency);
    const method = PAY_METHODS.find(m => m.key === x?.method)?.key;
    return currency && method ? { currency, method } : null;
  };
  const rental = part(p.rental);
  const deposit = part(p.deposit);
  return rental && deposit ? { rental, deposit } : null;
}

/** The two amounts to collect for a payment choice; null when a currency has no rate. */
export function collectFor(q: HandoverQuote, pay: PickupPayment): { rental: number; deposit: number } | null {
  const r = q.currencies[pay.rental.currency];
  const d = q.currencies[pay.deposit.currency];
  return r && d ? { rental: r.rental, deposit: d.deposit } : null;
}

/** handoverChecklist.rentalPaymentMethod key (agreements / receipts): cash_lak… / bank_transfer / qr. */
export function rentalPaymentMethodKey(part: { currency: PayCurrency; method: PayMethod }): string {
  return part.method === 'cash' ? `cash_${part.currency.toLowerCase()}` : part.method;
}

/** "Cash · LAK" / "QR · LAK" / "Bank transfer · USD" — ONE label format everywhere
 *  (staff screens, audit notes, the agreement). */
export function paymentPartLabel(part: { currency: PayCurrency; method: PayMethod }): string {
  return `${PAY_METHODS.find(m => m.key === part.method)!.label} · ${part.currency}`;
}

export const fmtMoney = (n: number, cur: PayCurrency) =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: cur === 'LAK' ? 0 : 2 })} ${cur}`;
