import { UserProfile } from '@/lib/firestore';

// An approved business account cannot start a booking until it has a registration
// document on file — required for approval verification, not required at signup.
export function needsBtobDocument(profile: Pick<UserProfile, 'btobStatus' | 'customerType' | 'btobDocumentUrl'> | null | undefined): boolean {
  return profile?.btobStatus === 'approved'
    && profile?.customerType === 'business'
    && !profile?.btobDocumentUrl;
}

// Mirrors the users update rule in firestore.rules: the registration document can be
// (re)uploaded while the business account isn't approved, or once after approval if
// none is on file — never replaced after approval.
export function canReplaceBtobDocument(profile: Pick<UserProfile, 'accountType' | 'btobStatus' | 'btobDocumentUrl'> | null | undefined): boolean {
  return profile?.accountType === 'btob'
    && (profile.btobStatus !== 'approved' || !profile.btobDocumentUrl);
}
