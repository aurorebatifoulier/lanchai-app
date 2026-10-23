import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { createHash } from 'crypto';
import { BREVO_API_KEY, REGION } from './email/config';
import { sendEmail } from './email/send';
import { getEmailShop } from './email/context';
import { passwordResetEmail, emailVerificationEmail } from './email/templates';

// Branded password-reset / email-verification emails. The Firebase action links are
// generated with the Admin SDK (default action page, lanchai-app.firebaseapp.com/__/auth/
// action) and sent through sendEmail() with `security: true` — always to the account's
// own address, even in test mode. Firebase Auth's own SMTP (Brevo) stays configured as
// the app's fallback when these callables can't be reached.
//
// Security:
// - requestPasswordReset answers { ok: true } whether or not the account exists (no
//   enumeration). Only a rate-limit hit is reported, and it's counted BEFORE the account
//   lookup, so it says nothing about the account either. Send failures aren't reported
//   (they can only happen for existing accounts).
// - requestEmailVerification takes no email: it uses the signed-in account's own.
// - Server-side rate limits in authEmailLimits/* (no client rule → denied by the
//   catch-all in firestore.rules). Keys are SHA-256 hashes — no email or IP stored.
// - The link is NEVER logged; logs carry a result and a short email hash only.

const db = () => admin.firestore();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;

export const AUTH_EMAIL_LIMITS = {
  perEmailPerHour: 3,   // password reset, per email address
  perUserPerHour: 3,    // verification, per account
  perIpPerHour: 10,     // per caller IP (both flows)
  globalPerHour: 200,   // all security emails — protects the Brevo quota
};

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const shortHash = (v: string) => hash(v).slice(0, 12);

function callerIp(request: CallableRequest): string | null {
  const fwd = request.rawRequest?.headers?.['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || request.rawRequest?.ip || null;
}

/**
 * Sliding one-hour window over every key, in ONE transaction: if any key is at its
 * limit nothing is recorded and false is returned; otherwise `now` is added to all.
 */
async function takeRateLimit(keys: { id: string; max: number }[]): Promise<boolean> {
  const now = Date.now();
  const refs = keys.map(k => db().collection('authEmailLimits').doc(k.id));
  return db().runTransaction(async tx => {
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    const recent = snaps.map(s => ((s.get('hits') as number[] | undefined) ?? []).filter(t => now - t < HOUR));
    if (recent.some((hits, i) => hits.length >= keys[i].max)) return false;
    refs.forEach((r, i) => tx.set(r, { hits: [...recent[i], now], updatedAt: admin.firestore.Timestamp.fromMillis(now) }));
    return true;
  });
}

function limitKeys(request: CallableRequest, own: { id: string; max: number }) {
  const ip = callerIp(request);
  return [
    own,
    ...(ip ? [{ id: `ip_${hash(ip)}`, max: AUTH_EMAIL_LIMITS.perIpPerHour }] : []),
    { id: 'global', max: AUTH_EMAIL_LIMITS.globalPerHour },
  ];
}

const tooMany = () => new HttpsError('resource-exhausted', 'Too many attempts, please try again later.', { code: 'rate-limited' });

// ── requestPasswordReset({ email }) ─────────────────────────────────────────────
export const requestPasswordReset = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const raw = (request.data as { email?: unknown } | undefined)?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Please enter a valid email address.', { code: 'invalid-email' });
  }
  const tag = shortHash(email);
  if (!(await takeRateLimit(limitKeys(request, { id: `reset_${hash(email)}`, max: AUTH_EMAIL_LIMITS.perEmailPerHour })))) {
    logger.warn('[authEmails] password reset rate-limited', { emailHash: tag });
    throw tooMany();
  }

  let link: string;
  try {
    link = await admin.auth().generatePasswordResetLink(email);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
      logger.info('[authEmails] password reset: no account', { emailHash: tag });
    } else {
      logger.error('[authEmails] password reset link failed', { emailHash: tag, code });
    }
    return { ok: true };
  }
  const result = await sendEmail({ to: { email }, ...passwordResetEmail(link, await getEmailShop()), tag: 'auth-password-reset', security: true });
  logger.info('[authEmails] password reset', { emailHash: tag, result });
  return { ok: true };
});

// ── requestEmailVerification() — signed-in account's own address ────────────────
export const requestEmailVerification = onCall({ region: REGION, secrets: [BREVO_API_KEY] }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.', { code: 'unauthenticated' });
  const user = await admin.auth().getUser(uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'This account has no email address.', { code: 'no-email' });
  if (user.emailVerified) return { ok: true, alreadyVerified: true };

  if (!(await takeRateLimit(limitKeys(request, { id: `verify_${uid}`, max: AUTH_EMAIL_LIMITS.perUserPerHour })))) {
    logger.warn('[authEmails] verification rate-limited', { uid });
    throw tooMany();
  }
  const link = await admin.auth().generateEmailVerificationLink(user.email);
  const result = await sendEmail({ to: { email: user.email, name: user.displayName || undefined }, ...emailVerificationEmail(link, await getEmailShop()), tag: 'auth-email-verification', security: true });
  logger.info('[authEmails] verification', { uid, result });
  if (result !== 'sent') {
    throw new HttpsError('unavailable', 'Could not send the email. Please try again.', { code: 'send-failed' });
  }
  return { ok: true };
});
