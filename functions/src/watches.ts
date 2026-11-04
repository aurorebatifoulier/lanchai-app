import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { BREVO_API_KEY } from './email/config';
import { sendAccountEmail, availabilityEmail, categoryArrivalEmail } from './email/triggers';
import { computeAvailableUnits, effectiveStock, OCCUPYING_STATUSES, PICKUP_DELAY_MS, type OccupancyRecord } from './shared/availability';
import { vteDay, vteIsoDay } from './shared/dates';
import { productThumb } from './shared/productImage';
import { trackJob } from './jobHealth';

// "Notify me" (Liked) — availabilityWatches/{uid}_{productId} (renter-written). Hourly:
// for each WATCHED product (published, not manually unavailable), look for the first
// FULL free day in the next 30 days — from the opening time to the same time the next
// day, with at least 1 unit free (the booking rule: computeAvailableUnits on the
// occupying reservations + effectiveStock), today only if that slot is still ≥ 2h
// away. Found → in-app notification + email (respects emailRemindersOptOut) to each
// watcher, then the watch is deleted. Products gone / archived → watches deleted.
// A scheduled job rather than an occupancy trigger: an item also becomes free when a
// repair ends, stock changes or it is republished.

const REGION = 'asia-southeast1';
const DAY_MS = 24 * 60 * 60 * 1000;
const VTE_OFFSET_MS = 7 * 60 * 60 * 1000;
const db = () => admin.firestore();

/** Epoch ms of `HH:MM` (Vientiane) on the Vientiane day of `dayMs`. */
function atVteTime(dayMs: number, hhmm: string): number {
  const [y, m, d] = vteIsoDay(dayMs).split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min) - VTE_OFFSET_MS;
}

/** First free full day within 30 days (start ms), or null. */
export function firstFreeDay(occ: OccupancyRecord[], stock: number, openTime: string, nowMs: number): number | null {
  if (stock <= 0) return null;
  for (let i = 0; i < 30; i++) {
    const start = atVteTime(nowMs + i * DAY_MS, openTime);
    if (start < nowMs + PICKUP_DELAY_MS) continue;
    if (computeAvailableUnits(occ, new Date(start), new Date(start + DAY_MS), stock) >= 1) return start;
  }
  return null;
}

export const availabilityWatchJob = onSchedule(
  { schedule: 'every 60 minutes', region: REGION, secrets: [BREVO_API_KEY] },
  async () => trackJob('availabilityWatchJob', async () => {
    const watches = (await db().collection('availabilityWatches').get()).docs;
    if (watches.length === 0) return;
    const shop = (await db().collection('config').doc('shop').get()).data() ?? {};
    const openTime = /^\d{1,2}:\d{2}$/.test(String(shop.openTime ?? '')) ? String(shop.openTime) : '09:00';
    const now = Date.now();
    const byProduct = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
    watches.forEach(w => {
      const pid = String(w.get('productId') ?? '');
      if (!pid) return;
      byProduct.set(pid, [...(byProduct.get(pid) ?? []), w]);
    });

    let notified = 0;
    for (const [productId, ws] of byProduct) {
      // One failing product is logged and retried next run — never blocks the others.
      try {
      const p = (await db().collection('products').doc(productId).get()).data();
      if (!p || p.status === 'archived' || p.status === 'draft') {
        await Promise.all(ws.map(w => w.ref.delete()));
        continue;
      }
      if (p.available === false) continue;
      const res = await db().collection('reservations').where('productId', '==', productId).where('status', 'in', OCCUPYING_STATUSES).get();
      const occ: OccupancyRecord[] = res.docs.map(d => ({
        pickupAt: d.get('pickupAt')?.toMillis?.() ?? 0,
        returnAt: d.get('returnAt')?.toMillis?.() ?? 0,
        quantity: d.get('quantity') ?? 0,
        reservationId: d.id,
      }));
      const stock = effectiveStock({
        stockLeft: p.stockLeft ?? 0, inRepairUnits: p.inRepairUnits, lostUnits: p.lostUnits, pendingSettlementUnits: p.pendingSettlementUnits,
      });
      const from = firstFreeDay(occ, stock, openTime, now);
      if (from == null) continue;
      const name = String(p.name ?? 'Your item');
      const fromLabel = vteDay(from);
      const image = productThumb(p);
      for (const w of ws) {
        const uid = String(w.get('uid'));
        await db().collection('notifications').doc(uid).collection('items').add({
          type: 'rental', icon: 'package', iconColor: 'amber',
          title: `${name} is free again`,
          body: `Free from ${fromLabel}. Book it before someone else does.`,
          deepLink: `/product/${productId}`, createdAt: FieldValue.serverTimestamp(), readAt: null,
        }).catch(() => {});
        await sendAccountEmail(uid, (shopE, r) => availabilityEmail(shopE, {
          firstName: r.firstName || r.name || 'there', productName: name, productId, fromLabel, image,
        }), 'availability-notify', { respectOptOut: true });
        await w.ref.delete();
        notified++;
      }
      } catch (err) {
        logger.error('[availabilityWatchJob] product failed', { productId, err: String(err) });
      }
    }
    logger.info('[availabilityWatchJob] done', { watches: watches.length, notified });
  }),
);

// ── Category watch ("Notify me when items arrive", Explore empty category) ─────────
// categoryWatches/{uid}_{category} (renter-written). When a product BECOMES visible to
// renters in a category (created / published / moved there — not draft, not archived),
// every watcher of that category gets an in-app notification (→ Explore with the
// category) + an email (respects emailRemindersOptOut), then the watch is deleted.

const CATEGORY_NAMES: Record<string, string> = {
  fun: 'Fun', tools: 'Tools', outdoor: 'Outdoor', sports: 'Sports', kids: 'Kids', home: 'Home',
};
const renterVisible = (p: admin.firestore.DocumentData | undefined) =>
  !!p && p.status !== 'draft' && p.status !== 'archived';

export const onCategoryArrival = onDocumentWritten(
  { document: 'products/{productId}', region: REGION, secrets: [BREVO_API_KEY] },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!renterVisible(after)) return;
    const category = String(after!.category ?? '');
    if (!category) return;
    if (renterVisible(before) && before!.category === category) return; // nothing new here
    const watches = (await db().collection('categoryWatches').where('category', '==', category).get()).docs;
    if (watches.length === 0) return;
    const categoryName = CATEGORY_NAMES[category] ?? category;
    const productName = String(after!.name ?? 'A new item');
    const image = productThumb(after);
    let notified = 0;
    for (const w of watches) {
      const uid = String(w.get('uid'));
      try {
        await db().collection('notifications').doc(uid).collection('items').add({
          type: 'rental', icon: 'package', iconColor: 'amber',
          title: `New in ${categoryName}`,
          body: `${productName} just arrived. You asked us to tell you.`,
          deepLink: `/explore?category=${category}`, createdAt: FieldValue.serverTimestamp(), readAt: null,
        });
        await sendAccountEmail(uid, (shopE, r) => categoryArrivalEmail(shopE, {
          firstName: r.firstName || r.name || 'there', categoryName, categoryId: category, productName, image,
        }), 'category-arrival', { respectOptOut: true });
        await w.ref.delete();
        notified++;
      } catch (err) {
        logger.error('[onCategoryArrival] watcher failed', { uid, category, err: String(err) });
      }
    }
    logger.info('[onCategoryArrival] done', { category, productId: event.params.productId, notified });
  },
);
