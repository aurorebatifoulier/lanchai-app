import { UserProfile } from '@/lib/firestore';

// An approved business account cannot start a booking until it has a registration
// document on file — required for approval verification, not required at signup.
export function needsBtobDocument(profile: Pick<UserProfile, 'btobStatus' | 'customerType' | 'btobDocumentUrl'> | null | undefined): boolean {
  return profile?.btobStatus === 'approved'
    && profile?.customerType === 'business'
    && !profile?.btobDocumentUrl;
}
