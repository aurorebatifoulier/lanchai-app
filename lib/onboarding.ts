import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@lanchai/onboardingComplete';

// Fails toward showing onboarding — a returning user seeing it once more due to a
// storage hiccup is a minor annoyance; a new user silently never seeing it is worse.
export async function getOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {
    // Worst case: onboarding shows again next launch. Non-fatal.
  }
}
