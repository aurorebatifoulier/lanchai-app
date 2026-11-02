import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// Guests browse through an anonymous Firebase session (contexts/AuthContext.tsx). Those
// that never sign up are deleted after 30 days without activity (Privacy policy §2:
// "…and it's deleted if you never sign up"), with their recentViews doc — the only data a
// guest can write. Admin SDK listUsers — no Identity Platform needed.
//
// SAFETY: a user is touched ONLY when it has NO sign-in provider at all (providerData
// empty and no email / phone) — the signature of an anonymous user. A guest who signs up
// gets a provider (linkWithCredential) and is never deleted by this job.

const REGION = 'asia-southeast1';
const DAY_MS = 86_400_000;
export const GUEST_INACTIVE_DAYS = 30;

export function isAnonymousRecord(u: admin.auth.UserRecord): boolean {
  return u.providerData.length === 0 && !u.email && !u.phoneNumber;
}

/** Last sign of life: creation, last sign-in, or last token refresh (app use). */
export function lastActivityMs(u: admin.auth.UserRecord): number {
  const t = [u.metadata.creationTime, u.metadata.lastSignInTime, u.metadata.lastRefreshTime]
    .map(x => (x ? Date.parse(x) : 0))
    .filter(n => Number.isFinite(n));
  return Math.max(0, ...t);
}

export const guestCleanupDaily = onSchedule(
  { schedule: '30 4 * * *', timeZone: 'Asia/Vientiane', region: REGION, timeoutSeconds: 540 },
  async () => {
    const cutoff = Date.now() - GUEST_INACTIVE_DAYS * DAY_MS;
    let pageToken: string | undefined;
    let scanned = 0;
    let deleted = 0;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      pageToken = page.pageToken;
      scanned += page.users.length;
      const stale = page.users.filter(u => isAnonymousRecord(u) && lastActivityMs(u) < cutoff).map(u => u.uid);
      if (stale.length === 0) continue;
      const res = await admin.auth().deleteUsers(stale);
      const failed = new Set(res.errors.map(e => stale[e.index]));
      const gone = stale.filter(uid => !failed.has(uid));
      // recentViews/{uid} — the only document a guest can write.
      for (let i = 0; i < gone.length; i += 400) {
        const batch = admin.firestore().batch();
        gone.slice(i, i + 400).forEach(uid => batch.delete(admin.firestore().collection('recentViews').doc(uid)));
        await batch.commit();
      }
      deleted += gone.length;
      if (res.failureCount > 0) logger.warn('[guestCleanup] some deletions failed', { failures: res.failureCount });
    } while (pageToken);
    logger.info('[guestCleanup] done', { scanned, deleted });
  },
);
