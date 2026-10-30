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
// The welcome message and the auto-replies (senderId 'lanchai-business') notify nobody.

const REGION = 'asia-southeast1';
const BUSINESS_ID = 'lanchai-business';
const db = () => admin.firestore();

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
