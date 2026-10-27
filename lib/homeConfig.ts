import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { clearHomeCache } from './homeCache';

// Home settings — config/home (readable by signed-in users via the config/* rule,
// written by admins in Admin → Shop settings → Home).
export const DEFAULT_BUDGET_THRESHOLD_LAK = 100_000;
export const BUDGET_THRESHOLD_LIMITS = { min: 10_000, max: 10_000_000 } as const;

export interface HomeConfig { budgetThresholdLak: number }

function sanitize(d: Record<string, unknown> | undefined): HomeConfig {
  const v = Number(d?.budgetThresholdLak);
  const ok = Number.isFinite(v) && v >= BUDGET_THRESHOLD_LIMITS.min && v <= BUDGET_THRESHOLD_LIMITS.max;
  return { budgetThresholdLak: ok ? Math.round(v) : DEFAULT_BUDGET_THRESHOLD_LAK };
}

export async function getHomeConfig(): Promise<HomeConfig> {
  try {
    const snap = await getDoc(doc(db, 'config', 'home'));
    return sanitize(snap.exists() ? snap.data() : undefined);
  } catch {
    return sanitize(undefined);
  }
}

/** Read on mount and whenever `refreshKey` changes (e.g. on Home focus). */
export function useHomeConfig(refreshKey?: unknown): HomeConfig {
  const [cfg, setCfg] = useState<HomeConfig>(sanitize(undefined));
  useEffect(() => {
    let alive = true;
    getHomeConfig().then(c => { if (alive) setCfg(c); });
    return () => { alive = false; };
  }, [refreshKey]);
  return cfg;
}

/** Admin-only (config/* write rule). Merges. */
export async function saveHomeConfig(patch: Partial<HomeConfig>): Promise<void> {
  await setDoc(doc(db, 'config', 'home'), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  clearHomeCache('homeConfig'); // after the write (see lib/homeCache.ts)
}
