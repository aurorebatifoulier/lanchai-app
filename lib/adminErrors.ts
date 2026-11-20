// Admin-facing callable errors: ALWAYS show the real error code, so a failure can be
// diagnosed from the phone ("Couldn't load the team (not-found)" = the function isn't
// deployed; "(permission-denied)" / "(owner-only)" = role; "(unavailable)" = network).
// Pure (no Firebase import) — tests/unit/adminErrors.test.ts. Admin screens only: never
// use this for renter copy.

/** Messages that replace the server's text for a given details.code. */
const KNOWN: Record<string, string> = {
  'no-account': 'No account with this email: ask them to sign up first.',
};

interface CallableErrorLike {
  code?: unknown;          // FirebaseError: 'functions/not-found', 'functions/internal'…
  message?: unknown;
  details?: { code?: unknown } | null;
}

/** The most specific code: our HttpsError details.code, else the transport code. */
export function adminErrorCode(err: unknown): string {
  const e = (err ?? {}) as CallableErrorLike;
  if (typeof e.details?.code === 'string' && e.details.code) return e.details.code;
  if (typeof e.code === 'string' && e.code) return e.code.replace(/^functions\//, '');
  return 'unknown';
}

/**
 * "{our server message} ({code})" when the server sent one of our coded errors, else
 * "{base} ({code})." — `base` without a final period, e.g. "Couldn’t load the team".
 */
export function adminErrorMessage(err: unknown, base: string): string {
  const e = (err ?? {}) as CallableErrorLike;
  const code = adminErrorCode(err);
  if (KNOWN[code]) return KNOWN[code];
  const ours = typeof e.details?.code === 'string' && typeof e.message === 'string' && e.message.trim();
  if (ours) return `${String(e.message).trim().replace(/\.$/, '')} (${code}).`;
  return `${base} (${code}).`;
}
