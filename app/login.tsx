import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  type TextInput,
} from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { AUTH_COPY } from '@/constants/authCopy';
import { DEFAULT_COUNTRY, toE164, type CountryCode } from '@/constants/countryCodes';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { AuthHeaderDecor } from '@/components/auth/AuthHeaderDecor';
import { AuthInput, PasswordField, OrDivider, SocialButtons, TermsLine, PhoneField, hasSocialButtons } from '@/components/auth/AuthFields';
import { ForgotPasswordSheet } from '@/components/auth/ForgotPasswordSheet';
import LegacyAuthForm from '@/components/auth/LegacyAuthForm';
import { useFeatureFlags } from '@/lib/features';
import { useLoyaltyConfig, referralWelcomePercent } from '@/lib/loyalty';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/auth';
import { authFlow } from '@/lib/authFlow';
import { continueWithGoogle, GoogleCancelled } from '@/lib/googleSignIn';
import { continueWithApple, AppleCancelled } from '@/lib/appleSignIn';
import {
  authErrorMessage, signInWithEmail, createEmailAccount, hasCompleteProfile, saveIndividualProfile,
  EMAIL_RE, PHONE_E164, MIN_PASSWORD,
} from '@/lib/authActions';

// Sign in + 2-step sign-up (validated mockups). Guests are an anonymous session: step 1
// LINKS it to the new email account, step 2 saves name + phone (+ invite code). Apple / Google
// (dev / EAS build only) skips step 1. While a sign-up is in progress `authFlow.busy`
// keeps the root layout from leaving this screen; it leaves by itself (back to where the
// guest came from — the guest sheet's action then resumes — or Home).
// Params: ?mode=signup, ?step=2 (finish an unfinished sign-up), ?invite=1 (code open).

const si = AUTH_COPY.signIn;
const su = AUTH_COPY.signUp;

type View_ = 'signin' | 'signup1' | 'signup2' | 'business';

