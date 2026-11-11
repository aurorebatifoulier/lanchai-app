// Bookable packs — a pack = a collection with `isPack: true` (collections/{id}): its items
// stay separate reservation lines (stock, deposit, checklist, agreement, late / damage
// unchanged); the pack only gives a discount on the RENTAL price of those lines, never on
// deposits. ONE discount per booking (pack OR loyalty coupon OR promo code).
// Pure and dependency-free (shared app ↔ functions, like latePenalty.ts) — the app's
// previews and createReservations compute the SAME figures. Tests: tests/unit/packs.test.ts.
import { vteEndOfDayMs } from './dates';

export const PACK_DISCOUNT_DEFAULT = 5;
export const PACK_DISCOUNT_MAX = 30;
export const PACK_MAX_ITEMS = 10;
export const PACK_MAX_QTY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PackItem { productId: string; qty: number }
export interface Pack {
  id: string;
  title: string;
  isPack: boolean;
  published: boolean;
  items: PackItem[];
  /** 0–30 (clamped). */
  discountPct: number;
  activeFromMs: number | null;
  activeToMs: number | null;
}

type Millis = number | { toMillis: () => number } | null | undefined;
const msOf = (v: Millis): number | null =>
  typeof v === 'number' ? v : v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null;

export function clampPackPct(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : PACK_DISCOUNT_DEFAULT;
  return Math.min(PACK_DISCOUNT_MAX, Math.max(0, Math.round(n * 10) / 10));
}

/** Sanitises a collections/{id} document into a Pack (items merged, qty 1–10). */
export function packOf(id: string, d: Record<string, unknown>): Pack {
  const merged = new Map<string, number>();
  const raw = Array.isArray(d.items) ? d.items : [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const pid = typeof o.productId === 'string' ? o.productId : '';
    const q = typeof o.qty === 'number' && Number.isFinite(o.qty) ? Math.floor(o.qty) : 1;
    if (!pid) continue;
    merged.set(pid, Math.min(PACK_MAX_QTY, Math.max(1, (merged.get(pid) ?? 0) + Math.max(1, q))));
  }
  return {
    id,
    title: String(d.title ?? ''),
    isPack: d.isPack === true,
    published: d.published === true,
    items: [...merged].slice(0, PACK_MAX_ITEMS).map(([productId, qty]) => ({ productId, qty })),
    discountPct: clampPackPct(d.packDiscountPct),
    activeFromMs: msOf(d.activeFrom as Millis),
    activeToMs: msOf(d.activeTo as Millis),
  };
}

/** Published pack, inside its optional window (whole Vientiane days, both inclusive). */
export function isPackActive(p: Pack, nowMs: number): boolean {
  if (!p.isPack || !p.published || p.items.length === 0) return false;
  if (p.activeFromMs != null && nowMs < vteEndOfDayMs(p.activeFromMs) - DAY_MS) return false;
  if (p.activeToMs != null && nowMs >= vteEndOfDayMs(p.activeToMs)) return false;
  return true;
}

export interface PackLine { productId: string; pickupAtMs: number; returnAtMs: number; quantity: number; subtotal: number }
export type PackError = 'inactive' | 'missing-item' | 'different-dates' | 'quantity' | 'no-discount';
export type PackResult =
  | { ok: true; total: number; perLine: number[] }
  | { ok: false; error: PackError };

/**
 * The pack discount on a booking's lines: every pack item must be booked for the SAME
 * pick-up and return, with at least the pack quantity (lines of one product summed). Only
 * the pack quantity is discounted (extra units / other lines at full price); total =
 * round(eligible subtotal × % / 100), spread over the eligible lines like orderDiscount.
 */
