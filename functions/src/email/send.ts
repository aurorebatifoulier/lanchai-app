import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  BREVO_API_KEY, BREVO_ENDPOINT, EMAIL_SENDER, EMAIL_REPLY_TO, DEFAULT_TEST_REDIRECT,
} from './config';

export type SendResult = 'sent' | 'failed' | 'failed_auth' | 'no_recipient';

export interface OutgoingEmail {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  tag: string;               // Brevo tag, e.g. 'booking-confirmation'
  /** Test-send only: deliver to `to` even in redirect mode (it's the test inbox itself). */
  bypassRedirect?: boolean;
  /** Small files (e.g. a .ics calendar invite), content base64-encoded. */
  attachments?: { name: string; content: string }[];
}

const MAX_ATTEMPTS = 3;           // 1 try + 2 retries, for 429 / 5xx / network errors only
const AUTH_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface EmailMode { live: boolean; redirectTo: string }

/** config/emailSettings (admin-only doc). Missing / not live → redirect (test) mode. */
export async function getEmailMode(): Promise<EmailMode> {
  const snap = await admin.firestore().collection('config').doc('emailSettings').get().catch(() => null);
  const data = snap?.data() ?? {};
  const redirectTo = typeof data.redirectAllTo === 'string' && EMAIL_RE.test(data.redirectAllTo.trim())
    ? data.redirectAllTo.trim()
    : DEFAULT_TEST_REDIRECT;
  return { live: data.live === true, redirectTo };
}

/**
 * The ONE place that talks to Brevo. Never throws — returns a SendResult and logs
 * failures, so a calling trigger/cron never crashes because of email. Retries only
 * transient errors (429/5xx/network). On 401/403 (expired/revoked key) it stops
 * immediately and alerts admins in-app (at most once per 24h).
 */
export async function sendEmail(email: OutgoingEmail, mode?: EmailMode): Promise<SendResult> {
  if (!email.to.email || !EMAIL_RE.test(email.to.email)) return 'no_recipient';

  const m = mode ?? await getEmailMode();
  const redirected = !m.live && !email.bypassRedirect;
  const to = redirected ? { email: m.redirectTo, name: 'LANCHAI test inbox' } : email.to;
  const subject = redirected ? `[test → ${email.to.email}] ${email.subject}` : email.subject;

  let apiKey: string;
  try {
    apiKey = BREVO_API_KEY.value();
  } catch {
    logger.error('[email] BREVO_API_KEY secret is not available to this function');
    return 'failed';
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender:      EMAIL_SENDER,
          replyTo:     EMAIL_REPLY_TO,
          to:          [to],
          subject,
          htmlContent: email.html,
          textContent: email.text,
          tags:        [email.tag],
          ...(email.attachments?.length ? { attachment: email.attachments } : {}),
        }),
      });
      if (res.ok) return 'sent';

      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        // Only Brevo's own error `code` / `message` fields are logged — never the
        // request headers, so the API key can't end up in the logs.
        let brevoCode: string | undefined;
        let brevoMessage: string | undefined;
        try {
          const parsed = JSON.parse(body);
          brevoCode = typeof parsed?.code === 'string' ? parsed.code : undefined;
          brevoMessage = typeof parsed?.message === 'string' ? parsed.message.slice(0, 300) : undefined;
        } catch { /* non-JSON body — nothing to log */ }
        logger.error('[email] Brevo rejected the API key', { status: res.status, tag: email.tag, brevoCode, brevoMessage });
        await alertAdminsAuthFailure();
        return 'failed_auth';
      }
      const transient = res.status === 429 || res.status >= 500;
      logger.warn('[email] Brevo error', { status: res.status, attempt, tag: email.tag, body: body.slice(0, 300) });
      if (!transient) return 'failed';
    } catch (err) {
      logger.warn('[email] network error', { attempt, tag: email.tag, err: String(err) });
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }
  logger.error('[email] giving up after retries', { tag: email.tag });
  return 'failed';
}

// In-app admin alert, deduplicated via config/emailHealth.lastAuthAlertAt.
async function alertAdminsAuthFailure(): Promise<void> {
  const db = admin.firestore();
  const healthRef = db.collection('config').doc('emailHealth');
  try {
    const shouldAlert = await db.runTransaction(async tx => {
      const snap = await tx.get(healthRef);
      const last: admin.firestore.Timestamp | undefined = snap.get('lastAuthAlertAt');
      if (last && Date.now() - last.toMillis() < AUTH_ALERT_COOLDOWN_MS) return false;
      tx.set(healthRef, { lastAuthAlertAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (!shouldAlert) return;
    const admins = await db.collection('admins').get();
    await Promise.all(admins.docs.map(a =>
      db.collection('notifications').doc(a.id).collection('items').add({
        type: 'admin',
        title: 'Email sending failed',
        body: 'Email sending failed: Brevo API key expired or invalid. Update the BREVO_API_KEY secret and redeploy the functions.',
        icon: 'alert',
        iconColor: 'coral',
        deepLink: '/admin/shop-settings',
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
    ));
  } catch (err) {
    logger.error('[email] could not write the auth-failure admin alert', { err: String(err) });
  }
}
