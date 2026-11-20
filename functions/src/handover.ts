import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireRole } from './adminAuth';
import { auditData, newAuditRef } from './audit';
import { canDo } from './shared/reservationMachine';
import { unitsOnHand } from './shared/availability';
import { isBeforePickupDay } from './shared/dates';
import { CHECKLIST_CATEGORY_IDS, CHECKLIST_RATINGS, type ChecklistRating } from './shared/returnCharges';

// submitHandover — EVERY handover (checklist, order summary, "Mark as picked up", early
// handover) goes through here: the state machine (`handover` is server-only) and the
// PHYSICAL check, both inside one transaction: a unit can only be handed over when one
// is in the shop — stock − out with renters (every `active` rental of that product,
// early handovers included) − in repair − lost − pending settlement / cleaning
// (unitsOnHand). Booked dates never overlap, but an EARLY handover takes the unit out
// before its booked pick-up, so the date calendar alone can't see it.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();
const fail = (code: string, message: string, status: 'invalid-argument' | 'failed-precondition' | 'not-found' = 'failed-precondition', extra: Record<string, unknown> = {}): never => {
  throw new HttpsError(status, message, { code, ...extra });
};

interface HandoverChecklistInput {
  categories: Record<string, { rating: ChecklistRating; note?: string }>;
  photos: string[];
  depositCurrency: 'LAK' | 'USD' | 'THB';
  depositAmount: number;
  confirmedByName: string;
  clientConfirmedByName: string;
  clientConfirmed: boolean;
  rentalPaymentMethod?: string;
}
interface HandoverItem { reservationId: string; checklist: HandoverChecklistInput | null }

function parseChecklist(id: string, raw: unknown): HandoverChecklistInput | null {
  if (raw == null) return null;
  const c = raw as Record<string, unknown>;
  const cats = (c.categories ?? {}) as Record<string, { rating?: unknown; note?: unknown }>;
  const categories: HandoverChecklistInput['categories'] = {};
  for (const k of CHECKLIST_CATEGORY_IDS) {
    const v = cats[k];
    if (!v || !CHECKLIST_RATINGS.includes(v.rating as ChecklistRating)) fail('checklist-incomplete', 'Rate every part of the item first.', 'invalid-argument');
    const note = typeof v!.note === 'string' ? v!.note.trim().slice(0, 500) : '';
    categories[k] = { rating: v!.rating as ChecklistRating, ...(note ? { note } : {}) };
  }
  const photos = Array.isArray(c.photos) ? c.photos.filter((p): p is string => typeof p === 'string') : [];
  if (photos.length > 20 || photos.some(p => p.length > 2000 || !p.includes(`reservations%2F${id}%2Fhandover%2F`))) {
    fail('invalid-photo', 'A photo is not from this handover.', 'invalid-argument');
  }
  const cur = c.depositCurrency === 'USD' || c.depositCurrency === 'THB' || c.depositCurrency === 'LAK' ? c.depositCurrency : null;
  if (!cur) fail('invalid-request', 'Choose the deposit currency.', 'invalid-argument');
  const amount = typeof c.depositAmount === 'number' && Number.isFinite(c.depositAmount) && c.depositAmount >= 0 ? c.depositAmount : null;
  if (amount == null) fail('invalid-request', 'Missing deposit amount.', 'invalid-argument');
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return {
    categories, photos, depositCurrency: cur!, depositAmount: amount!,
    confirmedByName: str(c.confirmedByName, 120), clientConfirmedByName: str(c.clientConfirmedByName, 120),
    clientConfirmed: c.clientConfirmed === true,
    ...(typeof c.rentalPaymentMethod === 'string' ? { rentalPaymentMethod: str(c.rentalPaymentMethod, 40) } : {}),
  };
}

