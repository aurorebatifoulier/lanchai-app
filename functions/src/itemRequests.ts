import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { BREVO_API_KEY } from './email/config';
import { sendAccountEmail, itemAddedEmail } from './email/triggers';
import { itemRequestRenterMessage, requestQuote, type ItemRequestStatus } from './shared/itemRequests';
import { productThumb } from './shared/productImage';

// "Ask for an item" (requests/{id}) — admin alert on a new request, and ONE in-app
// message to the renter per status change (ordered / declined / added — claimed in a
// transaction on renterNotified.{status}); "added" also sends an email (shared layout,
// respects emailRemindersOptOut, test mode like every email) linking to the product.

const REGION = 'asia-southeast1';
const db = () => admin.firestore();

export const onItemRequestCreated = onDocumentCreated(
  { document: 'requests/{requestId}', region: REGION },
  async event => {
    const r = event.data?.data();
    if (!r) return;
    const admins = (await db().collection('admins').get()).docs.map(d => d.id);
    const who = String(r.renterName || 'A renter');
    await Promise.all(admins.map(uid => db().collection('notifications').doc(uid).collection('items').add({
      type: 'rental', icon: 'package', iconColor: 'amber',
      title: 'New item request',
      body: `${who} asked for ${requestQuote(String(r.text ?? ''))}`,
      deepLink: '/admin/requests',
      createdAt: FieldValue.serverTimestamp(), readAt: null,
    }).catch(err => logger.error('[requests] admin notification failed', { uid, err: String(err) }))));
  },
);

export const onItemRequestUpdated = onDocumentUpdated(
  { document: 'requests/{requestId}', region: REGION, secrets: [BREVO_API_KEY] },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const status = after.status as ItemRequestStatus | undefined;
    if (!status || status === 'new' || status === before.status) return;
    const renterId = typeof after.renterId === 'string' ? after.renterId : '';
    if (!renterId) return; // legacy request, no renter to tell
    if (status === 'added' && !after.productId) return;

    // Once per status, even if the trigger re-runs or staff flip back and forth.
    const ref = event.data!.after.ref;
    const claimed = await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.get(`renterNotified.${status}`)) return false;
      tx.update(ref, { [`renterNotified.${status}`]: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return;

    const text = String(after.text ?? '');
    const productId = status === 'added' ? String(after.productId) : null;
    let productName: string | null = after.productName ?? null;
    let image: string | null = null;
    if (productId) {
      const p = (await db().collection('products').doc(productId).get()).data();
      productName = String(p?.name ?? productName ?? 'Your item');
      image = productThumb(p);
    }
    const msg = itemRequestRenterMessage(status, { text, productName });
    try {
      await db().collection('notifications').doc(renterId).collection('items').add({
        type: 'rental', icon: 'package', iconColor: 'amber',
        title: msg.title, body: msg.body,
        deepLink: productId ? `/product/${productId}` : '/explore',
        createdAt: FieldValue.serverTimestamp(), readAt: null,
      });
    } catch (err) {
      logger.error('[requests] renter notification failed', { renterId, status, err: String(err) });
    }
    if (productId) {
      await sendAccountEmail(renterId, (shop, rcp) => itemAddedEmail(shop, {
        firstName: rcp.firstName || rcp.name || 'there', productName: productName ?? 'Your item', productId, image, requestText: text,
      }), 'item-request-added', { respectOptOut: true });
    }
  },
);
