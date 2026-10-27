// Small in-memory cache for the Home reads (app lifetime). Admin-managed / slow-changing
// data is reused for a few minutes between Home visits; pull-to-refresh, sign-out and
// admin saves clear it. Renter-specific data (reservations, favourites) is never cached.
export const HOME_TTL = {
  config: 10 * 60_000,      // config/home, slides, collections
  products: 5 * 60_000,
  occupancy: 2 * 60_000,    // indicative only — booking re-checks server-side
} as const;

const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<T> {
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const pending = inflight.get(key);
  if (!force && pending) return pending as Promise<T>;
  const p = load()
    .then(value => { store.set(key, { at: Date.now(), value }); return value; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Clears everything, or only the keys starting with `prefix`. */
export function clearHomeCache(prefix?: string): void {
  for (const k of [...store.keys()]) if (!prefix || k.startsWith(prefix)) store.delete(k);
  // Also forget reads in flight: one started before an admin save must not be reused.
  for (const k of [...inflight.keys()]) if (!prefix || k.startsWith(prefix)) inflight.delete(k);
}