export function packDiscount(p: Pack, lines: PackLine[], nowMs: number): PackResult {
  if (!isPackActive(p, nowMs)) return { ok: false, error: 'inactive' };
  const wanted = new Map(p.items.map(i => [i.productId, i.qty]));
  const inPack = lines.map((l, i) => ({ l, i })).filter(x => wanted.has(x.l.productId));
  if (p.items.some(it => !inPack.some(x => x.l.productId === it.productId))) return { ok: false, error: 'missing-item' };

  // Candidate windows = those of the pack lines; the first one holding every item wins.
  const windows = [...new Set(inPack.map(x => `${x.l.pickupAtMs}-${x.l.returnAtMs}`))];
  let chosen: { i: number; units: number }[] | null = null;
  let quantityShort = false;
  for (const w of windows) {
    const here = inPack.filter(x => `${x.l.pickupAtMs}-${x.l.returnAtMs}` === w);
    if (!p.items.every(it => here.some(x => x.l.productId === it.productId))) continue;
    const alloc: { i: number; units: number }[] = [];
    let ok = true;
    for (const it of p.items) {
      let left = it.qty;
      for (const x of here.filter(h => h.l.productId === it.productId)) {
        const units = Math.min(left, x.l.quantity);
        if (units > 0) alloc.push({ i: x.i, units });
        left -= units;
      }
      if (left > 0) { ok = false; break; }
    }
    if (ok) { chosen = alloc; break; }
    quantityShort = true;
  }
  if (!chosen) return { ok: false, error: quantityShort ? 'quantity' : 'different-dates' };

  const eligible = lines.map(() => 0);
  for (const a of chosen) {
    const l = lines[a.i];
    eligible[a.i] += l.quantity > 0 ? (l.subtotal * a.units) / l.quantity : 0;
  }
  const base = eligible.reduce((s, v) => s + v, 0);
  const total = Math.round((base * p.discountPct) / 100);
  if (total <= 0 || base <= 0) return { ok: false, error: 'no-discount' };
  const perLine = eligible.map(v => Math.round((total * v) / base));
  const last = eligible.reduce((li, v, i) => (v > 0 ? i : li), -1);
  perLine[last] += total - perLine.reduce((s, v) => s + v, 0);
  return { ok: true, total, perLine };
}

/** Pack price of these rental amounts (every item, one window): the sum minus the pack
 *  discount, rounded like packDiscount — the pack page's "Pack price per day" (1-day
 *  amounts) and the Home pack tile use it. */
export function packPrice(subtotals: number[], pct: number): number {
  const base = subtotals.reduce((s, v) => s + v, 0);
  return base - Math.round((base * clampPackPct(pct)) / 100);
}

/** The best complete pack for these lines (largest discount), or null. */
export function bestPackFor(packs: Pack[], lines: PackLine[], nowMs: number): { pack: Pack; total: number; perLine: number[] } | null {
  let best: { pack: Pack; total: number; perLine: number[] } | null = null;
  for (const p of packs) {
    const r = packDiscount(p, lines, nowMs);
    if (r.ok && (!best || r.total > best.total)) best = { pack: p, total: r.total, perLine: r.perLine };
  }
  return best;
}

/** "Pack Karaoke night (5%)" — receipts, emails, rental + admin detail, agreement. */
export const packLabel = (title: string, pct: number) => `Pack ${title} (${pct}%)`;

// ── Partial cancellation ─────────────────────────────────────────────────────

export const PACK_REPRICE_STATUSES = ['pending_payment', 'confirmed'];

export interface PackApplied {
  packId: string;
  title: string;
  percent: number;
  discountAmount: number;
  removedAt?: unknown;
  removedReason?: string;
}
export interface OrderLineForPack {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  packApplied?: PackApplied | null;
}

const livePack = (l: OrderLineForPack) => !!l.packApplied && !l.packApplied.removedAt && l.packApplied.discountAmount > 0;

/**
 * Cancelling `cancelIds` breaks a pack → the OTHER lines of that pack still before pick-up
 * go back to full price. Returns them with the totals before / after, or null when nothing
 * changes (no pack on the cancelled lines, or the whole pack cancelled together). The ONE
 * rule used by the renter / admin confirmations AND the removeBrokenPackDiscount trigger.
 */
export function packCancelImpact(
  lines: OrderLineForPack[], cancelIds: string[],
): { packId: string; packTitle: string; lineIds: string[]; before: number; after: number } | null {
  const cancelled = new Set(cancelIds);
  const hit = lines.find(l => cancelled.has(l.id) && livePack(l));
  if (!hit) return null;
  const packId = hit.packApplied!.packId;
  const rest = lines.filter(l => !cancelled.has(l.id) && livePack(l) && l.packApplied!.packId === packId
    && PACK_REPRICE_STATUSES.includes(l.status));
  if (rest.length === 0) return null;
  return {
    packId,
    packTitle: hit.packApplied!.title,
    lineIds: rest.map(l => l.id),
    before: rest.reduce((s, l) => s + l.total, 0),
    after: rest.reduce((s, l) => s + l.subtotal, 0),
  };
}

/** Renter-facing reason a pack price doesn't apply (checkout / createReservations). */
export const PACK_ERROR_TEXT: Record<PackError, string> = {
  inactive: 'This pack isn’t available any more.',
  'missing-item': 'The pack price needs every item of the pack.',
  'different-dates': 'The pack price needs the same dates for every item.',
  quantity: 'The pack price needs the full quantity of each item.',
  'no-discount': 'This pack has no discount.',
};
