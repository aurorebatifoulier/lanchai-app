import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_LATE_GRACE_HOURS, sanitizeGraceHours } from '@/functions/src/shared/latePenalty';

// config/latePolicy — ADMIN-ONLY (firestore.rules excludes it from the renter-readable
// config/* rule). Holds the internal late-return grace period, which must never be
// surfaced to renters. Only admin screens may call these.

export async function getGraceHours(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'config', 'latePolicy'));
    return sanitizeGraceHours(snap.data()?.graceHours);
  } catch {
    return DEFAULT_LATE_GRACE_HOURS;
  }
}

export async function saveGraceHours(graceHours: number): Promise<void> {
  await setDoc(doc(db, 'config', 'latePolicy'), {
    graceHours,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Admin screens only. Starts at the default until the config doc loads. */
export function useGraceHours(): number {
  const [graceHours, setGraceHours] = useState(DEFAULT_LATE_GRACE_HOURS);
  useEffect(() => {
    getGraceHours().then(setGraceHours);
  }, []);
  return graceHours;
}
