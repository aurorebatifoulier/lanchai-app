import type { Router } from 'expo-router';

// Shared navigation helpers.

/**
 * A category = the Explore tab with that category preselected (there is no category page
 * any more). The `t` token makes Explore re-apply it even when it's already showing
 * (same category tapped again after the renter changed the chip).
 */
export function openCategory(router: Router, id: string): void {
  router.navigate({ pathname: '/(tabs)/explore', params: { category: id, t: String(Date.now()) } } as never);
}

/** "1 item" / "3 items". */
export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/** Opens an app route; a legacy `/category/{id}` link goes to Explore with that category. */
export function openAppRoute(router: Router, route: string): void {
  const m = /^\/category\/([\w-]+)$/.exec(route);
  if (m) openCategory(router, m[1]);
  else router.push(route as never);
}
