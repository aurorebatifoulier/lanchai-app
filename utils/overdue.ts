import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';

// Visual severity of an overdue return, aligned with the late-penalty tiers in
// functions/src/shared/latePenalty.ts (upper bounds inclusive): ≤24h light (1 day),
// ≤48h moderate (1.5 days), ≤72h high (2 days), >72h severe (non-return).
// Purely visual — no grace period here (renters must never see it).
export type OverdueSeverity = 'light' | 'moderate' | 'high' | 'severe';

export function overdueSeverity(returnAt: Timestamp): OverdueSeverity {
  const hoursLate = (Date.now() - returnAt.toMillis()) / 3_600_000;
  if (hoursLate > 72) return 'severe';
  if (hoursLate > 48) return 'high';
  if (hoursLate > 24) return 'moderate';
  return 'light';
}

/** Shared chip colors for every overdue badge/chip in the app. */
export function overdueChipColors(sev: OverdueSeverity): { bg: string; border: string; fg: string } {
  switch (sev) {
    case 'severe':   return { bg: COLORS.danger, border: COLORS.danger,          fg: '#FFFFFF' };
    case 'high':     return { bg: '#FCA5A5',     border: COLORS.danger,          fg: '#7F1D1D' };
    case 'moderate': return { bg: '#FEE2E2',     border: '#FCA5A5',              fg: COLORS.danger };
    default:         return { bg: COLORS.amberTint, border: COLORS.amberTintBorder, fg: COLORS.amberTintText };
  }
}

export function overdueLabel(returnAt: Timestamp): string {
  const hoursLate = (Date.now() - returnAt.toMillis()) / 3_600_000;
  if (hoursLate >= 48) return `${Math.floor(hoursLate / 24)}d late`;
  return `${Math.floor(hoursLate)}h late`;
}

/**
 * Renter-facing late-fee line. Callers must only render it when amountLak > 0 —
 * a zero amount (internal grace period) must never be shown to renters.
 */
export function renterLateFeeText(amountLak: number, days: number | undefined): string {
  const daysPart = days ? ` (${days} rental ${days === 1 ? 'day' : 'days'})` : '';
  return `A late fee of ${amountLak.toLocaleString('en-US')} LAK${daysPart} may apply, pending confirmation from our team`;
}
