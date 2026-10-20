import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { SendResult } from './send';

// Idempotency markers: one MAP field per email type on the document it's about, e.g.
// reservations/{id}.emailConfirmation = { status, at }. Maps (not arrays), so
// serverTimestamp() is allowed (see CLAUDE.md's Timestamp gotcha). ANY existing status
// means "already handled" — an email is never sent twice, even if a trigger re-runs.
export type EmailField =
  | 'emailConfirmation'
  | 'emailPickupReminder'
  | 'emailReturnReminder'
  | 'emailCancellation'
  | 'emailNoShow'
  | 'emailReviewFollowUp'
  | 'emailReceipt'
  | 'emailBtobApproved'
  | 'emailBtobRejected';

/** Atomically claims `field` on every doc in `refs` that hasn't been claimed yet. */
export async function claimEmail(
  refs: admin.firestore.DocumentReference[],
  field: EmailField,
): Promise<admin.firestore.DocumentReference[]> {
  return admin.firestore().runTransaction(async tx => {
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    const claimable = snaps.filter(s => s.exists && !s.get(field)?.status).map(s => s.ref);
    for (const ref of claimable) {
      tx.update(ref, { [field]: { status: 'sending', at: FieldValue.serverTimestamp() } });
    }
    return claimable;
  });
}

export async function finishEmail(
  refs: admin.firestore.DocumentReference[],
  field: EmailField,
  result: SendResult,
): Promise<void> {
  await Promise.all(refs.map(r =>
    r.update({ [field]: { status: result, at: FieldValue.serverTimestamp() } }).catch(() => {}),
  ));
}
