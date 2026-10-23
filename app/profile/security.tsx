import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { requestPasswordReset, AuthEmailRateLimitError } from '@/lib/authEmails';


// ── Helpers ───────────────────────────────────────────────────────────────────

function validateNewPw(pw: string): { ok: boolean; error: string | null } {
  if (pw.length === 0)          return { ok: false, error: null };
  if (pw.length < 8)            return { ok: false, error: 'At least 8 characters required.' };
  if (!/[a-zA-Z]/.test(pw))    return { ok: false, error: 'Add at least one letter.' };
  if (!/[0-9]/.test(pw))       return { ok: false, error: 'Add at least one number.' };
  return { ok: true, error: null };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConf,    setShowConf]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [saveStatus,   setSaveStatus]   = useState<'success' | 'error' | null>(null);
  const [feedbackMsg,  setFeedbackMsg]  = useState('');
  const [resetStatus,  setResetStatus]  = useState<'success' | 'error' | null>(null);
  const [resetMsg,     setResetMsg]     = useState('');

  const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current)  clearTimeout(hideTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  function scheduleHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSaveStatus(null), 3000);
  }

  function scheduleResetHide() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setResetStatus(null), 4000);
  }

  const pwValidation  = validateNewPw(newPw);
  const confirmError  = confirm.length > 0 && confirm !== newPw ? "Passwords don't match." : null;
  const canSubmit     = !saving && currentPw.length > 0 && pwValidation.ok && newPw === confirm;

  const handleUpdate = async () => {
    const cu = auth.currentUser;
    if (!cu?.email || !canSubmit) return;
    setSaving(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setSaveStatus(null);
    try {
      const credential = EmailAuthProvider.credential(cu.email, currentPw);
      await reauthenticateWithCredential(cu, credential);
      await updatePassword(cu, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirm('');
      setSaveStatus('success');
      setFeedbackMsg('');
      scheduleHide();
    } catch (err: any) {
      const code = err?.code ?? '';
      let msg = 'Could not update your password. Please try again.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        msg = 'Your current password is incorrect.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.';
      }
      setSaveStatus('error');
      setFeedbackMsg(msg);
      scheduleHide();
    } finally {
      setSaving(false);
    }
  };

  const handleResetEmail = async () => {
    const cu = auth.currentUser;
    if (!cu?.email || resetting) return;
    setResetting(true);
    try {
      await requestPasswordReset(cu.email);
      setResetStatus('success');
      setResetMsg(`A reset link was sent to ${cu.email}.`);
      scheduleResetHide();
    } catch (err) {
      setResetStatus('error');
      setResetMsg(err instanceof AuthEmailRateLimitError
        ? 'Too many attempts, please try again later.'
        : 'Could not send the reset email. Please try again.');
      scheduleResetHide();
    } finally {
      setResetting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Change password</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Current password ── */}
        <Text style={s.fieldLabel}>Current password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder="Your current password"
            placeholderTextColor={COLORS.fg3}
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowCurrent(v => !v)}
            activeOpacity={0.7}
          >
            <Feather name={showCurrent ? 'eye-off' : 'eye'} size={18} color={COLORS.fg3} />
          </TouchableOpacity>
        </View>

        {/* ── New password ── */}
        <Text style={s.fieldLabel}>New password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={newPw}
            onChangeText={setNewPw}
            placeholder="Min 8 characters"
            placeholderTextColor={COLORS.fg3}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowNew(v => !v)}
            activeOpacity={0.7}
          >
            <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color={COLORS.fg3} />
          </TouchableOpacity>
        </View>
        {pwValidation.error ? (
          <Text style={s.fieldError}>{pwValidation.error}</Text>
        ) : (
          <Text style={s.fieldHint}>At least 8 characters, with letters and numbers.</Text>
        )}

        {/* ── Confirm new password ── */}
        <Text style={s.fieldLabel}>Confirm new password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat password"
            placeholderTextColor={COLORS.fg3}
            secureTextEntry={!showConf}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleUpdate}
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowConf(v => !v)}
            activeOpacity={0.7}
          >
            <Feather name={showConf ? 'eye-off' : 'eye'} size={18} color={COLORS.fg3} />
          </TouchableOpacity>
        </View>
        {confirmError && (
          <Text style={s.fieldError}>{confirmError}</Text>
        )}

        {/* ── Feedback banners ── */}
        {saveStatus === 'success' && (
          <View style={s.bannerSuccess}>
            <Feather name="check-circle" size={15} color="#0F6E56" />
            <Text style={s.bannerSuccessText}>Your password has been updated.</Text>
          </View>
        )}
        {saveStatus === 'error' && (
          <View style={s.bannerError}>
            <Feather name="alert-circle" size={15} color="#B91C1C" />
            <Text style={s.bannerErrorText}>{feedbackMsg}</Text>
          </View>
        )}

        {/* ── Update button ── */}
        <TouchableOpacity
          style={[s.saveBtn, !canSubmit && s.saveBtnOff]}
          onPress={handleUpdate}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={COLORS.carbon} />
              <Text style={s.saveBtnText}>Updating…</Text>
            </>
          ) : (
            <Text style={s.saveBtnText}>Update password</Text>
          )}
        </TouchableOpacity>

        {/* ── Divider ── */}
        <View style={s.divider} />

        {/* ── Reset email feedback ── */}
        {resetStatus === 'success' && (
          <View style={s.bannerSuccess}>
            <Feather name="check-circle" size={15} color="#0F6E56" />
            <Text style={s.bannerSuccessText}>{resetMsg}</Text>
          </View>
        )}
        {resetStatus === 'error' && (
          <View style={s.bannerError}>
            <Feather name="alert-circle" size={15} color="#B91C1C" />
            <Text style={s.bannerErrorText}>{resetMsg}</Text>
          </View>
        )}

        {/* ── Reset email ── */}
        <TouchableOpacity
          style={s.resetBtn}
          onPress={handleResetEmail}
          disabled={resetting}
          activeOpacity={0.7}
        >
          {resetting
            ? <ActivityIndicator size="small" color={COLORS.fg3} />
            : <Text style={s.resetBtnText}>Send me a reset email instead</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

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

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    marginTop: 6,
    marginBottom: 16,
  },
  fieldError: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    marginTop: 6,
    marginBottom: 16,
  },

  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
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

  bannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    padding: 13,
    marginTop: 16,
    marginBottom: 4,
  },
  bannerSuccessText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F6E56',
    flex: 1,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 13,
    marginTop: 16,
    marginBottom: 4,
  },
  bannerErrorText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#B91C1C',
    flex: 1,
  },

  saveBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  saveBtnOff: {
    opacity: 0.45,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginVertical: 28,
  },

  resetBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.fg2,
    textDecorationLine: 'underline',
  },
});
