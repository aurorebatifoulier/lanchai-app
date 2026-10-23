// Identity document required to rent — shared by the app (My ID, booking step, admin)
// and the Cloud Functions (submitIdentityDocument, createReservations). Dependency-free
// (see latePenalty.ts). Data: identityChecks/{uid} (server-written; owner + admin read)
// + users/{uid}.idOnFile / idDocVersion (server-written, outside the users allow-list).
// Files live in Storage under idDocs/{uid}/ — paths only, never download URLs.

export type IdDocType = 'passport' | 'national_id' | 'lao_id';

export const ID_DOC_TYPES: { key: IdDocType; label: string }[] = [
  { key: 'passport', label: 'Passport' },
  { key: 'national_id', label: 'National ID card' },
  { key: 'lao_id', label: 'Lao ID card' },
];

export const isIdDocType = (v: unknown): v is IdDocType =>
  v === 'passport' || v === 'national_id' || v === 'lao_id';

export const ID_MAX_PAGES = 6;
export const ID_MAX_BYTES = 10 * 1024 * 1024;

export type IdentityStatus = 'none' | 'on_file' | 'rejected';

/** identityChecks/{uid} — the CURRENT identity document of a renter. */
export interface IdentityRecord {
  status: IdentityStatus;
  docType?: IdDocType;
  files?: string[];           // Storage paths under idDocs/{uid}/
  source?: 'renter' | 'counter';
  /** +1 for every newly registered document — the first-pick-up check is tied to it. */
  version?: number;
  rejection?: { reason: string; text?: string };
}

/**
 * First-pick-up double check: needed when no document is on file (shown at the shop),
 * or when the document on file hasn't been checked in person yet — the check is tied to
 * the document VERSION (users.idCheckedVersion), so every NEW document (after a purge,
 * a replacement or a rejection) requires it again. users.idCheckedAt stays as history.
 */
export function idCheckNeeded(
  user: { idOnFile?: unknown; idDocVersion?: unknown; idCheckedVersion?: unknown } | null | undefined,
): boolean {
  if (user?.idOnFile !== true) return true;
  return typeof user.idDocVersion !== 'number' || user.idCheckedVersion !== user.idDocVersion;
}

/** Reservation statuses that still lead to a pick-up (the check happens at handover). */
export const PRE_PICKUP_STATUSES = ['pending_payment', 'confirmed'] as const;

/** Fixable reasons staff can give when declining an ID document. */
export const ID_REJECTION_REASONS: { key: string; label: string; text: string }[] = [
  { key: 'unreadable', label: 'Photo unreadable', text: 'The photo is blurry or cut off — please add a sharp photo with all four corners visible.' },
  { key: 'expired', label: 'Document expired', text: 'This document has expired — please add a valid one.' },
  { key: 'name_mismatch', label: 'Name doesn\u2019t match', text: 'The name doesn\u2019t match your account — please add your own ID document.' },
  { key: 'wrong_document', label: 'Not an ID document', text: 'This isn\u2019t a passport or ID card — please add one of those.' },
];

/** Storage path prefix a renter's identity files must use. */
export const idDocPrefix = (uid: string) => `idDocs/${uid}/`;

/**
 * Booking rule (createReservations, mirrored by the app's booking step): a document on
 * file, or "I'll show my ID at the shop" — except after a rejection, where only a new
 * document unblocks bookings.
 */
export function identityBookingDecision(
  identity: Pick<IdentityRecord, 'status'> | null | undefined,
  idCheckAtCounter: boolean,
): 'ok' | 'id-required' | 'id-rejected' {
  if (identity?.status === 'on_file') return 'ok';
  if (identity?.status === 'rejected') return 'id-rejected';
  return idCheckAtCounter ? 'ok' : 'id-required';
}
