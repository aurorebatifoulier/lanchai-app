import {
  collection, doc, getDoc, getDocs, increment, query, serverTimestamp, where, writeBatch, type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { addAudit } from './adminAudit';
import { machineViolations } from '@/functions/src/shared/reservationMachine';
import type { RentalDoc } from './firestore';

// Admin → Data check (owner): reservations whose data contradicts the state machine
// (functions/src/shared/reservationMachine.ts machineViolations), and units still held
// out of stock (pendingSettlementUnits) by ARCHIVED bookings — released with a preview,
// in ONE audited batch (product counts + stock log + the reservation's release_units).

export interface Violation { reservation: RentalDoc; issues: string[] }

export async function loadReservationsForCheck(): Promise<{ violations: Violation[]; archived: RentalDoc[] }> {
  const snap = await getDocs(collection(db, 'reservations'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as RentalDoc));
  const violations = all
    .map(r => ({ reservation: r, issues: machineViolations(r as unknown as Parameters<typeof machineViolations>[0]) }))
    .filter(v => v.issues.length > 0)
    .sort((a, b) => (b.reservation.createdAt?.toMillis() ?? 0) - (a.reservation.createdAt?.toMillis() ?? 0));
  const archived = all.filter(r => r.archived === true);
  return { violations, archived };
}

export interface HeldLine { reservation: RentalDoc; units: number }
export interface ProductRelease {
  productId: string; productName: string; current: number; release: number; after: number; lines: HeldLine[];
}

/**
 * Units each archived (not yet released) booking still holds in pendingSettlementUnits =
 * the sum of that booking's stock-log deltas on that field (+ at return, − when
 * releaseSettledStock gave them back). Grouped per product with the product's current
 * count; the release never takes a count below 0.
 */
export async function previewRelease(archived: RentalDoc[]): Promise<ProductRelease[]> {
  const todo = archived.filter(r => !r.unitsReleasedAt);
  const held: HeldLine[] = [];
  for (const r of todo) {
    const log = await getDocs(query(collection(db, 'products', r.productId, 'stockAdjustments'), where('reservationId', '==', r.id)));
    const units = log.docs
      .filter(d => d.get('field') === 'pendingSettlementUnits')
      .reduce((sum, d) => sum + (Number(d.get('delta')) || 0), 0);
    if (units > 0) held.push({ reservation: r, units });
  }
  const byProduct = new Map<string, HeldLine[]>();
  for (const h of held) byProduct.set(h.reservation.productId, [...(byProduct.get(h.reservation.productId) ?? []), h]);
  const out: ProductRelease[] = [];
  for (const [productId, lines] of byProduct) {
    const p = await getDoc(doc(db, 'products', productId));
    const current = Number(p.get('pendingSettlementUnits') ?? 0) || 0;
    const want = lines.reduce((s, l) => s + l.units, 0);
    const release = Math.min(want, Math.max(0, current));
    out.push({
      productId,
      productName: String(p.get('name') ?? lines[0].reservation.productName ?? productId),
      current, release, after: current - release, lines,
    });
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Applies the preview: per product −release on pendingSettlementUnits (+ stock log), and
 *  every listed booking marked release_units (so it can never be released twice). */
export async function applyRelease(plan: ProductRelease[], adminName: string): Promise<void> {
  const batch = writeBatch(db);
  for (const p of plan) {
    if (p.release > 0) {
      const auditId = await addAudit(batch, 'release_units', { productId: p.productId },
        `−${p.release} pending settlement (archived test bookings)`);
      batch.update(doc(db, 'products', p.productId), {
        pendingSettlementUnits: increment(-p.release), lastAuditId: auditId,
      });
      batch.set(doc(collection(db, 'products', p.productId, 'stockAdjustments')), {
        field: 'pendingSettlementUnits', delta: -p.release,
        reason: 'Data check: released units held by archived bookings',
        adminName, createdAt: serverTimestamp(),
      });
    }
    for (const l of p.lines) {
      const auditId = await addAudit(batch, 'release_units',
        { reservationId: l.reservation.id, productId: p.productId, renterId: l.reservation.renterId }, `${l.units} unit(s)`);
      batch.update(doc(db, 'reservations', l.reservation.id), {
        unitsReleasedAt: serverTimestamp(), unitsReleased: l.units,
        lastAuditId: auditId, lastAction: 'release_units', updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

export const fmtDay = (t?: Timestamp) => (t ? t.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
