import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail, sendEmailVerification, type User } from 'firebase/auth';
import { auth } from '@/lib/auth';
import { functions } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Branded account-security emails, sent server-side (functions/src/authEmails.ts).
// If the callable can't do it (unreachable, send failure), fall back to Firebase Auth's
// own email (plain text, same SMTP) — except on a rate-limit hit, which is final.

export class AuthEmailRateLimitError extends Error {
  constructor() { super('Too many attempts, please try again later.'); }
}

const isRateLimited = (err: unknown) =>
  (err as { details?: { code?: string } })?.details?.code === 'rate-limited';

/** Always resolves the same way whether or not an account exists for `email`. */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await httpsCallable(functions, 'requestPasswordReset')({ email: email.trim() });
  } catch (err) {
    if (isRateLimited(err)) throw new AuthEmailRateLimitError();
    // Fallback: Firebase's own reset email. Don't leak whether the account exists.
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (fallbackErr) {
      const code = (fallbackErr as { code?: string })?.code ?? '';
      if (code === 'auth/too-many-requests') throw new AuthEmailRateLimitError();
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') throw fallbackErr;
    }
  }
}

/** Verification email for the signed-in user's own address. */
export async function requestEmailVerification(user: User): Promise<void> {
  try {
    await httpsCallable(functions, 'requestEmailVerification')();
  } catch (err) {
    if (isRateLimited(err)) throw new AuthEmailRateLimitError();
    await sendEmailVerification(user);
  }
}

/**
 * Welcome email, once the email address is verified. Asked once per device and user
 * (AsyncStorage) — the server re-checks emailVerified and sends it only once per account.
 */
export async function requestWelcomeEmail(uid: string): Promise<void> {
  const key = `welcomeEmailRequested:${uid}`;
  try {
    if ((await AsyncStorage.getItem(key)) === '1') return;
    await httpsCallable(functions, 'sendWelcomeEmail')();
    await AsyncStorage.setItem(key, '1');
  } catch {
    /* retried at the next launch */
  }
}
