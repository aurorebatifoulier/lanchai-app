import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { ConfirmBox } from '@/components/ConfirmBox';
import {
  DEFAULT_TEST_REDIRECT,
  getEmailSettings,
  saveEmailSettings,
  sendTestEmails,
  type EmailSettings,
  type TestEmailsResult,
} from '@/lib/emailSettings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin → Shop settings: transactional email mode (test redirect vs live) + test-send.
// Self-contained (own load/save) so it never interferes with the shop form above it.
export default function EmailSettingsSection() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [redirectInput, setRedirectInput] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestEmailsResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    getEmailSettings()
      .then(s => { setSettings(s); setRedirectInput(s.redirectAllTo); })
      .catch(() => setSettings({ live: false, redirectAllTo: '' }));
  }, []);

  const effectiveRedirect = (settings?.redirectAllTo.trim() || DEFAULT_TEST_REDIRECT);

  const save = useCallback(async (next: EmailSettings, msg: string) => {
    setError(null); setSavedMsg(null);
    if (next.redirectAllTo.trim() && !EMAIL_RE.test(next.redirectAllTo.trim())) {
      setError('Enter a valid email address for the test inbox, or leave it empty.');
      return;
    }
    setSaving(true);
    try {
      await saveEmailSettings(next);
      setSettings({ ...next, redirectAllTo: next.redirectAllTo.trim() });
      setSavedMsg(msg);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, []);

  const runTest = useCallback(async () => {
    setTesting(true); setTestError(null); setTestResult(null);
    try {
      setTestResult(await sendTestEmails());
    } catch (err: any) {
      setTestError(err?.message ? `Test send failed: ${err.message}` : 'Test send failed. Please try again.');
    } finally {
      setTesting(false);
    }
  }, []);

  if (!settings) return <ActivityIndicator color={COLORS.amber} style={{ marginTop: 20 }} />;

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Emails</Text>

      <View style={[s.modeBox, settings.live ? s.modeLive : s.modeTest]}>
        <Feather name={settings.live ? 'send' : 'shield'} size={14} color={settings.live ? '#065F46' : COLORS.amberTintText} />
        <Text style={[s.modeText, { color: settings.live ? '#065F46' : COLORS.amberTintText }]}>
          {settings.live
            ? 'Live — emails go to real customers.'
            : `Test mode — all emails go to ${effectiveRedirect}`}
        </Text>
      </View>

      <Text style={s.fieldLabel}>Test inbox (redirect address)</Text>
      <TextInput
        style={s.input}
        value={redirectInput}
        onChangeText={t => { setRedirectInput(t); setError(null); setSavedMsg(null); }}
        placeholder={DEFAULT_TEST_REDIRECT}
        placeholderTextColor={COLORS.fg3}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!saving}
      />
      <Text style={s.hint}>
        Used while in test mode. Leave empty to use {DEFAULT_TEST_REDIRECT}.
      </Text>

      <TouchableOpacity
        style={s.secondaryBtn}
        onPress={() => save({ ...settings, redirectAllTo: redirectInput }, 'Test inbox saved.')}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Text style={s.secondaryBtnText}>Save test inbox</Text>
      </TouchableOpacity>

      {settings.live ? (
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => save({ ...settings, live: false }, 'Back in test mode.')}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={s.secondaryBtnText}>Switch back to test mode</Text>
        </TouchableOpacity>
      ) : confirmLive ? (
        <ConfirmBox
          text="Go live? From now on, every email goes to the real customer's address."
          confirmLabel="Go live"
          onCancel={() => setConfirmLive(false)}
          onConfirm={() => { setConfirmLive(false); save({ ...settings, live: true }, 'Emails are now live.'); }}
        />
      ) : (
        <TouchableOpacity style={s.secondaryBtn} onPress={() => setConfirmLive(true)} disabled={saving} activeOpacity={0.8}>
          <Text style={s.secondaryBtnText}>Go live</Text>
        </TouchableOpacity>
      )}

      {!!error && <Text style={s.errText}>{error}</Text>}
      {!!savedMsg && <Text style={s.okText}>{savedMsg}</Text>}

      <TouchableOpacity style={s.secondaryBtn} onPress={runTest} disabled={testing} activeOpacity={0.8}>
        {testing
          ? <ActivityIndicator size="small" color={COLORS.carbon} />
          : <Text style={s.secondaryBtnText}>Send test emails to me</Text>}
      </TouchableOpacity>
      <Text style={s.hint}>
        Sends every email template, filled with sample data, to your own admin address.
      </Text>
      {!!testError && <Text style={s.errText}>{testError}</Text>}
      {testResult && (
        <Text style={testResult.sent === testResult.total ? s.okText : s.errText}>
          {`${testResult.sent} of ${testResult.total} sample emails sent to ${testResult.to}.`}
          {testResult.sent < testResult.total
            ? ` Not sent: ${Object.entries(testResult.results).filter(([, r]) => r !== 'sent').map(([t, r]) => `${t} (${r})`).join(', ')}.`
            : ''}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginBottom: 12 },
  modeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1,
  },
  modeTest: { backgroundColor: COLORS.amberTint, borderColor: COLORS.amberTintBorder },
  modeLive: { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
  modeText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
  },
  hint: { fontSize: 11.5, fontWeight: '500', color: COLORS.fg3, marginTop: 5, marginBottom: 4, lineHeight: 16 },
  secondaryBtn: {
    height: 44, borderRadius: 12, marginTop: 10,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  errText: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 8, lineHeight: 17 },
  okText: { fontSize: 12, fontWeight: '600', color: '#065F46', marginTop: 8, lineHeight: 17 },
});
