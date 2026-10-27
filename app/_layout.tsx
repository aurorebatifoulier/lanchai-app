import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { QuickAddProvider } from '@/components/quickadd/QuickAddProvider';
import { getOnboardingComplete } from '@/lib/onboarding';
import SplashOverlay from '@/components/SplashOverlay';

// Hold the native splash open until our own animated JS splash (SplashOverlay) is ready
// to take over — otherwise expo-router hides it the instant the first frame paints,
// leaving a gap before our splash appears.
SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading, accountType, btobStatus, businessLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // null = not read yet. Fails toward `false` (show onboarding) on a storage error —
  // see lib/onboarding.ts.
  const [onboardingComplete, setOnboardingCompleteState] = useState<boolean | null>(null);
  useEffect(() => {
    getOnboardingComplete().then(setOnboardingCompleteState);
  }, []);

  // Held true only once auth + onboarding + (for a signed-in user) the BtoB gate
  // fields are all known AND the splash's own intro animation has finished — so the
  // animation always plays out in full, and a blocked BtoB user never sees so much as
  // a flash of the main app before being routed to the pending/rejected screen.
  const [splashAnimDone, setSplashAnimDone] = useState(false);
  const appReady = !loading && onboardingComplete !== null && (!user || !businessLoading);
  const ready = appReady && splashAnimDone;

  useEffect(() => {
    if (!ready) return;
    const onLoginScreen = segments[0] === 'login';
    const onLegalScreen = segments[0] === 'legal';
    const onOnboardingScreen = segments[0] === 'onboarding';
    const onBtobPendingScreen = segments[0] === 'btob-pending';
    const onBtobRejectedScreen = segments[0] === 'btob-rejected';

    // Higher priority than everything below: a signed-in BtoB user who isn't approved
    // yet must land on (and stay on) their status screen, regardless of what the
    // onboarding/login logic below would otherwise decide.
    const isBtobBlocked = !!user && accountType === 'btob' && btobStatus !== 'approved';
    if (isBtobBlocked) {
      // "Contact us" routes to /chat, and the document-upload reminder routes to
      // /profile/business-document — allow both through rather than bouncing
      // straight back to the status screen. Pending/rejected BtoB accounts may also
      // browse the catalogue (tabs, product/category detail, liked) while they wait —
      // only transactional screens (booking, bag, etc.) stay blocked, redirecting them
      // back to their status screen.
      const onChatScreen = segments[0] === 'chat';
      const onProfileScreen = segments[0] === 'profile';
      const onTabsScreen = segments[0] === '(tabs)';
      const onProductScreen = segments[0] === 'product';
      const onCategoryScreen = segments[0] === 'category';
      const onLikedScreen = segments[0] === 'liked';
      const onTarget = onBtobPendingScreen || onBtobRejectedScreen || onChatScreen || onProfileScreen ||
        onTabsScreen || onProductScreen || onCategoryScreen || onLikedScreen;
      if (!onTarget) {
        router.replace(btobStatus === 'rejected' ? '/btob-rejected' : '/btob-pending');
      }
      return;
    }
    // No longer blocked (e.g. just got approved) but still sitting on the status
    // screen — move on into the app.
    if (user && (onBtobPendingScreen || onBtobRejectedScreen)) {
      router.replace('/');
      return;
    }

    // `onboardingComplete` here is a snapshot read once on mount — the onboarding
    // screen persists completion to AsyncStorage itself and navigates directly to
    // /login, without this state ever being told it happened. Excluding
    // `onLoginScreen` from this branch (matching the branch below) means that once
    // the user has actually reached /login, this effect stops trying to force them
    // back to /onboarding based on that now-stale snapshot.
    if (!user && !onboardingComplete && !onOnboardingScreen && !onLoginScreen && !onLegalScreen) {
      router.replace('/onboarding');
    } else if (!user && !onLoginScreen && !onLegalScreen && !onOnboardingScreen) {
      router.replace('/login');
    } else if (user && (onLoginScreen || onOnboardingScreen)) {
      router.replace('/');
    }
  }, [ready, user, onboardingComplete, accountType, btobStatus, segments, router]);

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
        {/* Quick add sheet + "Added to your bag" toast for every product card. */}
        <QuickAddProvider>
          <RootLayoutNav />
        </QuickAddProvider>
      </AuthProvider>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
