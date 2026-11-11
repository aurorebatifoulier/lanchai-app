// config/homeHero — the built-in hero banners' state (published / order); their content
// stays in constants/homeBanners.ts. Rule: the existing config/* rule (any session reads,
// admin writes) — no new rule. Order is shared with the admin hero slides (lib/heroItems.ts).
// Read failure: the LAST value read on this device (AsyncStorage) — a banner unpublished on
// purpose never comes back because of a network error; "all published" only when nothing
// was ever read here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { clearHomeCache } from './homeCache';
import { heroStateOf, type HeroEntry, type HeroState, EMPTY_HERO_STATE } from './heroItems';

const REF = () => doc(db, 'config', 'homeHero');
const LAST_KEY = 'home.heroState';

export async function getHeroState(): Promise<HeroState> {
  try {
    const snap = await getDoc(REF());
    const state = heroStateOf(snap.exists() ? snap.data() : null);
    AsyncStorage.setItem(LAST_KEY, JSON.stringify(state)).catch(() => {});
    return state;
  } catch {
    try {
      const last = await AsyncStorage.getItem(LAST_KEY);
      if (last) return heroStateOf(JSON.parse(last));
    } catch { /* nothing stored */ }
    return EMPTY_HERO_STATE;
  }
}

/** Admin: show / hide one built-in banner. */
export async function setBuiltInPublished(id: string, published: boolean): Promise<void> {
  await setDoc(REF(), { builtIns: { [id]: { published } }, updatedAt: serverTimestamp() }, { merge: true });
  clearHomeCache('heroState');
}

/** Admin: rewrites the WHOLE hero order as 0..n-1 (slides + built-ins), one batch. */
export async function saveHeroOrder(list: Pick<HeroEntry<{ id: string }>, 'key'>[]): Promise<void> {
  const batch = writeBatch(db);
  const builtIns: Record<string, { order: number }> = {};
  list.forEach((e, i) => {
    const [kind, id] = splitKey(e.key);
    if (kind === 'slide') batch.update(doc(db, 'homeSlides', id), { order: i, updatedAt: serverTimestamp() });
    else builtIns[id] = { order: i };
  });
  if (Object.keys(builtIns).length) batch.set(REF(), { builtIns, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  clearHomeCache('heroState');
  clearHomeCache('slides');
}

function splitKey(key: string): ['slide' | 'builtIn', string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) === 'slide' ? 'slide' : 'builtIn', key.slice(i + 1)];
}
