import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Launch feature flags — config/features, edited in Admin → Shop settings. Readable
// before sign-in (firestore.rules) because the signup screen needs businessAccounts.
// Missing doc / field / read error → every flag OFF (the launch defaults).
export interface FeatureFlags {
  /** Business (BtoB) signup path. OFF at launch — existing BtoB accounts keep working. */
  businessAccounts: boolean;
  /** "News and offers" opt-in on the Notifications screen. OFF until decided. */
  newsletter: boolean;
}

export const FEATURE_DEFAULTS: FeatureFlags = { businessAccounts: false, newsletter: false };

export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const snap = await getDoc(doc(db, 'config', 'features'));
    const d = snap.exists() ? snap.data() : {};
    return { businessAccounts: d.businessAccounts === true, newsletter: d.newsletter === true };
  } catch {
    return FEATURE_DEFAULTS;
  }
}

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(FEATURE_DEFAULTS);
  useEffect(() => {
    let alive = true;
    getFeatureFlags().then(f => { if (alive) setFlags(f); });
    return () => { alive = false; };
  }, []);
  return flags;
}

/** Admin-only (config/* write rule). Merges. */
export async function saveFeatureFlag(key: keyof FeatureFlags, value: boolean): Promise<void> {
  await setDoc(doc(db, 'config', 'features'), { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