// submitHandover({ items: [{ reservationId, checklist? }] }) → { ok }
export const submitHandover = onCall({ region: REGION, invoker: 'public' }, async request => {
  const caller = await requireRole(request, 'staff');
  const d = (request.data ?? {}) as { items?: unknown };
  const raw = Array.isArray(d.items) ? d.items : [];
  if (raw.length === 0 || raw.length > 20) fail('invalid-request', 'Nothing to hand over.', 'invalid-argument');
  const items: HandoverItem[] = raw.map(x => {
    const r = (x ?? {}) as Record<string, unknown>;
    const id = typeof r.reservationId === 'string' ? r.reservationId : '';
    if (!id) fail('invalid-request', 'Missing booking.', 'invalid-argument');
    return { reservationId: id, checklist: parseChecklist(id, r.checklist) };
  });
  const ids = items.map(i => i.reservationId);
  if (new Set(ids).size !== ids.length) fail('invalid-request', 'Duplicate item.', 'invalid-argument');
  const nowMs = Date.now();

  await db().runTransaction(async tx => {
    const snaps = await Promise.all(ids.map(id => tx.get(db().collection('reservations').doc(id))));
    const need = new Map<string, number>();
    for (const s of snaps) {
      if (!s.exists) fail('not-found', 'Booking not found.', 'not-found');
      // State machine: re-read IN the transaction (refused pick-up → owner only, etc.).
      if (!canDo(s.data()!, 'handover', caller.role, 'server')) {
        fail('not-allowed', 'This booking can’t be handed over now (already out, closed, or the pick-up was refused).');
      }
      const pid = String(s.get('productId'));
      need.set(pid, (need.get(pid) ?? 0) + Math.max(1, Number(s.get('quantity') ?? 1)));
    }
    // Physical check per product: units in the shop right now.
    for (const [pid, units] of need) {
      const product = await tx.get(db().collection('products').doc(pid));
      const out = await tx.get(db().collection('reservations').where('productId', '==', pid).where('status', '==', 'active'));
      const outDocs = out.docs.filter(x => x.get('archived') !== true && !ids.includes(x.id));
      const outUnits = outDocs.reduce((sum, x) => sum + Math.max(1, Number(x.get('quantity') ?? 1)), 0);
      const p = product.data() ?? {};
      const onHand = unitsOnHand({
        stockLeft: Number(p.stockLeft ?? 0), inRepairUnits: p.inRepairUnits, lostUnits: p.lostUnits,
        pendingSettlementUnits: p.pendingSettlementUnits,
      }, outUnits);
      if (onHand < units) {
        const name = String(p.name ?? 'This item');
        const parts = [
          outUnits > 0 ? `${outUnits} out with a renter` : null,
          (p.pendingSettlementUnits ?? 0) > 0 ? `${p.pendingSettlementUnits} cleaning after a return` : null,
          (p.inRepairUnits ?? 0) > 0 ? `${p.inRepairUnits} in repair` : null,
          (p.lostUnits ?? 0) > 0 ? `${p.lostUnits} lost` : null,
        ].filter(Boolean).join(', ');
        fail('no-unit-on-hand',
          `No ${name} in the shop to hand over (stock ${Number(p.stockLeft ?? 0)}${parts ? `: ${parts}` : ''}).`,
          'failed-precondition',
          { productId: pid, onHand, needed: units, outReservationIds: outDocs.map(x => x.id) });
      }
    }
    snaps.forEach((s, i) => {
      const r = s.data()!;
      const item = items[i];
      const pickupMs = (r.pickupAt as Timestamp | undefined)?.toMillis() ?? 0;
      const early = pickupMs > 0 && isBeforePickupDay(pickupMs, nowMs);
      const auditRef = newAuditRef();
      tx.update(s.ref, {
        status: 'active',
        ...(item.checklist ? {
          handoverChecklist: {
            ...item.checklist,
            confirmedByName: item.checklist.confirmedByName || caller.name,
            confirmedByRole: caller.role,
            confirmedAt: FieldValue.serverTimestamp(),
          },
        } : {}),
        ...(early ? { earlyHandover: true, earlyHandoverPlannedAt: r.pickupAt } : {}),
        pickupRefusedOpen: false,
        lastAction: 'handover',
        lastAuditId: auditRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, auditData(caller, {
        action: 'handover', reservationId: s.id, orderId: r.orderId, productId: r.productId, renterId: r.renterId,
        note: [item.checklist ? 'handover checklist' : 'marked as picked up', early ? 'early handover' : null].filter(Boolean).join(' · '),
      }));
    });
  });
  logger.info('[handover] submitted', { by: caller.uid, role: caller.role, items: ids.length });
  return { ok: true };
});
