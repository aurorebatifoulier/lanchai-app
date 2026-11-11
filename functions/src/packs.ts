import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { packCancelImpact, type OrderLineForPack } from './shared/packs';

// A pack price needs every item of the pack: when one line carrying `packApplied` is
// cancelled (renter or staff — nothing is charged before pick-up), the OTHER lines of that
// pack still before pick-up go back to full price: total = subtotal, packApplied.removedAt
// + removedReason. Same rule as the renter / admin confirmation preview
// (shared/packs.ts packCancelImpact). Lines already handed over are left as they are.
// Idempotent: a line whose pack discount is already removed no longer counts.
export const removeBrokenPackDiscount = onDocumentUpdated(
  { document: 'reservations/{reservationId}', region: 'asia-southeast1' },
  async event => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;
      if (before.status === 'cancelled' || after.status !== 'cancelled') return;
      if (!after.packApplied?.packId || !after.orderId) return;
      const db = admin.firestore();
      const lineId = event.params.reservationId;

      await db.runTransaction(async tx => {
        const snap = await tx.get(db.collection('reservations').where('orderId', '==', after.orderId));
        const lines: OrderLineForPack[] = snap.docs.map(d => ({
          id: d.id,
          status: String(d.get('status') ?? ''),
          total: Number(d.get('total') ?? 0),
          subtotal: Number(d.get('subtotal') ?? 0),
          packApplied: d.get('packApplied') ?? null,
        }));
        const impact = packCancelImpact(lines, [lineId]);
        if (!impact) return;
        for (const d of snap.docs.filter(x => impact.lineIds.includes(x.id))) {
          tx.update(d.ref, {
            total: Number(d.get('subtotal') ?? 0),
            'packApplied.removedAt': FieldValue.serverTimestamp(),
            'packApplied.removedReason': 'item-cancelled',
          });
        }
        logger.info('[removeBrokenPackDiscount] pack price removed', {
          orderId: after.orderId, packId: impact.packId, lines: impact.lineIds.length, before: impact.before, after: impact.after,
        });
      });
    } catch (err) {
      logger.error('[removeBrokenPackDiscount] failed', err);
    }
  },
);
