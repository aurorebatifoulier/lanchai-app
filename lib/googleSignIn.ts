import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleAuthProvider, linkWithCredential, signInWithCredential, type User } from 'firebase/auth';
import { auth } from './auth';
import { AUTH_COPY } from '@/constants/authCopy';

// "Continue with Google" — needs a DEV / EAS build: Google OAuth can't redirect back to
// Expo Go (no custom scheme, and the auth.expo.io proxy is gone), and the native module
// (@react-native-google-signin/google-signin) isn't in Expo Go. The button only shows when
// googleSignInAvailable(); the module is required lazily so Expo Go never loads it.
// Setup: Firebase console → Google provider ON; EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = the Web
// client ID; the EAS build's SHA-1 / SHA-256 on the Android app. iOS (later): add the
// config plugin with `iosUrlScheme` in app.json.

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export function googleSignInAvailable(): boolean {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && WEB_CLIENT_ID.length > 0;
}

export class GoogleCancelled extends Error {}

/** A Google-side failure with a renter-friendly message (shown as is by login.tsx). */
export class GoogleSignInError extends Error {
  constructor(readonly friendly: string, readonly reason: string) { super(reason); }
}

/**
 * Maps the native library's errors: cancelled / already in progress → silent;
 * no Play services → explain; DEVELOPER_ERROR (code 10 — the app's SHA-1 / SHA-256 or the
 * Web client ID isn't registered in Firebase, e.g. a Play-signed build without the Play
 * signing fingerprint) → "isn't available", logged for us.
 */
function mapGoogleError(err: unknown, codes: Record<string, string>): never {
  const code = String((err as { code?: unknown })?.code ?? '');
  const message = String((err as { message?: unknown })?.message ?? '');
  if (code === codes.SIGN_IN_CANCELLED || code === codes.IN_PROGRESS) throw new GoogleCancelled('cancelled');
  if (code === codes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleSignInError(AUTH_COPY.errors.googlePlayServices, 'play-services');
  if (code === '10' || /DEVELOPER_ERROR/i.test(message)) {
    console.warn('[googleSignIn] DEVELOPER_ERROR — check the SHA-1 / SHA-256 fingerprints and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    throw new GoogleSignInError(AUTH_COPY.errors.googleSetup, 'developer-error');
  }
  throw err;
}

/** Google profile names, to prefill sign-up step 2. */
export interface GoogleNames { firstName: string; lastName: string }

/**
 * Signs in with Google. A guest session is LINKED (same uid) when that Google account is
 * new to LANCHAI; an existing LANCHAI Google account simply signs in.
 */
export async function continueWithGoogle(): Promise<{ user: User; names: GoogleNames }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isSuccessResponse, statusCodes } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  let res: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    res = await GoogleSignin.signIn();
  } catch (err) {
    mapGoogleError(err, statusCodes);
  }
  if (!isSuccessResponse(res) || !res.data.idToken) throw new GoogleCancelled('cancelled');
  const credential = GoogleAuthProvider.credential(res.data.idToken);
  const names = { firstName: res.data.user.givenName ?? '', lastName: res.data.user.familyName ?? '' };
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