export default function LoginScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const params = useLocalSearchParams<{ mode?: string; step?: string; invite?: string }>();
  const startedOnSignUp = params.mode === 'signup';
  const [view, setView] = useState<View_>(
    params.step === '2' && auth.currentUser && !auth.currentUser.isAnonymous ? 'signup2'
      : startedOnSignUp ? 'signup1' : 'signin',
  );
  const { businessAccounts } = useFeatureFlags();
  const pct = referralWelcomePercent(useLoyaltyConfig());

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(params.invite === '1');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // Leave: back to where the guest came from, else Home.
  const leave = () => {
    authFlow.busy = false;
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const go = (v: View_) => { setError(null); setView(v); };
  const abandon = () => {
    authFlow.busy = false;
    signOut(auth).catch(() => {});
    if (router.canGoBack()) router.back(); else router.replace('/');
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const signIn = async () => {
    if (busy || !EMAIL_RE.test(email.trim()) || !password) return;
    setBusy(true); setError(null);
    try {
      await signInWithEmail(email, password);
      // An account whose sign-up was never finished → step 2 here.
      const uid = auth.currentUser?.uid;
      if (uid && !(await hasCompleteProfile(uid))) { authFlow.busy = true; go('signup2'); }
      // else: the root layout leaves this screen once the profile is loaded.
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Google and Apple: same flow — a new account goes to step 2 with the names prefilled.
  const social = async (run: () => Promise<{ user: { uid: string }; names: { firstName: string; lastName: string } }>) => {
    if (socialBusy) return;
    setSocialBusy(true); setError(null);
    authFlow.busy = true;
    try {
      const { user, names } = await run();
      if (await hasCompleteProfile(user.uid)) { leave(); return; }
      setFirstName(f => f || names.firstName);
      setLastName(l => l || names.lastName);
      go('signup2');
    } catch (err) {
      authFlow.busy = false;
      if (!(err instanceof GoogleCancelled) && !(err instanceof AppleCancelled)) setError(authErrorMessage(err));
    } finally {
      setSocialBusy(false);
    }
  };
  const google = () => social(continueWithGoogle);
  const apple = () => social(continueWithApple);

  const passwordsOk = password.length >= MIN_PASSWORD && password === confirm;
  const step1Ok = EMAIL_RE.test(email.trim()) && passwordsOk;
  const step1 = async () => {
    if (busy || !step1Ok) return;
    setBusy(true); setError(null);
    authFlow.busy = true;
    try {
      await createEmailAccount(email, password);
      go('signup2');
    } catch (err) {
      authFlow.busy = false;
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const e164 = toE164(country, phone);
  const phoneOk = PHONE_E164.test(e164) && phone.replace(/\D/g, '').length >= 6;
  const step2Ok = firstName.trim().length > 0 && lastName.trim().length > 0 && phoneOk;
  const step2 = async () => {
    if (busy || !step2Ok) return;
    setBusy(true); setError(null);
    try {
      await saveIndividualProfile({ firstName, lastName, phone: e164, inviteCode: inviteOpen ? invite : '' });
      leave();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ── Views ──────────────────────────────────────────────────────────────────
  if (view === 'business') {
    return (
      <View style={[s.root, screen.root]}>
        <View style={s.topRow}>
          <TouchableOpacity onPress={() => go('signin')} hitSlop={10}><Feather name="arrow-left" size={22} color={SHADES.carbon} /></TouchableOpacity>
        </View>
        <LegacyAuthForm initialPath="btob" initialMode="signup" />
      </View>
    );
  }

  const errorLine = !!error && <Text style={[UI.errorText, s.center]}>{error}</Text>;
  const primary = (label: string, onPress: () => void, enabled: boolean) => (
    <PressScale style={[UI.btnPrimary, !enabled && UI.btnDisabled]} onPress={onPress} disabled={!enabled || busy}>
      {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{label}</Text>}
    </PressScale>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* iOS swipe-back would skip step 2's own back arrow (which signs out) — off there. */}
      <Stack.Screen options={{ gestureEnabled: view !== 'signup2' }} />
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: screen.top + 12, paddingBottom: screen.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {view === 'signin' ? (
          <>
            <View style={s.topRowEnd}>
              <TouchableOpacity onPress={leave} hitSlop={10} style={s.browse}>
                <Text style={s.browseText}>{si.browseFirst}</Text>
                <Feather name="arrow-right" size={16} color={SHADES.amberDeep} />
              </TouchableOpacity>
            </View>
            <AuthHeaderDecor />
            <View style={s.form}>
              <SocialButtons onGoogle={google} onApple={apple} busy={socialBusy} />
              {hasSocialButtons() && <OrDivider label={si.orEmail} />}
              <AuthInput value={email} onChangeText={setEmail} placeholder={si.email} keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} autoComplete="email" returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()} />
              <PasswordField ref={passwordRef} value={password} onChangeText={setPassword} placeholder={si.password}
                autoComplete="password" returnKeyType="go" onSubmitEditing={signIn} />
              <TouchableOpacity onPress={() => setForgotOpen(true)} style={s.forgot} hitSlop={8}>
                <Text style={s.forgotText}>{si.forgot}</Text>
              </TouchableOpacity>
              {errorLine}
              {primary(si.submit, signIn, EMAIL_RE.test(email.trim()) && password.length > 0)}
              <Text style={[s.switch, s.center]} onPress={() => go('signup1')}>
                {si.newHere}<Text style={s.switchStrong}>{si.create}</Text>
              </Text>
              {businessAccounts && (
                <Text style={[s.switch, s.center]} onPress={() => go('business')}>
                  {si.business}<Text style={s.switchStrong}>{si.businessLink}</Text>
                </Text>
              )}
              <TermsLine />
            </View>
          </>
        ) : (
          <>
            {/* Back + "1 of 2" / "2 of 2" + progress */}
            <View style={s.stepHead}>
              <TouchableOpacity
                hitSlop={10}
                // Step 2 can't be skipped (the root layout sends an unfinished account back
                // here): its back arrow abandons the sign-up for now — signed out, a guest
                // again; signing in later resumes at step 2.
                onPress={() => (view === 'signup1' ? (startedOnSignUp ? leave() : go('signin')) : abandon())}
                accessibilityLabel="Back"
              >
                <Feather name="arrow-left" size={22} color={SHADES.carbon} />
              </TouchableOpacity>
              <Text style={s.stepOf}>{su.stepOf(view === 'signup1' ? 1 : 2)}</Text>
            </View>
            <View style={s.progress}>
              <View style={[s.seg, s.segOn]} />
              <View style={[s.seg, view === 'signup2' && s.segOn]} />
            </View>

            {view === 'signup1' ? (
              <View style={s.form}>
                <Text style={s.title}>{su.step1Title}</Text>
                <Text style={s.sub}>{su.step1Sub}</Text>
                <SocialButtons onGoogle={google} onApple={apple} busy={socialBusy} />
                {hasSocialButtons() && <OrDivider label={si.orEmail} />}
                <AuthInput value={email} onChangeText={setEmail} placeholder={si.email} keyboardType="email-address"
                  autoCapitalize="none" autoCorrect={false} autoComplete="email" returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()} />
                <PasswordField ref={passwordRef} value={password} onChangeText={setPassword} placeholder={si.password}
                  autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
                <PasswordField ref={confirmRef} value={confirm} onChangeText={setConfirm} placeholder={su.confirm}
                  autoComplete="new-password" returnKeyType="go" onSubmitEditing={step1} />
                {password.length > 0 && password.length < MIN_PASSWORD ? (
                  <Text style={s.hint}>{su.minChars}</Text>
                ) : confirm.length > 0 ? (
                  <View style={s.matchRow}>
                    <Feather name={passwordsOk ? 'check' : 'x'} size={15} color={passwordsOk ? SHADES.amberText : SHADES.carbonFaint} />
                    <Text style={[s.hint, passwordsOk && s.matchOk]}>{passwordsOk ? su.match : su.noMatch}</Text>
                  </View>
                ) : (
                  <Text style={s.hint}>{su.minChars}</Text>
                )}
                {errorLine}
                {primary(su.continue, step1, step1Ok)}
                <Text style={[s.switch, s.center]} onPress={() => go('signin')}>
                  {su.already}<Text style={s.switchStrong}>{su.signIn}</Text>
                </Text>
              </View>
            ) : (
              <View style={s.form}>
                <Text style={s.title}>{su.step2Title}</Text>
                <Text style={s.sub}>{su.step2Sub}</Text>
                <View style={s.nameRow}>
                  <AuthInput style={{ flex: 1 }} value={firstName} onChangeText={setFirstName} placeholder={su.firstName}
                    autoComplete="given-name" textContentType="givenName" />
                  <AuthInput style={{ flex: 1 }} value={lastName} onChangeText={setLastName} placeholder={su.lastName}
                    autoComplete="family-name" textContentType="familyName" />
                </View>
                <View>
                  <PhoneField
                    country={country}
                    onCountry={setCountry}
                    value={phone}
                    onChangeText={v => { setPhone(v); setPhoneTouched(true); }}
                    invalid={phoneTouched && phone.length > 3 && !phoneOk}
                  />
                  <Text style={[s.hint, { marginTop: 8 }]}>
                    {phoneTouched && phone.length > 3 && !phoneOk ? su.phoneInvalid : su.phoneHint}
                  </Text>
                </View>
                {pct > 0 && (
                  <View style={s.invite}>
                    <TouchableOpacity style={s.inviteHead} onPress={() => setInviteOpen(o => !o)} activeOpacity={0.7}>
                      <Feather name="gift" size={16} color={SHADES.amberDeep} />
                      <Text style={s.inviteText}>{su.invite(pct)}</Text>
                      <Feather name={inviteOpen ? 'chevron-up' : 'chevron-down'} size={18} color={SHADES.amberDeep} />
                    </TouchableOpacity>
                    {inviteOpen && (
                      <AuthInput
                        style={{ marginTop: 10 }}
                        value={invite}
                        onChangeText={t => setInvite(t.toUpperCase())}
                        placeholder={su.invitePlaceholder}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        accessibilityLabel={su.inviteLabel}
                      />
                    )}
                  </View>
                )}
                {errorLine}
                {primary(su.create, step2, step2Ok)}
                <TermsLine />
              </View>
            )}
          </>
        )}
      </ScrollView>
      <ForgotPasswordSheet visible={forgotOpen} initialEmail={email} onClose={() => setForgotOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  content: { paddingHorizontal: 20 },
  topRow: { paddingHorizontal: 20, paddingVertical: 10 },
  topRowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
  browse: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  browseText: { ...TYPE.body, fontWeight: '700', color: SHADES.amberDeep },
  form: { gap: 12, marginTop: 8 },
  forgot: { alignSelf: 'flex-end' },
  forgotText: { ...TYPE.body, fontWeight: '700', color: SHADES.amberDeep },
  center: { textAlign: 'center' },
  switch: { ...TYPE.body, color: SHADES.carbonMuted, marginTop: 4 },
  switchStrong: { fontWeight: '700', color: SHADES.carbon },
  stepHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  stepOf: { ...TYPE.secondary, color: SHADES.carbonMuted },
  progress: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 14 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: SHADES.border },
  segOn: { backgroundColor: SHADES.amber },
  title: { ...TYPE.screenTitle, fontWeight: '800', color: SHADES.carbon },
  sub: { ...TYPE.body, color: SHADES.carbonMuted, marginTop: -6, marginBottom: 6 },
  hint: { ...TYPE.secondary, color: SHADES.carbonMuted },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchOk: { color: SHADES.amberText, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: 10 },
  invite: { backgroundColor: SHADES.amberPale, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteText: { ...TYPE.body, fontWeight: '600', flex: 1, color: SHADES.amberDeep },
});
