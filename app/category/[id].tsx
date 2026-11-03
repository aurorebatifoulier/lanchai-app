import { Redirect, useLocalSearchParams } from 'expo-router';

// There is no category page any more: a category = the Explore tab with it preselected
// (lib/navigation openCategory). This route only redirects old links (emails, notifications,
// broadcasts, deep links) to Explore with that category.
export default function CategoryRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Redirect href={{ pathname: '/(tabs)/explore', params: { category: String(id ?? ''), t: String(Date.now()) } } as never} />
  );
}
