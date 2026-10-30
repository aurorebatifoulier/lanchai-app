import { Share } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';

// Referral programme — app side. Codes and links are server-written
// (functions/src/referral.ts); the reward is credited server-side after the referred
// renter's first returned rental.

const message = (err: unknown, fallback: string) => (err as { message?: string })?.message || fallback;

export async function getMyInviteCode(): Promise<string> {
  try {
    const res = await httpsCallable<unknown, { code: string }>(functions, 'getMyInviteCode')();
    return res.data.code;
  } catch (err) {
    throw new Error(message(err, 'Could not load your invite code.'));
  }
}

/** Applies a friend's code (new renters, before their first booking). */
export async function applyInviteCode(code: string): Promise<void> {
  try {
    await httpsCallable(functions, 'applyInviteCode')({ code: code.trim() });
  } catch (err) {
    throw new Error(message(err, 'Could not apply this code. Please try again.'));
  }
}

/** Native share sheet with a short message + the code (deep link later, installable build). */
export async function shareInvite(code: string, welcomePercent: number): Promise<void> {
  await Share.share({ message: LOYALTY_COPY.referralShareMessage(code, welcomePercent) });
}
