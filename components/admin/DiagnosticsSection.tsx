import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import PressScale from '@/components/PressScale';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle } from '@/components/account/ui';
import { sentryEnabled, sendTestError, testNativeCrash } from '@/lib/sentry';

// Admin → Shop settings → Diagnostics: proves crash reporting works on an installed build
// (Sentry is off in Expo Go / dev). "Send test error" reports a handled error; "Test
// crash" closes the app on purpose — the report arrives when it's reopened.
export default function DiagnosticsSection() {
  const [confirm, setConfirm] = useState<null | 'error' | 'crash'>(null);
  const [result, setResult] = useState<string | null>(null);
  const env = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

  return (
    <View style={{ marginTop: 28 }}>
      <SectionTitle>Diagnostics</SectionTitle>
      <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
        <Text style={UI.subtitle}>
          Crash reporting: {sentryEnabled ? `on · ${env}` : 'off (Expo Go or development)'}
        </Text>
        {confirm ? (
          <ConfirmBox
            text={confirm === 'crash'
              ? 'The app will close right away. Reopen it to send the crash report.'
              : 'Send a test error to the crash reports?'}
            confirmLabel={confirm === 'crash' ? 'Crash the app' : 'Send'}
            destructive={confirm === 'crash'}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              setConfirm(null);
              if (confirm === 'crash') testNativeCrash();
              else setResult(sendTestError() ? 'Test error sent. It shows in Sentry within a minute.' : 'Crash reporting is off in this build.');
            }}
          />
        ) : (
          <View style={s.row}>
            <PressScale style={[UI.btnSecondary, UI.btnCard, s.btn]} disabled={!sentryEnabled} onPress={() => { setResult(null); setConfirm('error'); }}>
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Send test error</Text>
            </PressScale>
            <PressScale style={[UI.btnSecondary, UI.btnCard, s.btn]} disabled={!sentryEnabled} onPress={() => { setResult(null); setConfirm('crash'); }}>
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Test crash</Text>
            </PressScale>
          </View>
        )}
        {!!result && <Text style={UI.subtitle}>{result}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1 },
});
