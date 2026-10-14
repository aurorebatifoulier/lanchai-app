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
import {
  collection,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  setDoc,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { db } from '@/lib/firebase';
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

    // Captured before any deletes so we can attempt a best-effort restore if the Auth
    // deletion step fails after the Firestore records are already gone.
    let userDocSnapshot: DocumentSnapshot<DocumentData> | null = null;
    let favoriteDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    let firestoreDeleted = false;

    try {
      // Re-authenticate (Firebase requires recent login before account deletion)
      const credential = EmailAuthProvider.credential(cu.email, password);
      await reauthenticateWithCredential(cu, credential);

      const userDocRef = doc(db, 'users', cu.uid);
      userDocSnapshot = await getDoc(userDocRef);
      const favsSnap = await getDocs(collection(db, 'users', cu.uid, 'favorites'));
      favoriteDocs = favsSnap.docs;

      // Delete favorites subcollection docs
      await Promise.all(favoriteDocs.map(d => deleteDoc(d.ref)));

      // Delete the users/{uid} profile document
      await deleteDoc(userDocRef);
      firestoreDeleted = true;

      // Delete the Firebase Auth account — onAuthStateChanged fires → _layout redirects to /login
      await cu.delete();
    } catch (err: any) {
      if (firestoreDeleted) {
        // The Firestore records are gone but the Auth account survived — restore them
        // rather than leave an orphaned Auth-only account with no profile.
        try {
          if (userDocSnapshot?.exists()) {
            await setDoc(doc(db, 'users', cu.uid), userDocSnapshot.data());
          }
          await Promise.all(
            favoriteDocs.map(d => setDoc(doc(db, 'users', cu.uid, 'favorites', d.id), d.data())),
          );
          setError('Could not delete your account. Your data has been restored — please try again.');
        } catch (restoreErr) {
          console.error('DELETE ACCOUNT RESTORE FAILED', restoreErr);
          setError(
            'Something went wrong and we could not confirm your account data was restored. ' +
            'Please contact support immediately and do not attempt this again until you hear back from us.',
          );
        }
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
          <ActivityIndicator color={COLORS.amber} />
          <Text style={s.centerText}>Checking your rentals…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {checkError ? (
          /* ── BLOCKED: couldn't verify rental status ───────────────────── */
          <>
            <View style={s.blockBox}>
              <Feather name="alert-triangle" size={22} color={COLORS.danger} style={s.boxIcon} />
              <Text style={s.blockTitle}>Couldn&apos;t verify your rentals</Text>
              <Text style={s.blockMsg}>
                Unable to verify your active rentals. Please try again or contact us.
              </Text>
            </View>

            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => router.push('/chat')}
              activeOpacity={0.85}
            >
              <Feather name="message-circle" size={16} color={COLORS.carbon} />
              <Text style={s.chatBtnText}>Contact us</Text>
            </TouchableOpacity>
          </>
        ) : activeRentals.length > 0 ? (
          /* ── BLOCKED: active / upcoming rental ────────────────────────── */
          <>
            <View style={s.blockBox}>
              <Feather name="alert-triangle" size={22} color={COLORS.danger} style={s.boxIcon} />
              <Text style={s.blockTitle}>Active rental in progress</Text>
              <Text style={s.blockMsg}>
                You still have an active or upcoming rental. Please return your items and settle any
                deposit, or contact us, before deleting your account.
              </Text>
            </View>

            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => router.push('/chat')}
              activeOpacity={0.85}
            >
              <Feather name="message-circle" size={16} color={COLORS.carbon} />
              <Text style={s.chatBtnText}>Contact us</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ── CONFIRMATION: warning + password ─────────────────────────── */
          <>
            <View style={s.warnBox}>
              <Feather name="alert-triangle" size={20} color="#7A5F00" style={s.boxIcon} />
              <Text style={s.warnTitle}>This can&apos;t be undone</Text>
              <Text style={s.warnMsg}>
                Deleting your account permanently removes your personal information and login. Your
                rental history is retained as a business record and will not be deleted.
              </Text>
            </View>

            <Text style={s.fieldLabel}>Confirm with your password</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                placeholder="Your current password"
                placeholderTextColor={COLORS.fg3}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleDelete}
              />
              <TouchableOpacity
                style={s.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                activeOpacity={0.7}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={COLORS.fg3} />
              </TouchableOpacity>
            </View>

            {error && (
              <View style={s.errorBanner}>
                <Feather name="alert-circle" size={15} color="#B91C1C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.deleteBtn, !canSubmit && s.deleteBtnOff]}
              onPress={handleDelete}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {deleting ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={s.deleteBtnText}>Deleting…</Text>
                </>
              ) : (
                <Text style={s.deleteBtnText}>Delete my account</Text>
              )}
            </TouchableOpacity>
          </>
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

  // Shared
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  boxIcon: {
    marginBottom: 10,
  },

  // Blocked state
  blockBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.danger,
    marginBottom: 8,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  blockMsg: {
    fontSize: 13.5,
    fontWeight: '400',
    color: '#991B1B',
    lineHeight: 20,
    textAlign: 'center',
  },
  chatBtn: {
    height: 50,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chatBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // Warning box
  warnBox: {
    backgroundColor: '#FEF9E5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0D56A',
    padding: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  warnTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#7A5F00',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  warnMsg: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5C4400',
    lineHeight: 19,
    textAlign: 'center',
  },

  // Password field
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.fg3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    height: 50,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  eyeBtn: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 13,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#B91C1C',
    flex: 1,
  },

  // Delete button
  deleteBtn: {
    height: 52,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  deleteBtnOff: {
    opacity: 0.45,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
