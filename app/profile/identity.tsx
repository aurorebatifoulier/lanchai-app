import { Redirect } from 'expo-router';

// Merged into ID & residency (app/profile/id-residency.tsx) — kept as a redirect so
// links in emails / notifications sent before the merge still open the right screen.
export default function MyIdRedirect() {
  return <Redirect href="/profile/id-residency" />;
}
