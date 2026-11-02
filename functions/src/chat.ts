import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { closedPeriod, DEFAULT_AUTO_REPLY } from './shared/shop';
import { vteIsoDay } from './shared/dates';

// Chat (conversations/{renterId}/messages/{id}):
// • a renter writes while the shop is closed → ONE automatic LANCHAI reply per closed
//   period per conversation ("We're closed for now. We'll reply from {open time}." —
//   config/shop.autoReplyText), keyed by the next opening (conversation.autoReplyKey);
// • LANCHAI (staff) replies → in-app notification "New message from LANCHAI" → /chat.
// • a renter taps "I'm on my way" on a late rental (My rentals) → the message carries
//   onMyWay + about {kind:'rental'} → every admin gets an in-app notification → the admin
//   reservation, at most once per 2h per rental (reservation.onMyWayNotifiedAt), and only
//   for that renter's own ACTIVE rental.
// The welcome message and the auto-replies (senderId 'lanchai-business') notify nobody.

const REGION = 'asia-southeast1';
const BUSINESS_ID = 'lanchai-business';
const db = () => admin.firestore();
const ON_MY_WAY_COOLDOWN_MS = 2 * 60 * 60 * 1000;

async function notifyOnMyWay(renterId: string, reservationId: string): Promise<void> {
  const resRef = db().collection('reservations').doc(reservationId);
  const claimed = await db().runTransaction(async tx => {
    const snap = await tx.get(resRef);
    const r = snap.data();
    if (!r || r.renterId !== renterId || r.status !== 'active') return null;
    const last = r.onMyWayNotifiedAt?.toMillis?.() ?? 0;
    if (Date.now() - last < ON_MY_WAY_COOLDOWN_MS) return null;
    tx.update(resRef, { onMyWayNotifiedAt: FieldValue.serverTimestamp() });
    return { renterName: String(r.renterName ?? 'A renter'), productName: String(r.productName ?? 'their rental') };
  });
  if (!claimed) return;
  const admins = (await db().collection('admins').get()).docs.map(d => d.id);
  await Promise.all(admins.map(uid => db().collection('notifications').doc(uid).collection('items').add({
    type: 'rental', icon: 'navigation', iconColor: 'amber',
    title: `${claimed.renterName} is on the way`,
    body: `Coming to return ${claimed.productName}.`,
    deepLink: `/admin/reservations/${reservationId}`,
    createdAt: FieldValue.serverTimestamp(), readAt: null,
  })));
  logger.info('[chat] on-my-way admin notification', { reservationId, admins: admins.length });
}

export const onChatMessage = onDocumentCreated(
  { document: 'conversations/{conversationId}/messages/{messageId}', region: REGION },
  async event => {
    const m = event.data?.data();
    if (!m) return;
    const conversationId = event.params.conversationId;
    try {
      if (m.senderType === 'business') {
        if (m.senderId === BUSINESS_ID || m.autoReply === true) return;
        const text = typeof m.text === 'string' && m.text.trim() ? m.text.trim() : m.imageUrl ? 'Photo' : m.videoUrl ? 'Video' : '';
        await db().collection('notifications').doc(conversationId).collection('items').add({
          type: 'message', icon: 'message-circle', iconColor: 'amber',
          title: 'New message from LANCHAI',
          body: text.length > 120 ? `${text.slice(0, 117)}…` : text,
          deepLink: '/chat', createdAt: FieldValue.serverTimestamp(), readAt: null,
        });
        return;
      }
      if (m.senderType !== 'renter') return;

      if (m.onMyWay === true && m.about?.kind === 'rental' && typeof m.about.id === 'string') {
        await notifyOnMyWay(conversationId, m.about.id)
          .catch(err => logger.error('[onChatMessage] on-my-way failed', { conversationId, err: String(err) }));
      }

      const shop = (await db().collection('config').doc('shop').get()).data() ?? {};
      const period = closedPeriod(
        { openTime: String(shop.openTime ?? '09:00'), closeTime: String(shop.closeTime ?? '20:00'), closedDays: shop.closedDays },
        Date.now(), vteIsoDay,
      );
      if (!period) return;
      const convRef = db().collection('conversations').doc(conversationId);
      const claimed = await db().runTransaction(async tx => {
        const conv = await tx.get(convRef);
        if (!conv.exists || conv.get('autoReplyKey') === period.key) return false;
        tx.update(convRef, { autoReplyKey: period.key });
        return true;
      });
      if (!claimed) return;
      const template = typeof shop.autoReplyText === 'string' && shop.autoReplyText.trim() ? shop.autoReplyText.trim() : DEFAULT_AUTO_REPLY;
      const text = template.replace(/\{open time\}/gi, period.opensText);
      await convRef.collection('messages').add({
        senderId: BUSINESS_ID, senderType: 'business', text, imageUrl: null, videoUrl: null,
        autoReply: true, createdAt: FieldValue.serverTimestamp(), read: false,
      });
      await convRef.update({
        lastMessage: text, lastMessageAt: FieldValue.serverTimestamp(), lastSenderType: 'business',
        unreadByRenter: FieldValue.increment(1),
      });
      logger.info('[chat] auto-reply sent', { conversationId, key: period.key });
    } catch (err) {
      logger.error('[onChatMessage] failed', { conversationId, err: String(err) });
    }
  },
);
