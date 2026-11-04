// Personal-data scrubbing for crash reports (lib/sentry.ts) — pure, unit-tested in
// tests/unit/scrub.test.ts. E-mails / phone numbers masked, URL query strings dropped,
// any field named like an email / phone / name / address / free text redacted.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const SENSITIVE_KEY = /e-?mail|phone|whatsapp|name|address|contact|text|body|message|note|password|token|id_?doc|license/i;

/** Masks e-mails / phone numbers in a string and drops query strings from URLs. */
export function scrubString(s: string): string {
  return s
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1');
}

/** Deep copy with sensitive keys redacted and strings scrubbed (depth-limited). */
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') return scrubString(value) as T;
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) && typeof v !== 'number' && typeof v !== 'boolean' ? '[redacted]' : scrub(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
