import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, StatusBlock } from '@/components/account/ui';
import { auth } from '@/lib/auth';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getMyReservations, RentalDoc } from '@/lib/firestore';

// Reservation statuses that make account deletion unsafe — explicit check, independent
// of any date field, so it blocks regardless of a reservation's return date.
const BLOCKING_STATUSES = ['active', 'confirmed', 'pending_payment'];

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Delete account</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();

  const [checking,      setChecking]      = useState(true);
  const [activeRentals, setActiveRentals] = useState<RentalDoc[]>([]);
  const [checkError,    setCheckError]    = useState(false);
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Check for reservations that would make deletion unsafe.
  useEffect(() => {
    if (!user) return;
    getMyReservations(user.uid)
      .then(rentals => {
        setActiveRentals(rentals.filter(r => BLOCKING_STATUSES.includes(r.status)));
      })
      // Fail closed: if we can't verify the user has no blocking reservations, don't
      // let deletion proceed — better a blocked user who has to retry than an account
      // deleted while we genuinely didn't know its rental state.
      .catch(() => setCheckError(true))
      .finally(() => setChecking(false));
  }, [user]);

  const handleDelete = useCallback(async () => {
    const cu = auth.currentUser;
    if (!cu?.email || !password.trim() || deleting) return;
    setDeleting(true);
    setError(null);

    try {
      // Re-authenticate (confirms the password; the server also requires a recent login)
      const credential = EmailAuthProvider.credential(cu.email, password);
      await reauthenticateWithCredential(cu, credential);
      await cu.getIdToken(true);

      // Server-side deletion (deleteMyAccount callable): refuses while a rental is
      // pending/confirmed/active, deletes the profile + favorites/bag/loyalty history,
      // then the Auth account. Nothing to restore client-side if it fails.
      await httpsCallable(functions, 'deleteMyAccount')();
      await auth.signOut().catch(() => {}); // → _layout redirects to /login
    } catch (err: any) {
      if (err?.details?.code === 'has-active-rentals') {
        setError('You still have an active or upcoming rental — return it or cancel it before deleting your account.');
        setDeleting(false);
        return;
      }
      if (err?.details?.code === 'requires-recent-login') {
        setError('Please enter your password again and retry.');
        setDeleting(false);
        return;
      }
      console.error('DELETE ACCOUNT ERROR', err?.code, err?.message);
      const code = err?.code ?? '';
      let msg = 'Could not delete your account. Please try again.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        msg = 'Incorrect password.';
      } else if (code === 'auth/requires-recent-login') {
        msg = 'Session expired. Please log out, sign in again, then retry.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.';
      }
      setError(msg);
      setDeleting(false);
    }
  }, [password, deleting]);

  const canSubmit = password.trim().length > 0 && !deleting;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <View style={s.centerBox}>
          <ActivityIndicator color={SHADES.amber} />
          <Text style={UI.body}>Checking your rentals…</Text>
        </View>
      </View>
    );
  }

  const contactButton = (
    <TouchableOpacity style={[UI.btnPrimary, { marginTop: 16 }]} onPress={() => router.push('/chat')} activeOpacity={0.85}>
      <Feather name="message-circle" size={16} color={SHADES.carbon} />
      <Text style={UI.btnPrimaryText}>Contact us</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {checkError ? (
          /* ── BLOCKED: couldn't verify rental status ───────────────────── */
          <View style={[UI.card, UI.cardPadded]}>
            <StatusBlock icon={{ name: 'alert-triangle' }} tone="amber" title="Couldn't verify your rentals">
              <Text style={UI.body}>Unable to verify your active rentals. Please try again or contact us.</Text>
            </StatusBlock>
            {contactButton}
          </View>
        ) : activeRentals.length > 0 ? (
          /* ── BLOCKED: active / upcoming rental ────────────────────────── */
          <View style={[UI.card, UI.cardPadded]}>
            <StatusBlock icon={{ name: 'alert-triangle' }} tone="amber" title="Active rental in progress">
              <Text style={UI.body}>
                You still have an active or upcoming rental. Please return your items and settle any
                deposit, or contact us, before deleting your account.
              </Text>
            </StatusBlock>
            {contactButton}
          </View>
        ) : (
          /* ── CONFIRMATION: warning + password ─────────────────────────── */
          <View style={[UI.card, UI.cardPadded]}>
            <StatusBlock icon={{ name: 'alert-triangle' }} title="This can't be undone">
              <Text style={UI.body}>
                Deleting your account permanently removes your personal information and login. Your
                rental history is retained as a business record and will not be deleted.
              </Text>
            </StatusBlock>

            <View style={UI.divider} />
            <Text style={UI.fieldLabel}>Confirm with your password</Text>
            <View style={[UI.input, s.passwordRow]}>
              <TextInput
                style={s.passwordInput}
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                placeholder="Your current password"
                placeholderTextColor={SHADES.carbonFaint}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleDelete}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} activeOpacity={0.7} hitSlop={10}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={SHADES.carbonMuted} />
              </TouchableOpacity>
            </View>

            {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}

            {/* Destructive = text in the danger colour, never a red fill. */}
            <TouchableOpacity
              style={[UI.btnDestructive, { marginTop: 16 }, !canSubmit && UI.btnDisabled]}
              onPress={handleDelete}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {deleting ? (
                <>
                  <ActivityIndicator size="small" color={COLORS.danger} />
                  <Text style={UI.dangerText}>Deleting…</Text>
                </>
              ) : (
                <Text style={UI.dangerText}>Delete my account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  passwordInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '500', color: SHADES.carbon, paddingVertical: 0 },
});
