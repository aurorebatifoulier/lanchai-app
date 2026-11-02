import {
  EmailAuthProvider, createUserWithEmailAndPassword, linkWithCredential, signInWithEmailAndPassword,
  updateProfile, type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from './auth';
import { db } from './firebase';
import { requestEmailVerification } from './authEmails';
import { applyInviteCode } from './referral';
import { isProfileComplete } from '@/contexts/AuthContext';
import { AUTH_COPY } from '@/constants/authCopy';

// Sign-in / sign-up actions of the auth screens (components/auth/*). Guests are an
// anonymous session: sign-up LINKS it (same uid), sign-in replaces it.

export const MIN_PASSWORD = 8;
export const EMAIL_RE = /\S+@\S+\.\S+/;
export const PHONE_E164 = /^\+[1-9]\d{6,14}$/;

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const e = AUTH_COPY.errors;
  switch (code) {
    case 'auth/invalid-email': return e.invalidEmail;
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return e.wrongCredentials;
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use': return e.emailInUse;
    case 'auth/account-exists-with-different-credential': return e.otherProvider;
    case 'auth/weak-password': return e.weakPassword;
    case 'auth/network-request-failed': return e.network;
    default: return e.generic;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

/** Step 1: the email account — the guest session is linked when there is one. */
export async function createEmailAccount(email: string, password: string): Promise<User> {
  const current = auth.currentUser;
  const { user } = current?.isAnonymous
    ? await linkWithCredential(current, EmailAuthProvider.credential(email.trim(), password))
    : await createUserWithEmailAndPassword(auth, email.trim(), password);
  await user.getIdToken(true); // rules / callables now see a real account
  return user;
}

/** True when the signed-in account already has its name + phone (sign-up finished). */
export async function hasCompleteProfile(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return isProfileComplete(snap.data());
  } catch {
    return false;
  }
}

/** Step 2: the profile (same fields as before), then verification email + invite code. */
export async function saveIndividualProfile(p: {
  firstName: string; lastName: string; phone: string; inviteCode?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('no-account');
  const displayName = `${p.firstName.trim()} ${p.lastName.trim()}`.trim();
  await updateProfile(user, { displayName });
  await setDoc(doc(db, 'users', user.uid), {
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    displayName,
    phoneNumber: p.phone,
    phone: p.phone,
    phoneVerified: false,
    accountType: 'btoc',
    createdAt: serverTimestamp(),
  }, { merge: true });
  // Google addresses are already verified — only email/password accounts get the email.
  if (!user.emailVerified) { try { await requestEmailVerification(user); } catch {} }
  // Never blocks the sign-up — Account → "Have an invite code?" lets them retry.
  if (p.inviteCode?.trim()) {
    await applyInviteCode(p.inviteCode).catch(err => console.warn('[signUp] invite code not applied:', err));
  }
}
