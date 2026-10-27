import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { cached, clearHomeCache, HOME_TTL } from './homeCache';
import { DEFAULT_SEARCH_GROUPS, sanitizeGroups, type SearchGroup } from './searchVocabulary';

// Search vocabulary — config/search { groups } (config/* rule: signed-in read, admin
// write). Cached 10 min like the other admin-managed Home data; missing / unreadable →
// the built-in defaults.
export async function getSearchGroups(force = false): Promise<SearchGroup[]> {
  return cached('searchVocabulary', HOME_TTL.config, async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'search'));
      return snap.exists() ? sanitizeGroups(snap.data().groups) : DEFAULT_SEARCH_GROUPS;
    } catch {
      return DEFAULT_SEARCH_GROUPS;
    }
  }, force);
}

/** Re-read on every focus (from the cache — free unless an admin save cleared it), so
 *  tab screens that stay mounted (Explore) pick up a vocabulary change at once. */
export function useSearchGroups(): SearchGroup[] {
  const [groups, setGroups] = useState<SearchGroup[]>(DEFAULT_SEARCH_GROUPS);
  useFocusEffect(useCallback(() => {
    let alive = true;
    getSearchGroups().then(g => { if (alive) setGroups(g); });
    return () => { alive = false; };
  }, []));
  return groups;
}

/** Admin-only (config/* write rule). */
export async function saveSearchGroups(groups: SearchGroup[]): Promise<void> {
  await setDoc(doc(db, 'config', 'search'), { groups: sanitizeGroups(groups), updatedAt: serverTimestamp() });
  // After the write: the next read (any screen's next focus) gets the new vocabulary.
  clearHomeCache('searchVocabulary');
}
