// The scheduled Cloud Functions and how often they run — Admin → Diagnostics flags a job
// as "late" when its last successful run is older than twice its period. Keep in sync
// with the onSchedule() definitions (jobHealth.ts trackJob names).
export const SCHEDULED_JOBS: { name: string; label: string; everyMin: number }[] = [
  { name: 'lateReturnAlerts', label: 'Late-return alerts', everyMin: 15 },
  { name: 'releaseSettledStock', label: 'Stock release after returns', everyMin: 15 },
  { name: 'missedPickupAlerts', label: 'Missed pick-up + ID alerts', everyMin: 60 },
  { name: 'availabilityWatchJob', label: '"Notify me" availability', everyMin: 60 },
  { name: 'emailDailyReminders', label: 'Pick-up reminder emails (18:00)', everyMin: 1440 },
  { name: 'emailReturnReminders', label: 'Return reminder emails (18:05)', everyMin: 1440 },
  { name: 'emailReviewFollowUps', label: 'Review follow-up emails (18:10)', everyMin: 1440 },
  { name: 'promoWalletDaily', label: 'Promo code expiry reminders', everyMin: 1440 },
  { name: 'residencyDaily', label: 'Residency expiry', everyMin: 1440 },
  { name: 'documentRetentionDaily', label: 'ID / proof retention', everyMin: 1440 },
  { name: 'guestCleanupDaily', label: 'Guest cleanup', everyMin: 1440 },
  { name: 'expireEarlyAccess', label: 'Early access expiry', everyMin: 15 },
];

export type JobState = 'ok' | 'error' | 'late' | 'never';

/** ok · error (last run failed) · late (no success for 2 periods) · never (no record yet). */
export function jobState(h: { lastOkAtMs: number | null; lastErrorAtMs: number | null } | null, everyMin: number, nowMs: number): JobState {
  if (!h || (h.lastOkAtMs == null && h.lastErrorAtMs == null)) return 'never';
  if (h.lastErrorAtMs != null && (h.lastOkAtMs == null || h.lastErrorAtMs > h.lastOkAtMs)) return 'error';
  if (h.lastOkAtMs != null && nowMs - h.lastOkAtMs > 2 * everyMin * 60_000) return 'late';
  return 'ok';
}
