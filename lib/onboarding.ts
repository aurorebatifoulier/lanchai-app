import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@lanchai/onboardingComplete';

// DEVICE-level "first launch done" flag. Set when the onboarding is finished OR skipped,
// and as soon as any account has been signed in on this device. NEVER reset — not on sign
// out, sign in, account switch or account deletion (a sign-out opens a fresh guest session
// that goes straight to Home). Also kept in memory so a value set during this launch is
// seen immediately.
let cached: boolean | null = null;

// Fails toward showing onboarding — a returning user seeing it once more due to a
// storage hiccup is a minor annoyance; a new user silently never seeing it is worse.
export async function getOnboardingComplete(): Promise<boolean> {
  if (cached) return true;
  try {
    cached = (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    cached = false;
  }
  return cached;
}

/** Synchronous view of the flag for this launch (true once set or read as set). */
export function onboardingDoneNow(): boolean {
  return cached === true;
}

export async function setOnboardingComplete(): Promise<void> {
  cached = true;
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {
    // Worst case: onboarding shows again next launch. Non-fatal.
  }
}
