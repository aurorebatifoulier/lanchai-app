// Crash reports never carry personal data (utils/scrub.ts, used by lib/sentry.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, scrubString } from '../../utils/scrub';

test('e-mails, phone numbers and query strings are masked in text', () => {
  assert.equal(scrubString('Failed for ann.b+x@gmail.com'), 'Failed for [email]');
  assert.equal(scrubString('call +856 20 5555 1234 now'), 'call [phone] now');
  assert.equal(scrubString('GET https://x.app/open?rid=abc&rating=5 failed'), 'GET https://x.app/open failed');
  assert.equal(scrubString('Booking LNC-20261114-ABCD failed'), 'Booking LNC-20261114-ABCD failed');
});

test('sensitive fields are redacted at any depth; numbers / flags kept', () => {
  const out = scrub({
    screen: 'booking', quantity: 2, isGuest: false,
    user: { email: 'a@b.co', phoneNumber: '+85620', firstName: 'Ann', displayName: 'Ann B' },
    chat: [{ text: 'my passport number is X', senderType: 'renter' }],
    address: 'Ban Phonxay', note: 'call me',
  });
  assert.deepEqual(out, {
    screen: 'booking', quantity: 2, isGuest: false,
    user: { email: '[redacted]', phoneNumber: '[redacted]', firstName: '[redacted]', displayName: '[redacted]' },
    chat: [{ text: '[redacted]', senderType: 'renter' }],
    address: '[redacted]', note: '[redacted]',
  });
});
