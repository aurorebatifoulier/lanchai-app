import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/AppText';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { UI } from '@/components/account/ui';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { requestEmailVerification, requestWelcomeEmail } from '@/lib/authEmails';

// "Please verify your email" reminder + "Email verified!" confirmation. The state lives in
// ONE provider (tabs layout); each tab renders <AccountBanners /> INLINE, right under its
// own header — never as an overlay on top of the app header (that hid the Home icons).

// A guest (anonymous session) has no email to verify — treated as verified, so no banner,
// no polling, no welcome email.
const isVerifiedOrGuest = () => {
  const cu = auth.currentUser;
  return !cu || cu.isAnonymous || cu.emailVerified;
};

interface BannersState {
  showVerify: boolean;
  success: boolean;
  resendStatus: 'idle' | 'sending' | 'sent';
  checkVerification: () => void;
  resend: () => void;
  dismissVerify: () => void;
  dismissSuccess: () => void;
}

const Ctx = createContext<BannersState | null>(null);

export function AccountBannersProvider({ children }: { children: React.ReactNode }) {
  const { user, hasAccount } = useAuth();

  // ── Email verification banner ──────────────────────────────────────────────
  const [emailVerified, setEmailVerified] = useState<boolean>(
    isVerifiedOrGuest(),
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Success banner — shown once when emailVerified flips false → true
  const [successBannerVisible, setSuccessBannerVisible] = useState(false);
  const prevEmailVerifiedRef  = useRef<boolean>(isVerifiedOrGuest());
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
    setEmailVerified(isVerifiedOrGuest());
    setBannerDismissed(false);
    if (resendTimerRef.current) clearTimeout(resendTimerRef.current);
    setResendStatus('idle');
  }, [user?.uid, hasAccount]);

  // Re-read emailVerified from Firebase (after user clicks the link in their inbox)
  const checkVerification = useCallback(async () => {
    const cu = auth.currentUser;
    if (!cu || cu.isAnonymous || cu.emailVerified) return;
    try {
      await cu.reload();
      setEmailVerified(isVerifiedOrGuest());
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
      console.warn('[AccountBanners] Failed to write verification notification:', err);
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

  // Welcome email once the address is verified — also covers a verification done while
  // the app was closed (no flip seen). Idempotent server-side (users.welcomeEmailSentAt).
  useEffect(() => {
    const cu = auth.currentUser;
    if (emailVerified && cu && !cu.isAnonymous) requestWelcomeEmail(cu.uid);
  }, [emailVerified]);

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

  const value: BannersState = {
    showVerify: showBanner,
    success: successBannerVisible,
    resendStatus,
    checkVerification,
    resend: handleResend,
    dismissVerify: () => setBannerDismissed(true),
    dismissSuccess: () => setSuccessBannerVisible(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Inline banners — place right under a tab's header. Renders nothing when not needed.
 *  `flush`: the parent already pads 16px horizontally. */
export function AccountBanners({ flush = false }: { flush?: boolean }) {
  const b = useContext(Ctx);
  if (!b || (!b.success && !b.showVerify)) return null;
  return (
    <View style={[s.wrap, flush && { paddingHorizontal: 0 }]}>
      {b.success && (
        <View style={[UI.card, s.card]}>
          <View style={s.row}>
            <Feather name="check-circle" size={16} color={SHADES.amberDeep} />
            <Text style={s.msg}>Email verified! Your account is fully set up.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" style={s.dismiss} onPress={b.dismissSuccess} activeOpacity={0.7} hitSlop={8}>
              <Feather name="x" size={15} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {b.showVerify && (
        <View style={[UI.card, s.card]}>
          <View style={s.row}>
            {/* Tapping the message area triggers a manual reload check */}
            <TouchableOpacity style={s.msgArea} onPress={b.checkVerification} activeOpacity={0.7}>
              <Feather name="mail" size={15} color={SHADES.amberDeep} style={{ marginTop: 1 }} />
              <Text style={s.msg}>
                Please verify your email to secure your account.{'\n'}
                <Text style={s.hint}>It may land in your spam folder.</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.resend} onPress={b.resend} disabled={b.resendStatus !== 'idle'} activeOpacity={0.7}>
              <Text style={s.resendText}>
                {b.resendStatus === 'sent' ? 'Sent ✓' : b.resendStatus === 'sending' ? '…' : 'Resend'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" style={s.dismiss} onPress={b.dismissVerify} activeOpacity={0.7} hitSlop={8}>
              <Feather name="x" size={15} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
          {b.resendStatus === 'sent' && (
            <Text style={s.confirm}>Verification email sent. Check your inbox — and your spam folder, just in case.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 8, paddingTop: 8, paddingBottom: 4 },
  card: { paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  msg: { ...TYPE.secondary, flex: 1, color: SHADES.carbon },
  hint: { ...TYPE.small, fontWeight: '500', color: SHADES.carbonMuted },
  resend: { paddingHorizontal: 10, height: 30, justifyContent: 'center', backgroundColor: SHADES.amber, borderRadius: 10, flexShrink: 0 },
  resendText: { ...TYPE.small, color: SHADES.carbon },
  dismiss: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  confirm: { ...TYPE.small, fontWeight: '500', color: SHADES.amberDeep, paddingTop: 6, paddingLeft: 23 },
});
