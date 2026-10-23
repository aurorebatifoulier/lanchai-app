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
