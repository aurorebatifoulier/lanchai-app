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

export { plural } from '@/utils/plural';

/**
 * Opens an app route; a legacy `/category/{id}` link goes to Explore with that category.
 * An `/explore?…` link gets a fresh `t` token so Explore re-applies its params (`q`,
 * `ask=1`) even when the tab is already mounted with the same ones.
 */
export function openAppRoute(router: Router, route: string): void {
  const m = /^\/category\/([\w-]+)$/.exec(route);
  if (m) openCategory(router, m[1]);
  else if (/^\/explore\?/.test(route)) router.push(`${route}&t=${Date.now()}` as never);
  else router.push(route as never);
}
