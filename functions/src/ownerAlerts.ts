import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { adminUids } from './adminAuth';
import { sendEmail } from './email/send';
import { getEmailShop } from './email/context';
import { ownerAlertEmail } from './email/templates';

// Alerts that need an OWNER decision (damage charge to review, ID flagged at the counter,
// pick-up refused). Every active owner gets, at once:
//   • an in-app notification (type 'admin' → the dashboard / reservation, badge);
//   • an email to their OWN address — `ownerAlert` bypasses email test mode (test mode
//     only protects renters before launch).
// Device push (FCM) isn't built yet (roadmap). Never throws.

export interface OwnerAlert {
  title: string;
  body: string;
  reservationId?: string;
  /** Who raised it (staff name). */
  by: string;
}

async function ownerEmail(uid: string): Promise<{ email: string; name?: string } | null> {
  const snap = await admin.firestore().collection('admins').doc(uid).get();
  const stored = String(snap.get('email') ?? '');
  if (stored) return { email: stored, name: snap.get('name') || undefined };
  const u = await admin.auth().getUser(uid).catch(() => null);
  return u?.email ? { email: u.email, name: u.displayName ?? undefined } : null;
}

export async function alertOwners(alert: OwnerAlert): Promise<void> {
  try {
    const owners = await adminUids({ role: 'owner' });
    const deepLink = alert.reservationId ? `/admin/reservations/${alert.reservationId}` : '/admin';
    await Promise.all(owners.map(uid => admin.firestore().collection('notifications').doc(uid).collection('items').add({
      type: 'admin', icon: 'alert', iconColor: 'amber',
      title: alert.title, body: `${alert.body} — ${alert.by}`, deepLink,
      ownerAlert: true, createdAt: FieldValue.serverTimestamp(), readAt: null,
    })));
    const shop = await getEmailShop();
    const r = ownerAlertEmail(shop, alert);
    await Promise.all(owners.map(async uid => {
      const to = await ownerEmail(uid);
      if (!to) return;
      await sendEmail({ to, ...r, tag: 'owner-alert', ownerAlert: true });
    }));
  } catch (err) {
    logger.error('[ownerAlerts] failed', { title: alert.title, err: String(err) });
  }
}
