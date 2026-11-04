import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import PressScale from '@/components/PressScale';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle } from '@/components/account/ui';
import { sentryEnabled, sendTestError, testNativeCrash } from '@/lib/sentry';
import { getJobHealth, type JobRow } from '@/lib/jobHealth';
import { vteWhen } from '@/lib/vteTime';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';

// Admin → Shop settings → Diagnostics: proves crash reporting works on an installed build
// (Sentry is off in Expo Go / dev). "Send test error" reports a handled error; "Test
// crash" closes the app on purpose — the report arrives when it's reopened.
export default function DiagnosticsSection() {
  const [confirm, setConfirm] = useState<null | 'error' | 'crash'>(null);
  const [result, setResult] = useState<string | null>(null);
  const env = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [jobsError, setJobsError] = useState(false);
  useEffect(() => { getJobHealth().then(setJobs).catch(() => setJobsError(true)); }, []);

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

      <View style={[UI.card, UI.cardPadded, { gap: 8, marginTop: 10 }]}>
        <Text style={UI.title}>Scheduled jobs</Text>
        {jobsError && <Text style={UI.errorText}>Couldn’t load the job status.</Text>}
        {jobs?.map(j => (
          <View key={j.name} style={s.jobRow}>
            <View style={[s.dot, { backgroundColor: DOT[j.state] }]} />
            <View style={{ flex: 1 }}>
              <Text style={UI.body}>{j.label}</Text>
              <Text style={UI.subtitle}>
                {STATE_TEXT[j.state]}{j.lastOkAtMs ? ` · last OK ${vteWhen(j.lastOkAtMs)}` : ''}
              </Text>
              {j.state === 'error' && !!j.lastError && <Text style={UI.subtitle} numberOfLines={2}>{j.lastError}</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const STATE_TEXT: Record<JobRow['state'], string> = { ok: 'OK', error: 'Last run failed', late: 'Late — no successful run recently', never: 'No run recorded yet' };
// Small status dots: green / red only as signals (design rule), amber = late, grey = none.
const DOT: Record<JobRow['state'], string> = { ok: COLORS.success, error: COLORS.danger, late: SHADES.amber, never: SHADES.carbonFaint };

const s = StyleSheet.create({
  jobRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1 },
});
