import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tabs } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import { requestEmailVerification } from '@/lib/authEmails';
import { db } from '@/lib/firebase';
import { subscribeToUnreadInboxCount } from '@/lib/chat';

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={name as never} size={20} color={focused ? COLORS.amber : COLORS.fg3} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isAdmin, user } = useAuth();
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);

  // ── Email verification banner ──────────────────────────────────────────────
  const [emailVerified, setEmailVerified] = useState<boolean>(
    auth.currentUser?.emailVerified ?? true,
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Success banner — shown once when emailVerified flips false → true
  const [successBannerVisible, setSuccessBannerVisible] = useState(false);
  const prevEmailVerifiedRef  = useRef<boolean>(auth.currentUser?.emailVerified ?? true);
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (resendTimerRef.current)     clearTimeout(resendTimerRef.current);
      if (successDismissTimerRef.current) clearTimeout(successDismissTimerRef.current);
    };
  }, []);

  // Reset banner whenever the signed-in user changes (login / logout / sign-up)
  useEffect(() => {
    setEmailVerified(auth.currentUser?.emailVerified ?? true);
    setBannerDismissed(false);
    if (resendTimerRef.current) clearTimeout(resendTimerRef.current);
    setResendStatus('idle');
  }, [user?.uid]);

  // Re-read emailVerified from Firebase (after user clicks the link in their inbox)
  const checkVerification = useCallback(async () => {
    const cu = auth.currentUser;
    if (!cu || cu.emailVerified) return;
    try {
      await cu.reload();
      setEmailVerified(auth.currentUser?.emailVerified ?? false);
    } catch {}
  }, []);

  // Auto-refresh when the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkVerification();
    });
    return () => sub.remove();
  }, [checkVerification]);

  // Periodic background poll (every 30s) while email is still unverified —
  // catches the case where the user verifies in another tab without leaving the app.
  useEffect(() => {
    if (emailVerified) return;
    const interval = setInterval(checkVerification, 30_000);
    return () => clearInterval(interval);
  }, [emailVerified, checkVerification]);

  // Fire-and-forget: write a notification doc so the bell icon picks it up.
  const sendVerificationNotif = useCallback(async () => {
    const cu = auth.currentUser;
    if (!cu) return;
    try {
      await addDoc(collection(db, 'notifications', cu.uid, 'items'), {
        type:       'system',
        title:      'Email verified',
        body:       'Your email address has been confirmed. Your account is fully set up.',
        icon:       'check-circle',
        iconColor:  'green',
        deepLink:   '/profile/personal-info',
        createdAt:  serverTimestamp(),
        readAt:     null,
      });
    } catch (err) {
      console.warn('[TabLayout] Failed to write verification notification:', err);
    }
  }, []);

  // Detect the false → true flip; only fires once per verification event.
  useEffect(() => {
    if (emailVerified && !prevEmailVerifiedRef.current) {
      setSuccessBannerVisible(true);
      sendVerificationNotif();
      if (successDismissTimerRef.current) clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = setTimeout(() => setSuccessBannerVisible(false), 4000);
    }
    prevEmailVerifiedRef.current = emailVerified;
  }, [emailVerified, sendVerificationNotif]);

  const handleResend = useCallback(async () => {
    const cu = auth.currentUser;
    if (!cu || resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await requestEmailVerification(cu);
      setResendStatus('sent');
      if (resendTimerRef.current) clearTimeout(resendTimerRef.current);
      resendTimerRef.current = setTimeout(() => setResendStatus('idle'), 5000);
    } catch {
      setResendStatus('idle');
    }
  }, [resendStatus]);

  const showBanner = !!user && !emailVerified && !bannerDismissed;

  // ── Admin inbox badge ──────────────────────────────────────────────────────
  // Live badge count — only admins can read this query (firestore.rules).
  useEffect(() => {
    if (!isAdmin) {
      setUnreadInboxCount(0);
      return;
    }
    return subscribeToUnreadInboxCount(setUnreadInboxCount, () => setUnreadInboxCount(0));
  }, [isAdmin]);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }],
          tabBarActiveTintColor: COLORS.amber,
          tabBarInactiveTintColor: COLORS.fg3,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          tabBarBackground: () => <View style={styles.tabBarBg} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => <TabIcon name="home" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ focused }) => <TabIcon name="grid" color={COLORS.amber} focused={focused} />,
          }}
        />
        {/* Renters never see this tab — href: null unlinks it from the bar
            entirely while isAdmin is false. The inbox screen itself also
            guards against direct navigation. */}
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            href: isAdmin ? undefined : null,
            tabBarBadge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
            tabBarBadgeStyle: styles.tabBarBadge,
            tabBarIcon: ({ focused }) => <TabIcon name="message-circle" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'Reservations',
            tabBarIcon: ({ focused }) => <TabIcon name="file-text" color={COLORS.amber} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: 'My Account',
            tabBarIcon: ({ focused }) => <TabIcon name="user" color={COLORS.amber} focused={focused} />,
          }}
        />
      </Tabs>

      {/* Email verified — success banner, auto-dismisses after 4s */}
      {successBannerVisible && (
        <View style={[styles.successBanner, { paddingTop: insets.top }]}>
          <View style={styles.successRow}>
            <Feather name="check-circle" size={15} color="#065F46" />
            <Text style={styles.successMsg}>Email verified! Your account is fully set up.</Text>
            <TouchableOpacity
              style={styles.successDismissBtn}
              onPress={() => setSuccessBannerVisible(false)}
              activeOpacity={0.7}
            >
              <Feather name="x" size={15} color="#065F46" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Email verification reminder — non-blocking, session-dismissible */}
      {showBanner && (
        <View style={[styles.verifyBanner, { paddingTop: insets.top }]}>
          <View style={styles.verifyRow}>
            {/* Tapping the message area triggers a manual reload check */}
            <TouchableOpacity
              style={styles.verifyMsgArea}
              onPress={checkVerification}
              activeOpacity={0.7}
            >
              <Feather name="mail" size={13} color="#7A5F00" />
              <Text style={styles.verifyMsg}>
                Please verify your email to secure your account.{'\n'}
                <Text style={styles.verifySpamHint}>It may land in your spam folder.</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.verifyResendBtn}
              onPress={handleResend}
              disabled={resendStatus !== 'idle'}
              activeOpacity={0.7}
            >
              <Text style={styles.verifyResendText}>
                {resendStatus === 'sent' ? 'Sent ✓' : resendStatus === 'sending' ? '…' : 'Resend'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.verifyDismissBtn}
              onPress={() => setBannerDismissed(true)}
              activeOpacity={0.7}
            >
              <Feather name="x" size={15} color="#7A5F00" />
            </TouchableOpacity>
          </View>
          {resendStatus === 'sent' && (
            <Text style={styles.verifyConfirm}>
              Verification email sent. Check your inbox — and your spam folder, just in case.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarBg: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  tabItem: {
    paddingTop: 0,
  },
  tabIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    // The active icon stays transparent — color change handled by Feather icon color
  },
  tabBarBadge: {
    backgroundColor: COLORS.amber,
    color: COLORS.carbon,
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Email verified success banner ─────────────────────────────────────────
  successBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 101,
    backgroundColor: '#D1FAE5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
  },
  successMsg: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#065F46',
    lineHeight: 18,
  },
  successDismissBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Email verification banner ─────────────────────────────────────────────
  verifyBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: '#FEF9E5',
    borderBottomWidth: 1,
    borderBottomColor: '#F0D56A',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  verifyMsgArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  verifyMsg: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: '#5C4400',
    lineHeight: 17,
  },
  verifyResendBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    flexShrink: 0,
  },
  verifyResendText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  verifyDismissBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verifySpamHint: {
    fontSize: 11,
    fontWeight: '400',
    color: '#A07C00',
    lineHeight: 15,
  },
  verifyConfirm: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#0F6E56',
    paddingTop: 4,
    paddingLeft: 21,
  },
});
