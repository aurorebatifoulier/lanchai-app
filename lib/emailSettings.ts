import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

// config/emailSettings — ADMIN-ONLY (excluded from the renter-readable config/* rule).
// Emails are in TEST mode (everything redirected) unless `live` is explicitly true —
// mirrors functions/src/email/send.ts's getEmailMode(), which is what actually decides.
export const DEFAULT_TEST_REDIRECT = 'lanchai.laos@gmail.com';

export interface EmailSettings {
  live: boolean;
  redirectAllTo: string;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const snap = await getDoc(doc(db, 'config', 'emailSettings'));
  const d = snap.data() ?? {};
  return {
    live: d.live === true,
    redirectAllTo: typeof d.redirectAllTo === 'string' ? d.redirectAllTo : '',
  };
}

export async function saveEmailSettings(settings: EmailSettings): Promise<void> {
  await setDoc(doc(db, 'config', 'emailSettings'), {
    live: settings.live,
    redirectAllTo: settings.redirectAllTo.trim(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export interface TestEmailsResult {
  to: string;
  sent: number;
  total: number;
  results: Record<string, string>;
}

/** Admin-only callable (functions/src/email/triggers.ts) — every template, sample data, to you. */
export async function sendTestEmails(): Promise<TestEmailsResult> {
  const call = httpsCallable<void, TestEmailsResult>(functions, 'sendTestEmails');
  const res = await call();
  return res.data;
}
