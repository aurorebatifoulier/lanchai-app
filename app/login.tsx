import React, { useState, useCallback, useRef } from 'react';
import { SHADES } from '@/constants/brandShades';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { COLORS } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import { useFeatureFlags } from '@/lib/features';
import { requestPasswordReset, requestEmailVerification, AuthEmailRateLimitError } from '@/lib/authEmails';
import { ID_DOC_TYPES, pickIdPhoto, submitMyIdentityDocument, type IdDocType } from '@/lib/identity';
import { applyInviteCode } from '@/lib/referral';
import { db, storage } from '@/lib/firebase';
import { getUserProfile } from '@/lib/firestore';
import PressScale from '@/components/PressScale';

function firebaseAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const EMAIL_RE    = /\S+@\S+\.\S+/;
const PHONE_E164  = /^\+[1-9]\d{6,14}$/;

type Path = 'btoc' | 'btob';

export default function LoginScreen() {
  const { signIn, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [path, setPath]           = useState<Path>('btoc');
  const [mode, setMode]           = useState<'signin' | 'signup'>('signin');
  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [phone, setPhone]             = useState('+856');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword]               = useState('');
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // BtoB-only signup fields
  const [companyName, setCompanyName]         = useState('');
  const [licenseNumber, setLicenseNumber]     = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [docUri, setDocUri]                   = useState<string | null>(null);
  // Business signup: ID of the responsible person (optional here, required before approval).
  const [idType, setIdType]                   = useState<IdDocType | null>(null);
  const [idPhotos, setIdPhotos]               = useState<string[]>([]);
  // Individual signup: optional friend's invite code (applied right after the account exists).
  const [inviteCode, setInviteCode]           = useState('');

  // Forgot-password inline feedback
  const [resetStatus, setResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetMsg, setResetMsg]       = useState('');

  const isSignUp = mode === 'signup';
  // Business signup is closed at launch (config/features.businessAccounts, default OFF):
  // the Individual/Business selector is hidden and every login goes through one path.
  const { businessAccounts } = useFeatureFlags();
  const isBtob = businessAccounts && path === 'btob';

  const passwordsMatch = password === confirmPassword;

  const canSubmit =
    !busy &&
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignUp || (
      confirmPassword.length > 0 &&
      passwordsMatch &&
      PHONE_E164.test(phone.trim()) &&
      (isBtob
        ? (companyName.trim().length > 0 && licenseNumber.trim().length > 0 && responsibleName.trim().length > 0)
        : (firstName.trim().length > 0 && lastName.trim().length > 0))
    ));

  const resetSignupFields = () => {
    setFirstName('');
    setLastName('');
    setPhone('+856');
    setPhoneTouched(false);
    setCompanyName('');
    setLicenseNumber('');
    setResponsibleName('');
    setDocUri(null);
    setIdType(null);
    setIdPhotos([]);
  };

  const switchPath = (p: Path) => {
    if (p === path) return;
    setError(null);
    resetSignupFields();
    setPath(p);
  };

  const switchMode = () => {
    setError(null);
    setResetStatus('idle');
    setResetMsg('');
    resetSignupFields();
    setConfirmPasswordTouched(false);
    setMode(m => (m === 'signin' ? 'signup' : 'signin'));
  };

  // Keeps the + prefix fixed and strips all non-digit characters after it.
  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/[^\d]/g, '');
    setPhone('+' + digits);
  };

  const handleEmailChange = (v: string) => {
    setEmail(v);
    if (resetStatus !== 'idle') {
      setResetStatus('idle');
      setResetMsg('');
    }
  };

  const handlePickDocument = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setDocUri(result.assets[0].uri);
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setResetStatus('error');
      setResetMsg('Enter your email above, then tap Forgot password.');
      return;
    }
    setResetStatus('sending');
    setResetMsg('');
    try {
      await requestPasswordReset(trimmed);
      setResetStatus('sent');
      setResetMsg(
        `If an account exists for ${trimmed}, a reset link has been sent. Check your inbox.`,
      );
    } catch (err: any) {
      setResetStatus('error');
      setResetMsg(
        err instanceof AuthEmailRateLimitError
          ? 'Too many attempts, please try again later.'
          : 'Could not send the reset email. Please try again.',
      );
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        // Cross-path block — a business account signing in via Individual (or vice
        // versa) is signed straight back out rather than let through to the app.
        const cu = auth.currentUser;
        if (cu) {
          const profile = await getUserProfile(cu.uid);
          const actualPath: Path = profile?.accountType === 'btob' ? 'btob' : 'btoc';
          // Selector hidden (business signup closed) → no cross-path block, so existing
          // business accounts can still sign in.
          if (businessAccounts && actualPath !== path) {
            await signOut();
            setError(
              actualPath === 'btob'
                ? 'This is a business account. Please use the Business login.'
                : 'This is an individual account. Please use the Individual login.',
            );
            return;
          }
        }
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);

        if (isBtob) {
          const displayName = companyName.trim();
          await updateProfile(user, { displayName });

          let btobDocumentUrl: string | undefined;
          if (docUri) {
            const compressed = await manipulateAsync(
              docUri,
              [{ resize: { width: 1600 } }],
              { compress: 0.7, format: SaveFormat.JPEG },
            );
            const blob: Blob = await (await fetch(compressed.uri)).blob();
            const sRef = storageRef(storage, `businessDocs/${user.uid}/${Date.now()}.jpg`);
            await uploadBytes(sRef, blob);
            btobDocumentUrl = await getDownloadURL(sRef);
          }
          await setDoc(
            doc(db, 'users', user.uid),
            {
              displayName,
              phoneNumber:   phone.trim(),
              phone:         phone.trim(),
              phoneVerified: false,
              accountType:   'btob',
              btobStatus:    'pending_approval',
              btobCompanyName:     companyName.trim(),
              btobLicenseNumber:   licenseNumber.trim(),
              btobResponsibleName: responsibleName.trim(),
              ...(btobDocumentUrl ? { btobDocumentUrl } : {}),
              btobSubmittedAt: serverTimestamp(),
              createdAt:     serverTimestamp(),
            },
            { merge: true },
          );
          // Responsible person's ID — registered after the account exists; a failure here
          // never blocks the signup (it can be added from ID & residency before approval).
          if (idType && idPhotos.length > 0) {
            await submitMyIdentityDocument(idType, idPhotos).catch(err =>
              console.warn('[Login] responsible ID upload failed:', err));
          }
        } else {
          const displayName = `${firstName.trim()} ${lastName.trim()}`;
          await updateProfile(user, { displayName });

          await setDoc(
            doc(db, 'users', user.uid),
            {
              firstName:     firstName.trim(),
              lastName:      lastName.trim(),
              displayName,
              phoneNumber:   phone.trim(),
              phone:         phone.trim(),
              phoneVerified: false,
              accountType:   'btoc',
              createdAt:     serverTimestamp(),
            },
            { merge: true },
          );
        }
        try { await requestEmailVerification(user); } catch {}
        // Never blocks the signup — if it fails, Account → "Have an invite code?" lets
        // them retry before their first booking.
        if (!isBtob && inviteCode.trim()) {
          await applyInviteCode(inviteCode).catch(err => console.warn('[Login] invite code not applied:', err));
        }
      }
    } catch (err) {
      setError(firebaseAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [
    canSubmit, mode, email, password, firstName, lastName, phone, path, isBtob, businessAccounts,
    companyName, licenseNumber, responsibleName, docUri, idType, idPhotos, inviteCode, signIn, signOut,
  ]);

  // Rendered at two different positions in the form depending on path (see below) —
  // defined once here so both spots share identical markup/behavior.
  const phoneField = (
    <View style={styles.field}>
      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={[
          styles.input,
          phoneTouched && !PHONE_E164.test(phone.trim()) && styles.inputError,
        ]}
        value={phone}
        onChangeText={handlePhoneChange}
        onBlur={() => setPhoneTouched(true)}
        placeholder="+856 20 XXXXXXXX"
        placeholderTextColor={COLORS.fg3}
        keyboardType="number-pad"
        autoCorrect={false}
        textContentType="telephoneNumber"
        returnKeyType="next"
      />
      <Text style={styles.inputHint}>
        International format — e.g. +856 20 XXXXXXXX for Laos, +33 6 for France.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require('@/assets/images/lanchai-mark.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* BtoC / BtoB selector — only while business accounts are open */}
          {businessAccounts && (
            <View style={styles.pathRow}>
              <TouchableOpacity
                style={[styles.pathBtn, path === 'btoc' && styles.pathBtnActive]}
                onPress={() => switchPath('btoc')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pathBtnText, path === 'btoc' && styles.pathBtnTextActive]}>
                  Individual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pathBtn, path === 'btob' && styles.pathBtnActive]}
                onPress={() => switchPath('btob')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pathBtnText, path === 'btob' && styles.pathBtnTextActive]}>
                  Business
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Title + subtitle — sign-up only. Sign-in shows neither, for either
              path — the Individual/Business toggle is sufficient context. */}
          {isSignUp && (
            <>
              <Text style={styles.title}>
                {isBtob ? 'Create your business account' : 'Create your account'}
              </Text>
              <Text style={styles.subtitle}>
                {isBtob
                  ? "Sign up your company to rent with LANCHAI. We'll review your application before activating the account."
                  : 'Sign up to start renting equipment.'}
              </Text>
            </>
          )}

          {/* First + last name — sign-up only, individual accounts only */}
          {isSignUp && !isBtob && (
            <View style={styles.nameRow}>
              <View style={[styles.field, styles.nameField]}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Ada"
                  placeholderTextColor={COLORS.fg3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="givenName"
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.field, styles.nameField]}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Lovelace"
                  placeholderTextColor={COLORS.fg3}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="familyName"
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* Phone — sign-up only (rendered inline below for individual accounts;
              re-used further down, after the company fields, for business accounts) */}
          {isSignUp && !isBtob && phoneField}
          {isSignUp && !isBtob && (
            <View style={styles.field}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.label}>Invite code</Text>
                <Text style={styles.labelOptional}>Optional</Text>
              </View>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={t => setInviteCode(t.toUpperCase())}
                placeholder="e.g. AURORE-7K2"
                placeholderTextColor={COLORS.fg3}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          )}

          {/* BtoB-only fields — sign-up only */}
          {isSignUp && isBtob && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Company name</Text>
                <TextInput
                  style={styles.input}
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Your company name"
                  placeholderTextColor={COLORS.fg3}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Responsible person</Text>
                <TextInput
                  style={styles.input}
                  value={responsibleName}
                  onChangeText={setResponsibleName}
                  placeholder="Full name of the person in charge"
                  placeholderTextColor={COLORS.fg3}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>License / registration number</Text>
                <TextInput
                  style={styles.input}
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                  placeholder="Business registration number"
                  placeholderTextColor={COLORS.fg3}
                  autoCapitalize="characters"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.label}>Business registration document</Text>
                  <Text style={styles.labelOptional}>Optional</Text>
                </View>
                <TouchableOpacity style={styles.docPicker} onPress={handlePickDocument} activeOpacity={0.8}>
                  {docUri ? (
                    <>
                      <Image source={{ uri: docUri }} style={styles.docThumb} />
                      <Text style={styles.docPickerText}>Document attached — tap to change</Text>
                    </>
                  ) : (
                    <>
                      <Feather name="upload" size={18} color={COLORS.fg3} />
                      <Text style={styles.docPickerText}>
                        Tap to attach a photo of your license, KBIS, or business
                        registration document
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.inputHint}>
                  You can also add this later from your account settings — but it&apos;s
                  required before you can book.
                </Text>
              </View>
              <View style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.label}>ID of the responsible person</Text>
                  <Text style={styles.labelOptional}>Optional</Text>
                </View>
                <View style={styles.idChips}>
                  {ID_DOC_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.idChip, idType === t.key && styles.idChipOn]}
                      onPress={() => setIdType(t.key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.idChipText, idType === t.key && styles.idChipTextOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.docPicker}
                  onPress={async () => { const u = await pickIdPhoto('camera'); if (u) setIdPhotos(p => [...p, u].slice(0, 6)); }}
                  onLongPress={async () => { const u = await pickIdPhoto('gallery'); if (u) setIdPhotos(p => [...p, u].slice(0, 6)); }}
                  activeOpacity={0.8}
                >
                  {idPhotos.length > 0 ? (
                    <>
                      <Image source={{ uri: idPhotos[0] }} style={styles.docThumb} />
                      <Text style={styles.docPickerText}>
                        {idPhotos.length} photo{idPhotos.length > 1 ? 's' : ''} — tap to add another (long-press: gallery)
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="camera" size={18} color={COLORS.fg3} />
                      <Text style={styles.docPickerText}>Tap to take a photo of the passport or ID card (long-press: gallery)</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.inputHint}>
                  Required before we approve your business account — you can also add it later in Account › ID & residency.
                </Text>
              </View>
              {phoneField}
            </>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={handleEmailChange}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.fg3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.fg3}
              secureTextEntry
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType={isSignUp ? 'next' : 'done'}
              onSubmitEditing={isSignUp ? () => confirmPasswordRef.current?.focus() : handleSubmit}
              blurOnSubmit={!isSignUp}
            />
          </View>

          {/* Confirm password — sign-up only, both paths */}
          {isSignUp && (
            <View style={styles.field}>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                ref={confirmPasswordRef}
                style={[
                  styles.input,
                  confirmPasswordTouched && confirmPassword.length > 0 && !passwordsMatch && styles.inputError,
                ]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onBlur={() => setConfirmPasswordTouched(true)}
                placeholder="••••••••"
                placeholderTextColor={COLORS.fg3}
                secureTextEntry
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              {confirmPasswordTouched && confirmPassword.length > 0 && !passwordsMatch && (
                <Text style={styles.fieldErrorText}>Passwords do not match</Text>
              )}
            </View>
          )}

          {/* Forgot password link — sign-in only */}
          {!isSignUp && (
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={handleForgotPassword}
              disabled={resetStatus === 'sending'}
              activeOpacity={0.7}
            >
              {resetStatus === 'sending' ? (
                <ActivityIndicator size="small" color={COLORS.fg3} />
              ) : (
                <Text style={styles.forgotLink}>Forgot password?</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Reset feedback banner — sign-in only */}
          {!isSignUp && resetStatus !== 'idle' && resetStatus !== 'sending' && (
            <View style={[
              styles.resetBanner,
              resetStatus === 'sent' ? styles.resetBannerSuccess : styles.resetBannerWarn,
            ]}>
              <Text style={[
                styles.resetBannerText,
                resetStatus === 'sent' ? styles.resetBannerTextSuccess : styles.resetBannerTextWarn,
              ]}>
                {resetMsg}
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <PressScale
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? (
              <ActivityIndicator size="small" color={COLORS.carbon} />
            ) : (
              <Text style={styles.submitText}>
                {isSignUp ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </PressScale>

          {/* Consent line */}
          <Text style={styles.consentText}>
            By continuing, you agree to our{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/legal/terms')}>
              Terms of service
            </Text>
            {' '}and{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/legal/privacy')}>
              Privacy policy
            </Text>
            .
          </Text>

          <TouchableOpacity style={styles.switchModeBtn} onPress={switchMode}>
            <Text style={styles.switchModeText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchModeTextBold}>
                {isSignUp ? 'Sign in' : 'Sign up'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  idChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  idChip: { borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, paddingHorizontal: 10, paddingVertical: 6 },
  idChipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  idChipText: { fontSize: 12, fontWeight: '600', color: COLORS.carbon },
  idChipTextOn: { color: COLORS.white },
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  logo: {
    width: 280,
    height: 200,
    alignSelf: 'center',
    marginBottom: 0,
  },

  // BtoC / BtoB selector
  pathRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.warmBeige,
    borderRadius: 12,
    padding: 4,
    marginTop: 28,
    marginBottom: 32,
  },
  pathBtn: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathBtnActive: {
    backgroundColor: COLORS.carbon,
  },
  pathBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  pathBtnTextActive: {
    color: COLORS.white,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.carbon,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 28,
    lineHeight: 19,
  },

  // Name row (sign-up only)
  nameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  nameField: {
    flex: 1,
    marginBottom: 0,
  },

  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: COLORS.fg3,
    marginBottom: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 8,
  },
  labelOptional: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
    letterSpacing: 0.4,
    opacity: 0.7,
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  inputHint: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.fg3,
    marginTop: 5,
    marginBottom: 4,
    lineHeight: 15,
  },
  fieldErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.danger,
    marginTop: 5,
  },

  // Business document picker
  docPicker: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderStyle: 'dashed',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  docThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.softGray200,
  },
  docPickerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 17,
  },

  // Forgot password
  forgotRow: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginTop: -8,
    marginBottom: 12,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.amber,
  },

  // Reset feedback
  resetBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resetBannerSuccess: {
    backgroundColor: SHADES.amberPale,
  },
  resetBannerWarn: {
    backgroundColor: SHADES.amberLight,
  },
  resetBannerText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  resetBannerTextSuccess: {
    color: SHADES.carbon,
  },
  resetBannerTextWarn: {
    color: SHADES.amberDeep,
  },

  error: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
    marginBottom: 12,
  },
  submitBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.softGray,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  consentText: {
    fontSize: 11.5,
    fontWeight: '400',
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 8,
  },
  consentLink: {
    color: COLORS.amber,
    fontWeight: '600',
  },
  switchModeBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  switchModeTextBold: {
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
