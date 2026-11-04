import { collection, getDocs, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { SCHEDULED_JOBS, jobState, type JobState } from '@/functions/src/shared/jobs';

export interface JobRow { name: string; label: string; state: JobState; lastOkAtMs: number | null; lastError: string | null }

/** Admin only: every scheduled job with its health (jobHealth/{name}). */
export async function getJobHealth(): Promise<JobRow[]> {
  const snap = await getDocs(collection(db, 'jobHealth'));
  const byName = new Map(snap.docs.map(d => [d.id, d.data()]));
  const ms = (t: unknown) => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : null);
  const now = Date.now();
  return SCHEDULED_JOBS.map(j => {
    const h = byName.get(j.name);
    const lastOkAtMs = ms(h?.lastOkAt);
    const lastErrorAtMs = ms(h?.lastErrorAt);
    return {
      name: j.name, label: j.label, lastOkAtMs,
      state: jobState(h ? { lastOkAtMs, lastErrorAtMs } : null, j.everyMin, now),
      lastError: typeof h?.lastError === 'string' ? h.lastError : null,
    };
  });
}
