// Pure decision logic of lateReturnAlerts (index.ts) — no Firebase imports, so the
// dry-run simulation (scripts/simulate-late-returns.js) runs the exact same code.
import { isPenaltyStage, type LatePenaltyResult } from './shared/latePenalty';

// Escalation ladder, lowest → highest. When several thresholds are crossed in one run
// (function downtime, back-dated test data), only the HIGHEST one notifies; the lower
// flags are just marked done so the renter isn't spammed with stale messages.
export type LateAlertKey = 'lateAlert0h' | 'lateAlert1h' | 'lateAlertGrace' | 'lateAlert24h' | 'lateAlert48h' | 'lateAlert72h';
export type LateEmailStageKey = 'tier1' | 'tier2' | 'tier3' | 'nonReturn';

/** Only these alerts also send an email; the 0h/+1h warnings stay in-app. */
export const LATE_EMAIL_STAGE: Partial<Record<LateAlertKey, LateEmailStageKey>> = {
  lateAlertGrace: 'tier1', lateAlert24h: 'tier2', lateAlert48h: 'tier3', lateAlert72h: 'nonReturn',
};
const STAGE_RANK: Record<LateEmailStageKey, number> = { tier1: 1, tier2: 2, tier3: 3, nonReturn: 4 };

/** Alerts due this run for one reservation (ladder order), given its stored flags. */
export function dueLateAlerts(
  flags: Partial<Record<LateAlertKey, unknown>>,
  penalty: LatePenaltyResult,
  returnAtMs: number,
  nowMs: number,
): LateAlertKey[] {
  // The 0h "due now" alert fires from the due time itself (returnAt <= now).
  if (returnAtMs > nowMs) return [];
  const due: LateAlertKey[] = [];
  if (!flags.lateAlert0h) due.push('lateAlert0h');
  if (penalty.hoursLate >= 1 && !flags.lateAlert1h) due.push('lateAlert1h');
  if (penalty.stage === 'tier1' && !flags.lateAlertGrace) due.push('lateAlertGrace');
  if (penalty.stage === 'tier2' && !flags.lateAlert24h) due.push('lateAlert24h');
  if (penalty.stage === 'tier3' && !flags.lateAlert48h) due.push('lateAlert48h');
  if (penalty.stage === 'nonReturn' && !flags.lateAlert72h) due.push('lateAlert72h');
  return due;
}

export interface LateRow {
  id: string;
  orderId: string;
  renterId: string;
  penalty: LatePenaltyResult;
  /** Highest alert sent for this line this run (null = none). */
  highest: LateAlertKey | null;
}

export interface LateEmailBatch {
  orderId: string;
  renterId: string;
  stage: LateEmailStageKey;
  lines: { id: string; stage: LateEmailStageKey; amountLak: number; days: number }[];
}

/**
 * ONE email per order and run: the highest email stage any of its lines reached this
 * run, carrying EVERY late line of that order (fees are summed in the template).
 */
export function planLateEmails(rows: LateRow[]): LateEmailBatch[] {
  const queued = new Map<string, { renterId: string; stage: LateEmailStageKey }>();
  for (const r of rows) {
    const stage = r.highest ? LATE_EMAIL_STAGE[r.highest] : undefined;
    if (!stage) continue;
    const q = queued.get(r.orderId);
    if (!q || STAGE_RANK[stage] > STAGE_RANK[q.stage]) queued.set(r.orderId, { renterId: r.renterId, stage });
  }
  const batches: LateEmailBatch[] = [];
  for (const [orderId, { renterId, stage }] of queued) {
    const lines = rows
      .filter(r => r.orderId === orderId && r.renterId === renterId && isPenaltyStage(r.penalty.stage))
      .map(r => ({ id: r.id, stage: r.penalty.stage as LateEmailStageKey, amountLak: r.penalty.amountLak, days: r.penalty.days }));
    if (lines.length) batches.push({ orderId, renterId, stage, lines });
  }
  return batches;
}
