import * as Sentry from '@sentry/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { scrub, scrubString } from '@/utils/scrub';

// Crash + error reporting (Sentry, EU region). Imported FIRST by app/_layout.tsx.
// PRIVACY — never send personal data:
//   • the user is identified by their Firebase uid ONLY (setSentryUser) — never an email,
//     phone or name; sendDefaultPii is off (no IP);
//   • beforeSend / beforeBreadcrumb scrub e-mail addresses, phone numbers, query strings
//     and every field named like email / phone / name / address / text / message body;
//   • console breadcrumbs are dropped (they can carry user text).
// Off in Expo Go and in dev (unless EXPO_PUBLIC_SENTRY_FORCE=1). Environment =
// EXPO_PUBLIC_APP_ENV (development | beta | production, set per EAS profile).

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const sentryEnabled = !!DSN && !inExpoGo && (!__DEV__ || process.env.EXPO_PUBLIC_SENTRY_FORCE === '1');

if (sentryEnabled) {
  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0, // errors only — stays well inside the free plan
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id }; // uid only
      if (event.request) delete event.request;
      if (event.message) event.message = scrubString(event.message);
      event.exception?.values?.forEach(v => { if (v.value) v.value = scrubString(v.value); });
      if (event.extra) event.extra = scrub(event.extra);
      if (event.contexts) {
        const { device, os, app, runtime, ...rest } = event.contexts;
        event.contexts = { device, os, app, runtime, ...scrub(rest) };
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'console') return null;
      if (crumb.message) crumb.message = scrubString(crumb.message);
      if (crumb.data) crumb.data = scrub(crumb.data);
      return crumb;
    },
  });
}

/** The Firebase uid (guest or account) — nothing else about the person. */
export function setSentryUser(uid: string | null): void {
  if (!sentryEnabled) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

/** Admin → Shop settings → Diagnostics. */
export function sendTestError(): string | null {
  if (!sentryEnabled) return null;
  return Sentry.captureException(new Error(`LANCHAI test error (${APP_ENV})`));
}
export function testNativeCrash(): void {
  if (sentryEnabled) Sentry.nativeCrash();
}

export { Sentry };
