// Business-account rejection reasons — single source for the admin picker
// (app/admin/business-accounts/[uid].tsx), the renter's status screen
// (app/btob-rejected.tsx) and the rejection email. Dependency-free (see latePenalty.ts).

export type BtobRejectionKey = 'doc_unreadable' | 'doc_missing_expired' | 'details_mismatch' | 'not_eligible' | 'other';

export interface BtobRejectionPreset {
  adminLabel: string;
  /** true = renter can fix and resubmit; false = final; null = admin chooses ("other"). */
  fixable: boolean | null;
  /** Fixable: what we need (email card "What we need", preheader). */
  need?: string;
  needBullets?: { icon: 'camera' | 'file'; text: string }[];
  /** Final: the reason sentence shown to the renter. */
  reason?: string;
  /** Free text required (always for "other"). */
  textRequired?: boolean;
}

export const BTOB_REJECTION_REASONS: Record<BtobRejectionKey, BtobRejectionPreset> = {
  doc_unreadable: {
    adminLabel: 'Document unreadable',
    fixable: true,
    need: 'A clearer registration document',
    needBullets: [
      { icon: 'camera', text: 'A sharp photo, all four corners visible' },
      { icon: 'camera', text: 'Good lighting, no glare or shadows' },
    ],
  },
  doc_missing_expired: {
    adminLabel: 'Document missing or expired',
    fixable: true,
    need: 'A valid, up-to-date registration document',
  },
  details_mismatch: {
    adminLabel: 'Company details don’t match',
    fixable: true,
    need: 'Company details matching your registration document (name, licence number, responsible person)',
  },
  not_eligible: {
    adminLabel: 'Not eligible for a business account',
    fixable: false,
    reason: 'Business accounts are for registered companies renting for their activity.',
  },
  other: {
    adminLabel: 'Other',
    fixable: null,
    textRequired: true,
  },
};

export const BTOB_REJECTION_KEYS = Object.keys(BTOB_REJECTION_REASONS) as BtobRejectionKey[];

export function isBtobRejectionKey(v: unknown): v is BtobRejectionKey {
  return typeof v === 'string' && v in BTOB_REJECTION_REASONS;
}

// Review-time promise shown after a fixable rejection (email + app). Set to '' to
// remove it everywhere.
export const BTOB_REVIEW_TIME_NOTE = 'Once updated, we usually review it within 1 business day.';

/** Short line for the preheader / app title of a fixable rejection, e.g. "We need a clearer registration document". */
export function btobNeedLine(key: BtobRejectionKey | null | undefined): string {
  const need = key ? BTOB_REJECTION_REASONS[key]?.need : undefined;
  return need ? `We need ${need.charAt(0).toLowerCase()}${need.slice(1)}` : 'We need a bit more information';
}
