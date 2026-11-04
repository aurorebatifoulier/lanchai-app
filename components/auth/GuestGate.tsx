import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { AUTH_COPY, type GateAction } from '@/constants/authCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { useAuth } from '@/contexts/AuthContext';
import { useLoyaltyConfig, referralWelcomePercent } from '@/lib/loyalty';

// Guest gate — guests browse everything; acting needs an account. requireAccount():
//   • real account → runs the action now;
//   • guest → the "Good taste. Now, who are you?" sheet; the action is kept and RESUMED
//     once the guest has an account (sign up links the guest session, sign in replaces
//     it) and is back from the sign-in screen.

export interface GateRequest {
  action: GateAction;
  /** Product name for "Sign in to rent the {item}." */
  itemName?: string;
  /** Resumed after sign-in / sign-up. */
  run?: () => void;
}

interface GateApi {
  /** Runs `req.run` now for an account, else opens the guest sheet. Returns true when it ran. */
  requireAccount: (req: GateRequest) => boolean;
}

const Ctx = createContext<GateApi>({ requireAccount: req => { req.run?.(); return true; } });

export function useRequireAccount() {
  return useContext(Ctx).requireAccount;
}

const c = AUTH_COPY.sheet;

export function GuestGateProvider({ children }: { children: React.ReactNode }) {
  const { hasAccount, profileComplete } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const screen = useScreenInsets();
  const config = useLoyaltyConfig();
  const [sheet, setSheet] = useState<GateRequest | null>(null);
  const pending = useRef<GateRequest | null>(null);

  const requireAccount = useCallback((req: GateRequest) => {
    if (hasAccount && profileComplete) { req.run?.(); return true; }
    pending.current = req;
    // An account whose sign-up isn't finished (step 2 left, new Google account): finish
    // it first, then the action resumes.
    if (hasAccount) router.push({ pathname: '/login', params: { mode: 'signup', step: '2' } } as never);
    else setSheet(req);
    return false;
  }, [hasAccount, profileComplete, router]);

  // Resume: once there's an account AND the sign-in / sign-up screen is closed. A guest
  // who leaves that screen WITHOUT signing in drops the action (no surprise later).
  const prevPath = useRef(pathname);
  useEffect(() => {
    const leftLogin = prevPath.current === '/login' && pathname !== '/login';
    prevPath.current = pathname;
    if (!hasAccount || !profileComplete) {
      if (leftLogin) pending.current = null;
      return;
    }
    if (!pending.current || pathname === '/login') return;
    const req = pending.current;
    pending.current = null;
    const t = setTimeout(() => req.run?.(), 250); // let the navigation settle
    return () => clearTimeout(t);
  }, [hasAccount, profileComplete, pathname]);

  const close = (keepPending = false) => {
    if (!keepPending) pending.current = null;
    setSheet(null);
  };
  const go = (mode: 'signin' | 'signup') => {
    close(true);
    router.push(mode === 'signup' ? ({ pathname: '/login', params: { mode: 'signup' } } as never) : '/login');
  };

  const api = useMemo(() => ({ requireAccount }), [requireAccount]);
  const pct = referralWelcomePercent(config);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => close()} statusBarTranslucent>
        <View style={s.root}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
          {sheet && (
            <View style={[s.sheet, { paddingBottom: screen.bottom + 20 }]}>
              <View style={s.handle} />
              <Text style={s.title}>{c.title}</Text>
              <Text style={s.lead}>{`${c.lead(sheet.action, sheet.itemName)} ${c.after(sheet.action)}`}</Text>
              {/* Continue with Google + Apple come here (flagged — not in Expo Go). */}
              <PressScale style={[UI.btnPrimary, s.btn]} onPress={() => go('signup')}>
                <Text style={UI.btnPrimaryText}>{c.signUpEmail}</Text>
              </PressScale>
              <Pressable onPress={() => go('signin')} hitSlop={8} style={s.signInRow}>
                <Text style={s.signInText}>{c.haveAccount}<Text style={s.signInStrong}>{c.signIn}</Text></Text>
              </Pressable>
              {pct > 0 && (
                <View style={s.invite}>
                  <Feather name="gift" size={16} color={SHADES.amberDeep} />
                  <Text style={s.inviteText}>{c.invite(pct)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 18 },
  title: { ...TYPE.sectionTitle, fontSize: 20, lineHeight: 26, color: SHADES.carbon },
  lead: { ...TYPE.body, color: SHADES.carbonMuted, marginTop: 6 },
  btn: { marginTop: 20 },
  signInRow: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  signInText: { ...TYPE.body, color: SHADES.carbonMuted },
  signInStrong: { fontWeight: '700', color: SHADES.carbon },
  invite: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16,
    backgroundColor: SHADES.amberPale, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  inviteText: { ...TYPE.secondary, flex: 1, color: SHADES.amberDeep },
});
