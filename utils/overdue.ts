import { Timestamp } from 'firebase/firestore';

export type OverdueSeverity = 'light' | 'moderate' | 'severe';

export function overdueSeverity(returnAt: Timestamp): OverdueSeverity {
  const hoursLate = (Date.now() - returnAt.toMillis()) / 3_600_000;
  if (hoursLate >= 72) return 'severe';
  if (hoursLate >= 24) return 'moderate';
  return 'light';
}

export function overdueLabel(returnAt: Timestamp): string {
  const hoursLate = (Date.now() - returnAt.toMillis()) / 3_600_000;
  if (hoursLate >= 48) return `${Math.floor(hoursLate / 24)}d late`;
  return `${Math.floor(hoursLate)}h late`;
}
