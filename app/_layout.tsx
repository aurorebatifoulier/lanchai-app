// FIRST: caps the system font size on every Text / TextInput (constants/typography.ts).
import '@/lib/fontScaleCap';
import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, usePathname, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { QuickAddProvider } from '@/components/quickadd/QuickAddProvider';
import { GuestGateProvider, useRequireAccount } from '@/components/auth/GuestGate';
import { authFlow } from '@/lib/authFlow';
import { getOnboardingComplete, setOnboardingComplete, onboardingDoneNow } from '@/lib/onboarding';
import SplashOverlay from '@/components/SplashOverlay';

// Hold the native splash open until our own animated JS splash (SplashOverlay) is ready
// to take over — otherwise expo-router hides it the instant the first frame paints,
// leaving a gap before our splash appears.
SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

// Screens that need a REAL account. A guest (anonymous session) sent here goes to the
// sign-in screen instead. Everything else (Home, Explore, product, category, collection,
// reviews, legal, FAQ) is open to guests — deep links included.
const ACCOUNT_ONLY = new Set([
  'booking', 'bag', 'chat', 'liked', 'notifications', 'rentals', 'review', 'claim',
  'admin', 'admin-chat', 'btob-pending', 'btob-rejected',
]);
const GUEST_PROFILE_PAGES = new Set(['faq']);

function RootLayoutNav() {
  const { user, hasAccount, isGuest, loading, accountType, btobStatus, businessLoading, profileComplete } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();
  const requireAccount = useRequireAccount();

  // null = not read yet. Fails toward `false` (show onboarding) on a storage error —
  // see lib/onboarding.ts.
  const [onboardingComplete, setOnboardingCompleteState] = useState<boolean | null>(null);
  useEffect(() => {
    getOnboardingComplete().then(setOnboardingCompleteState);
  }, []);

  // Held true only once auth (incl. the guest session) + onboarding + (for an account)
  // the BtoB gate fields are all known AND the splash's own intro animation has finished
  // — so the animation always plays out in full, and a blocked BtoB user never sees so
  // much as a flash of the main app before being routed to the pending/rejected screen.
  const [splashAnimDone, setSplashAnimDone] = useState(false);
  const onboardingShown = useRef(false);
  // Any account on this device → first launch is over for good (device flag).
  useEffect(() => {
    if (!hasAccount) return;
    onboardingShown.current = true;
    setOnboardingComplete();
    setOnboardingCompleteState(true);
  }, [hasAccount]);
  const appReady = !loading && onboardingComplete !== null && (!hasAccount || !businessLoading);
  const ready = appReady && splashAnimDone;

  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    const onLoginScreen = first === 'login';
    const onLegalScreen = first === 'legal';
    const onOnboardingScreen = first === 'onboarding';
    const onBtobPendingScreen = first === 'btob-pending';
    const onBtobRejectedScreen = first === 'btob-rejected';

    // Higher priority than everything below: a signed-in BtoB user who isn't approved
    // yet must land on (and stay on) their status screen, regardless of what the
    // logic below would otherwise decide.
    const isBtobBlocked = hasAccount && accountType === 'btob' && btobStatus !== 'approved';
    if (isBtobBlocked) {
      // "Contact us" routes to /chat, and the document-upload reminder routes to
      // /profile/business-document — allow both through rather than bouncing
      // straight back to the status screen. Pending/rejected BtoB accounts may also
      // browse the catalogue (tabs, product/category detail, liked) while they wait —
      // only transactional screens (booking, bag, etc.) stay blocked, redirecting them
      // back to their status screen.
      const onTarget = onBtobPendingScreen || onBtobRejectedScreen || first === 'chat' || first === 'profile' ||
        first === '(tabs)' || first === 'product' || first === 'category' || first === 'liked';
      if (!onTarget) {
        router.replace(btobStatus === 'rejected' ? '/btob-rejected' : '/btob-pending');
      }
      return;
    }
    // No longer blocked (e.g. just got approved) but still sitting on the status
    // screen — move on into the app.
    if (hasAccount && (onBtobPendingScreen || onBtobRejectedScreen)) {
      router.replace('/');
      return;
    }

    // An account never sits on onboarding / sign-in — back to where it came from (the
    // guest sheet's pending action then resumes), or Home. Not while the sign-up screen
    // is still saving the new profile (it leaves by itself).
    if (hasAccount) {
      if (onOnboardingScreen) router.replace('/');
      // …and only once the profile is known and complete (an unfinished sign-up stays on
      // step 2).
      else if (onLoginScreen && !authFlow.busy && !businessLoading && profileComplete) {
        if (router.canGoBack()) router.back(); else router.replace('/');
      }
      return;
    }

    // No session at all: the guest session couldn't open (e.g. Anonymous sign-in
    // disabled in the Firebase console) — fall back to the old sign-in wall.
    if (!user) {
      if (!onLoginScreen && !onLegalScreen && !onOnboardingScreen) {
        router.replace(onboardingComplete ? '/login' : '/onboarding');
      }
      return;
    }

    // A device that has seen an account has had its first launch: never show the
    // onboarding to the guest session that follows a sign-out / account deletion.
    // (Device flag, set here and by the onboarding screen — never reset.)
    // Guest. `onboardingComplete` is a snapshot read once on mount — the onboarding
    // screen persists completion itself and navigates away, so it's shown at most ONCE
    // per launch (ref), never forced again after the guest leaves it.
    if (onOnboardingScreen) onboardingShown.current = true;
    if (isGuest && !onboardingComplete && !onboardingDoneNow() && !onboardingShown.current && !onLegalScreen && !onLoginScreen) {
      onboardingShown.current = true;
      router.replace('/onboarding');
      return;
    }
    const accountOnly = !!first && (ACCOUNT_ONLY.has(first) ||
      (first === 'profile' && !GUEST_PROFILE_PAGES.has(String((segments as string[])[1] ?? ''))));
    if (accountOnly) {
      // Leave the screen, show the guest sheet, and open it again once signed in.
      const query = Object.entries(searchParams)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(Array.isArray(v) ? v[0] : v))}`)
        .join('&');
      const href = query ? `${pathname}?${query}` : pathname;
      if (router.canGoBack()) router.back(); else router.replace('/');
      requireAccount({ action: first === 'chat' ? 'chat' : 'other', run: () => router.push(href as never) });
    }
  }, [ready, user, hasAccount, isGuest, onboardingComplete, accountType, btobStatus, businessLoading, profileComplete, segments, router, pathname, searchParams, requireAccount]);

  if (!ready) {
    return <SplashOverlay onFinish={() => setSplashAnimDone(true)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="btob-pending" options={{ animation: 'fade' }} />
      <Stack.Screen name="btob-rejected" options={{ animation: 'fade' }} />
      <Stack.Screen name="product/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="category/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="reviews/[productId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="booking/new" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="booking/summary" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="booking/confirmation" options={{ animation: 'fade' }} />
      <Stack.Screen name="rentals/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/personal-info"    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/business-document" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/pickup-location"  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/security"         options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/faq"              options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="profile/delete-account"   options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/terms"              options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/privacy"            options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="review/[productId]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="claim/[reservationId]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="liked" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="admin-chat/[conversationId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="admin" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        {/* Guest sheet ("Good taste. Now, who are you?") + resume after sign-in. */}
        <GuestGateProvider>
          {/* Quick add sheet + "Added to your bag" toast for every product card. */}
          <QuickAddProvider>
            <RootLayoutNav />
          </QuickAddProvider>
        </GuestGateProvider>
      </AuthProvider>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
