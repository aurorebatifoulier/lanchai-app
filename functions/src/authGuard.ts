// Guests browse the app through an ANONYMOUS Firebase session (contexts/AuthContext.tsx).
// Every renter callable takes its uid from here: a guest gets `undefined`, so the
// callable's existing "not signed in" check refuses it (unauthenticated) — only a real
// account (email / Google) can book, apply codes, upload documents… Mirrors the
// `isAccount()` helper of firestore.rules.

interface AuthLike {
  uid: string;
  token: { firebase?: { sign_in_provider?: string } } & Record<string, unknown>;
}

export function isAnonymousAuth(auth: AuthLike | undefined | null): boolean {
  return auth?.token?.firebase?.sign_in_provider === 'anonymous';
}

/** The caller's uid when it's a real account; undefined for a guest or no auth. */
export function accountUid(request: { auth?: AuthLike | null }): string | undefined {
  const auth = request.auth;
  if (!auth?.uid || isAnonymousAuth(auth)) return undefined;
  return auth.uid;
}
