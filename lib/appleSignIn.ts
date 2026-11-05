import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  linkWithCredential,
  signInWithCredential,
  reauthenticateWithCredential,
  revokeAccessToken,
  type OAuthCredential,
  type User,
} from 'firebase/auth';
import { auth } from './auth';

// "Sign in with Apple" — iOS only (App Store rule 4.8: required because we offer Google).
// Needs a DEV / EAS build: in Expo Go the identity token is issued for Expo Go's bundle id,
// which Firebase refuses. Setup: Firebase console → Authentication → Apple ON (Team ID, Key
// ID + .p8 key — needed for token revocation at account deletion); the entitlement comes
// from the expo-apple-authentication plugin (app.json, ios.usesAppleSignIn).
// Same model as Google (lib/googleSignIn.ts): a guest session is LINKED when that Apple ID
// is new to LANCHAI, an existing LANCHAI Apple account simply signs in.

export function appleSignInSupported(): boolean {
  return Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export class AppleCancelled extends Error {}

/** Apple gives the name ONLY on the very first authorization of this app — prefill step 2. */
export interface AppleNames { firstName: string; lastName: string }

const isCancel = (err: unknown) => (err as { code?: string })?.code === 'ERR_REQUEST_CANCELED';

/** Native Apple sheet → Firebase credential (raw nonce kept for Firebase, its SHA-256 sent to Apple). */
async function appleCredential(): Promise<{ credential: OAuthCredential; names: AppleNames; authorizationCode: string | null }> {
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let res: AppleAuthentication.AppleAuthenticationCredential;
  try {
    res = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (isCancel(err)) throw new AppleCancelled('cancelled');
    throw err;
  }
  if (!res.identityToken) throw new AppleCancelled('no-token');
  const credential = new OAuthProvider('apple.com').credential({ idToken: res.identityToken, rawNonce });
  const names = { firstName: res.fullName?.givenName ?? '', lastName: res.fullName?.familyName ?? '' };
  return { credential, names, authorizationCode: res.authorizationCode };
}

export async function continueWithApple(): Promise<{ user: User; names: AppleNames }> {
  const { credential, names } = await appleCredential();
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const { user } = await linkWithCredential(current, credential);
      await user.getIdToken(true);
      return { user, names };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') throw err;
    }
  }
  const { user } = await signInWithCredential(auth, credential);
  return { user, names };
}

/**
 * Before deleting an Apple account: re-authenticates with Apple (the server needs a
 * recent login) and revokes the Apple token (App Store rule 5.1.1(v)). A failed
 * revocation never blocks the deletion — it's logged.
 */
export async function reauthAndRevokeApple(user: User): Promise<void> {
  const { credential, authorizationCode } = await appleCredential();
  await reauthenticateWithCredential(user, credential);
  if (authorizationCode) {
    await revokeAccessToken(auth, authorizationCode).catch(err =>
      console.warn('[appleSignIn] token revocation failed:', (err as { code?: string })?.code));
  }
}
