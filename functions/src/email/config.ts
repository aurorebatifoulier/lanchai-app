import { defineSecret } from 'firebase-functions/params';

// Brevo transactional API key — stored ONLY as a Firebase secret, set from a terminal
// with `firebase functions:secrets:set BREVO_API_KEY`. Never in code, files or chat.
// Every function that sends email must list it in its `secrets` option.
export const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
export const EMAIL_SENDER   = { name: 'LANCHAI', email: 'bookings@lanchai.la' };
export const EMAIL_REPLY_TO = { name: 'LANCHAI', email: 'contact@lanchai.la' };

// Redirect (test) mode is ON unless config/emailSettings.live === true: every email goes
// to redirectAllTo, or to this address when that field is missing. Protects the
// lanchai.la sender reputation from bounces on fake test-account addresses.
export const DEFAULT_TEST_REDIRECT = 'lanchai.laos@gmail.com';

export const REGION = 'asia-southeast1';

// Public web base for email assets + the https → app redirect page (Firebase Hosting,
// files in /hosting). THE single place to change when moving to https://lanchai.la.
export const PUBLIC_BASE_URL = 'https://lanchai-app.web.app';

export const LOGO_URL = `${PUBLIC_BASE_URL}/email/lanchai-logo@2x.png`;

/** https link that opens an in-app path (allow-listed in hosting/open/index.html). */
export function appLink(path: 'home' | 'reservations' | 'legal/cancellation' | `rentals/${string}`): string {
  return `${PUBLIC_BASE_URL}/open/?to=${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}
