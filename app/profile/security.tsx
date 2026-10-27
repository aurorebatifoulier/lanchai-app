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
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, CheckLine, useScreenInsets } from '@/components/account/ui';
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
  const screen = useScreenInsets();
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
      style={[s.root, screen.root]}
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
        contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle style={{ marginTop: 16 }}>Change password</SectionTitle>
        <View style={[UI.card, UI.cardPadded]}>
          {/* ── Current password ── */}
          <PasswordField
            label="Current password"
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder="Your current password"
            visible={showCurrent}
            onToggle={() => setShowCurrent(v => !v)}
            returnKeyType="next"
          />

          {/* ── New password ── */}
          <View style={{ marginTop: 16 }}>
            <PasswordField
              label="New password"
              value={newPw}
              onChangeText={setNewPw}
              placeholder="Min 8 characters"
              visible={showNew}
              onToggle={() => setShowNew(v => !v)}
              returnKeyType="next"
            />
          </View>
          {pwValidation.error ? (
            <Text style={[UI.errorText, s.fieldNote]}>{pwValidation.error}</Text>
          ) : (
            <Text style={[UI.small, s.fieldNote]}>At least 8 characters, with letters and numbers.</Text>
          )}

          {/* ── Confirm new password ── */}
          <View style={{ marginTop: 16 }}>
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              visible={showConf}
              onToggle={() => setShowConf(v => !v)}
              returnKeyType="done"
              onSubmitEditing={handleUpdate}
            />
          </View>
          {confirmError && <Text style={[UI.errorText, s.fieldNote]}>{confirmError}</Text>}

          {/* ── Feedback: subtle line, no banner ── */}
          {saveStatus === 'success' && <View style={s.feedback}><CheckLine text="Your password has been updated." /></View>}
          {saveStatus === 'error' && <Text style={[UI.errorText, s.feedback]}>{feedbackMsg}</Text>}

          {/* ── Update button ── */}
          <TouchableOpacity
            style={[UI.btnPrimary, { marginTop: 18 }, !canSubmit && UI.btnDisabled]}
            onPress={handleUpdate}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color={SHADES.carbon} />
                <Text style={UI.btnPrimaryText}>Updating…</Text>
              </>
            ) : (
              <Text style={UI.btnPrimaryText}>Update password</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Reset email ── */}
        <SectionTitle>Forgot your password?</SectionTitle>
        <View style={[UI.card, UI.cardPadded]}>
          <TouchableOpacity
            style={[UI.btnSecondary, resetting && UI.btnDisabled]}
            onPress={handleResetEmail}
            disabled={resetting}
            activeOpacity={0.7}
          >
            {resetting
              ? <ActivityIndicator size="small" color={SHADES.carbon} />
              : (
                <>
                  <Feather name="mail" size={15} color={SHADES.carbon} />
                  <Text style={UI.btnSecondaryText}>Send me a reset email instead</Text>
                </>
              )}
          </TouchableOpacity>
          {resetStatus === 'success' && <View style={s.feedback}><CheckLine text={resetMsg} /></View>}
          {resetStatus === 'error' && <Text style={[UI.errorText, s.feedback]}>{resetMsg}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Password input with the show / hide eye inside the field.
function PasswordField({
  label, value, onChangeText, placeholder, visible, onToggle, returnKeyType, onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  returnKeyType: 'next' | 'done';
  onSubmitEditing?: () => void;
}) {
  return (
    <>
      <Text style={UI.fieldLabel}>{label}</Text>
      <View style={[UI.input, s.passwordRow]}>
        <TextInput
          style={s.passwordInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={SHADES.carbonFaint}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} hitSlop={10}>
          <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={SHADES.carbonMuted} />
        </TouchableOpacity>
      </View>
    </>
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

  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  passwordInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '500', color: SHADES.carbon, paddingVertical: 0 },
  fieldNote: { marginTop: 6 },
  feedback: { marginTop: 14 },
});
