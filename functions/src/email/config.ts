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
