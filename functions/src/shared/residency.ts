// Residency verification (resident vs tourist — the deposit depends on customerType).
// Shared by the app (renter screen, admin review) and the Cloud Functions (callables,
// daily expiry, emails). Dependency-free (see latePenalty.ts).
//
// Two paths:
//   lao_national → the Lao ID card ON FILE as the identity document (My ID) is enough.
//   foreign      → an identity document on file (any type) + a proof of residence:
//                  visa / residence permit, or a lease contract (photos, idDocs/{uid}/).
// Data: residencyRequests/{uid} (server-written; owner + admin read); decision fields on
// users/{uid} (customerType, residencyStatus, residencyValidUntil, residencyBasis,
// residencyVerifiedAt/By) — all outside the users allow-list.

export type ResidencyPath = 'lao_national' | 'foreign';
export type ResidencyProofType = 'visa_permit' | 'lease';
export type ResidencyBasis = 'lao_id' | 'visa' | 'lease' | 'legacy';
export type ResidencyStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'expired';

export const RESIDENCY_PROOF_TYPES: { key: ResidencyProofType; label: string; hint: string }[] = [
  { key: 'visa_permit', label: 'Visa or residence permit', hint: 'The page with your name and the expiry date.' },
  { key: 'lease', label: 'Lease contract', hint: 'The pages with your name, the address and the dates.' },
];

export const RESIDENCY_MAX_PAGES = 6;

export const basisFor = (path: ResidencyPath, proof?: ResidencyProofType | null): ResidencyBasis =>
  path === 'lao_national' ? 'lao_id' : proof === 'lease' ? 'lease' : 'visa';

/** "Valid until" is mandatory when approving a foreign resident, optional for Lao nationals. */
export const validUntilRequired = (path: ResidencyPath) => path === 'foreign';

export type ResidencyRejectionKey =
  | 'doc_unreadable' | 'doc_expired' | 'proof_missing' | 'name_mismatch' | 'not_eligible' | 'other';

export interface ResidencyRejectionPreset {
  adminLabel: string;
  /** true = fixable (renter updates and resubmits), false = final, null = admin chooses. */
  fixable: boolean | null;
  /** Renter-facing sentence (app + email). */
  text: string;
  textRequired?: boolean;
}

export const RESIDENCY_REJECTION_REASONS: Record<ResidencyRejectionKey, ResidencyRejectionPreset> = {
  doc_unreadable: { adminLabel: 'Document unreadable', fixable: true, text: 'A sharp photo of your document, with all four corners visible.' },
  doc_expired: { adminLabel: 'Document expired', fixable: true, text: 'A valid, up-to-date document.' },
  proof_missing: { adminLabel: 'Proof of residence missing', fixable: true, text: 'A visa, residence permit or lease contract in your name.' },
  name_mismatch: { adminLabel: 'Name doesn’t match', fixable: true, text: 'Documents in the same name as your account and your ID.' },
  not_eligible: { adminLabel: 'Not eligible', fixable: false, text: 'Resident status is for people who live in Laos.' },
  other: { adminLabel: 'Other', fixable: null, text: '', textRequired: true },
};

export const RESIDENCY_REJECTION_KEYS = Object.keys(RESIDENCY_REJECTION_REASONS) as ResidencyRejectionKey[];
export const isResidencyRejectionKey = (v: unknown): v is ResidencyRejectionKey =>
  typeof v === 'string' && v in RESIDENCY_REJECTION_REASONS;

/** Days of grace given to legacy residents (resident without any verification). */
export const LEGACY_RESIDENT_GRACE_DAYS = 30;
