import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';

// Scheduled-job health — jobHealth/{jobName} (admin read, server write):
// { lastRunAt, lastOkAt, lastErrorAt, lastError (≤ 300 chars), durationMs }. Shown in
// Admin → Shop settings → Diagnostics. A job that THROWS is recorded and the error is
// re-thrown (so Cloud Scheduler / Error Reporting still see it). Bookkeeping never
// breaks the job itself.

export async function trackJob(name: string, run: () => Promise<unknown>): Promise<void> {
  const ref = admin.firestore().collection('jobHealth').doc(name);
  const started = Date.now();
  try {
    await run();
    await ref.set({ lastRunAt: FieldValue.serverTimestamp(), lastOkAt: FieldValue.serverTimestamp(), durationMs: Date.now() - started }, { merge: true })
      .catch(err => logger.warn('[jobHealth] write failed', { name, err: String(err) }));
  } catch (err) {
    await ref.set({
      lastRunAt: FieldValue.serverTimestamp(), lastErrorAt: FieldValue.serverTimestamp(),
      lastError: String((err as Error)?.message ?? err).slice(0, 300), durationMs: Date.now() - started,
    }, { merge: true }).catch(() => {});
    throw err;
  }
}
