import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { AUTH_COPY } from '@/constants/authCopy';
import { UI, useScreenInsets, CheckLine } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { AuthInput } from '@/components/auth/AuthFields';
import { requestPasswordReset, AuthEmailRateLimitError } from '@/lib/authEmails';
import { EMAIL_RE } from '@/lib/authActions';

const c = AUTH_COPY.forgot;

// "Happens to the best of us." — the reset link by email (our own Brevo email through
// requestPasswordReset, Firebase's as fallback). Prefilled with the email typed on the
// sign-in screen. Never says whether the account exists.
export function ForgotPasswordSheet({ visible, initialEmail, onClose }: {
  visible: boolean; initialEmail: string; onClose: () => void;
}) {
  const screen = useScreenInsets();
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setEmail(initialEmail); setStatus('idle'); setError(null); }
  }, [visible, initialEmail]);

  const send = async () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) { setError(c.invalid); return; }
    setError(null);
    setStatus('sending');
    try {
      await requestPasswordReset(e);
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof AuthEmailRateLimitError ? c.rateLimited : c.failed);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.root}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[s.sheet, { paddingBottom: screen.bottom + 20 }]}>
            <View style={s.handle} />
            <Text style={s.title}>{c.title}</Text>
            <Text style={s.sub}>{c.sub}</Text>
            {status === 'sent' ? (
              <View style={{ marginTop: 18 }}><CheckLine text={c.sent(email.trim())} /></View>
            ) : (
              <>
                <AuthInput
                  style={{ marginTop: 18 }}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={AUTH_COPY.signIn.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  onSubmitEditing={send}
                />
                {!!error && <Text style={[UI.errorText, { marginTop: 8 }]}>{error}</Text>}
                <PressScale style={[UI.btnPrimary, { marginTop: 14 }]} onPress={send} disabled={status === 'sending'}>
                  {status === 'sending' ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.send}</Text>}
                </PressScale>
              </>
            )}
            <Text style={s.spam}>{c.spam}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 18 },
  title: { ...TYPE.sectionTitle, fontSize: 20, lineHeight: 26, color: SHADES.carbon },
  sub: { ...TYPE.body, color: SHADES.carbonMuted, marginTop: 6 },
  spam: { ...TYPE.small, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', marginTop: 14 },
});
