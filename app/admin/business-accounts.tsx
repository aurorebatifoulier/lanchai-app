import { Redirect } from 'expo-router';

// The business accounts list now lives in Admin → Verifications → Business (same rows,
// same detail screen at /admin/business-accounts/{uid}). Kept as a redirect so old links
// still work — and so this list file keeps owning the route next to the [uid] folder.
export default function AdminBusinessAccountsRedirect() {
  return <Redirect href={{ pathname: '/admin/verifications', params: { tab: 'business' } } as never} />;
}
