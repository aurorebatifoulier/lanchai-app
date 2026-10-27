// Search vocabulary — groups of related terms (a "lexical field"). A query term that
// matches any term of a group expands to every term of that group, at a lower weight
// than a direct match (lib/search.ts). Admin-editable in Admin → Search vocabulary
// (config/search); these defaults apply while that doc doesn't exist. Terms may be
// multi-word ("boat racing"); Lao / French terms can be added to the same groups later.
// Dependency-free on purpose (lib/search.ts and its test script import it).

export interface SearchGroup {
  id: string;
  label: string;
  terms: string[];
}

export const SEARCH_LIMITS = { groups: 60, termsPerGroup: 40, termLength: 30, keywords: 20 } as const;

export const DEFAULT_SEARCH_GROUPS: SearchGroup[] = [
  // ── The 6 categories ──
  { id: 'party', label: 'Fun & party', terms: ['party', 'fun', 'speaker', 'music', 'sound', 'lights', 'karaoke', 'dj', 'celebration', 'game', 'board game', 'book', 'projector', 'movie night'] },
  { id: 'diy', label: 'Tools & DIY', terms: ['diy', 'tools', 'tool', 'drill', 'repair', 'build', 'hammer', 'saw', 'ladder', 'screwdriver', 'fix', 'garden', 'renovation'] },
  { id: 'camping', label: 'Outdoor & camping', terms: ['camping', 'outdoor', 'tent', 'river', 'sleeping', 'sleeping bag', 'nature', 'weekend', 'hiking', 'cooler', 'picnic', 'trip', 'mountain'] },
  { id: 'baby', label: 'Kids & baby', terms: ['baby', 'kids', 'kid', 'child', 'children', 'cot', 'crib', 'stroller', 'pram', 'toddler', 'infant', 'high chair', 'car seat', 'toy'] },
  { id: 'sports', label: 'Sports', terms: ['sports', 'sport', 'bike', 'bicycle', 'football', 'soccer', 'ball', 'fitness', 'workout', 'gym', 'yoga', 'racket', 'badminton', 'kayak'] },
  { id: 'home', label: 'Home', terms: ['home', 'house', 'furniture', 'chair', 'table', 'fan', 'cleaning', 'vacuum', 'kitchen', 'appliance', 'mattress', 'guest bed'] },
  // ── Occasions ──
  { id: 'moving', label: 'Moving day', terms: ['moving', 'move', 'trolley', 'boxes', 'ladder', 'drill', 'van', 'new apartment', 'furniture'] },
  { id: 'guests', label: 'Family visiting', terms: ['guests', 'family', 'visitors', 'visiting', 'extra bed', 'mattress', 'cot', 'stroller', 'chairs', 'high chair'] },
  { id: 'birthday', label: 'Birthday', terms: ['birthday', 'party', 'celebration', 'speaker', 'lights', 'tables', 'chairs', 'games', 'balloons'] },
  { id: 'boatracing', label: 'Boat racing weekend', terms: ['boat racing', 'boat race', 'boun suang heua', 'festival', 'riverside', 'speaker', 'chairs', 'cooler', 'umbrella', 'shade'] },
  { id: 'beach', label: 'Beach & pool', terms: ['beach', 'pool', 'swimming', 'swim', 'float', 'umbrella', 'cooler', 'snorkel', 'sun'] },
  { id: 'travel', label: 'Travel', terms: ['travel', 'trip', 'luggage', 'suitcase', 'backpack', 'holiday', 'vacation', 'adapter', 'stroller'] },
  { id: 'rainy', label: 'Rainy season', terms: ['rain', 'rainy', 'monsoon', 'umbrella', 'raincoat', 'dehumidifier', 'boots'] },
  { id: 'wfh', label: 'Work from home', terms: ['work', 'office', 'desk', 'monitor', 'screen', 'laptop stand', 'chair', 'projector', 'printer'] },
];

/** Sanitises a stored config/search doc; falls back to the defaults when unusable. */
export function sanitizeGroups(raw: unknown): SearchGroup[] {
  if (!Array.isArray(raw)) return DEFAULT_SEARCH_GROUPS;
  const groups = raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g, i) => ({
      id: typeof g.id === 'string' && g.id ? g.id : `g${i}`,
      label: typeof g.label === 'string' ? g.label.slice(0, 60) : '',
      terms: Array.isArray(g.terms)
        ? [...new Set(g.terms.filter((t): t is string => typeof t === 'string').map(t => t.trim().toLowerCase().slice(0, SEARCH_LIMITS.termLength)).filter(Boolean))]
          .slice(0, SEARCH_LIMITS.termsPerGroup)
        : [],
    }))
    .filter(g => g.terms.length > 0)
    .slice(0, SEARCH_LIMITS.groups);
  return groups.length > 0 ? groups : DEFAULT_SEARCH_GROUPS;
}
