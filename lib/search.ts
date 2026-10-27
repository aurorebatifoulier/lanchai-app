// Smarter product search — pure and dependency-free (testable with
// `npm run test:search`). Used by every search entry point (Explore — also fed by the
// Home search —, category pages, Liked), client-side on the already-loaded product list:
// no Firestore read per keystroke.
//
// Matching: normalisation (lowercase, accents removed, punctuation → spaces, a few stop
// words dropped), simple singular/plural stemming, typo tolerance (edit distance with
// transpositions: 1 for words ≥ 4 letters, 2 for ≥ 8), prefix matching on the last word
// while typing, and lexical-field expansion through the search vocabulary
// (lib/searchVocabulary.ts / config/search).
// Scoring: field weight (name > keywords > category > collection titles > description)
// × match kind (direct > prefix > lexical > typo); multi-word queries average their
// words (+ a small bonus when every word matched) → 0–100. Ties → popularity.
import type { SearchGroup } from './searchVocabulary';

export const MIN_SEARCH_SCORE = 30;
export const BEST_MATCH_GAP = 15;

const FIELD = { name: 1, keywords: 0.85, category: 0.6, collection: 0.5, description: 0.3 } as const;
const KIND = { direct: 1, prefix: 0.85, lexical: 0.55, typo: 0.5 } as const;
/** Expansion reached through a TYPO of a vocabulary term counts a bit less ("tnet" → tent > cooler). */
const TYPO_EXPANSION = 0.8;
const ALL_WORDS_BONUS = 1.1;
const PREFIX_MIN = 2;
const STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'my', 'to', 'and', 'with', 'of', 'in', 'on', 'some', 'i', 'need']);

export interface SearchableProduct {
  id: string;
  name: string;
  category: string;
  shortDesc?: string;
  description?: string;
  keywords?: string[];
  perfectFor?: string[];
  usageExamples?: string[];
  rentalCount?: number;
  bookingsCount?: number;
}

export interface SearchContext {
  groups: SearchGroup[];
  categories: { id: string; name: string }[];
  /** Published collections (title + products) — a product in "Boat racing weekend" matches "boat racing". */
  collections?: { title: string; productIds: string[] }[];
}

export interface SearchResult<P> { product: P; score: number }

// ── Text ─────────────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents (Lao script untouched)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** drills → drill, batteries → battery, boxes → box; keeps "glass", short words. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(w => w && !STOP_WORDS.has(w)).map(stem);
}

const phraseOf = (text: string) => tokenize(text).join(' ');

/** Typos allowed for a word of this length. */
export function maxTypos(length: number): number {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0;
}

/** Edit distance ≤ max (insert / delete / substitute / swap of 2 adjacent letters = 1). */
export function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  const n = a.length, m = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[m] <= max;
}

// ── Index ────────────────────────────────────────────────────────────────────

interface Field { weight: number; tokens: string[]; text: string }
export interface SearchIndex<P> { entries: { product: P; fields: Field[] }[]; groups: { phrases: string[] }[] }

/** Build once per product list / vocabulary / collections (memoise it). */
export function buildSearchIndex<P extends SearchableProduct>(products: P[], ctx: SearchContext): SearchIndex<P> {
  const catName = new Map(ctx.categories.map(c => [c.id, c.name]));
  const colTitles = new Map<string, string[]>();
  for (const c of ctx.collections ?? []) {
    for (const id of c.productIds) colTitles.set(id, [...(colTitles.get(id) ?? []), c.title]);
  }
  const field = (weight: number, texts: (string | undefined)[]): Field => {
    const tokens = texts.filter(Boolean).flatMap(t => tokenize(t!));
    return { weight, tokens, text: ` ${tokens.join(' ')} ` };
  };
  return {
    entries: products.map(p => ({
      product: p,
      fields: [
        field(FIELD.name, [p.name]),
        field(FIELD.keywords, p.keywords ?? []),
        field(FIELD.category, [catName.get(p.category) ?? p.category]),
        field(FIELD.collection, colTitles.get(p.id) ?? []),
        field(FIELD.description, [p.shortDesc, p.description, ...(p.perfectFor ?? []), ...(p.usageExamples ?? [])]),
      ].filter(f => f.tokens.length > 0),
    })),
    groups: ctx.groups.map(g => ({ phrases: [...new Set(g.terms.map(phraseOf).filter(Boolean))] })),
  };
}

// ── Query ────────────────────────────────────────────────────────────────────

interface Unit { phrase: string; multi: boolean; last: boolean; expansions: string[]; expansionKind: number }

/** Query → units (vocabulary phrases like "boat racing" stay one unit) + their expansions. */
function parseQuery(query: string, groups: { phrases: string[] }[]): Unit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const multiPhrases = [...new Set(groups.flatMap(g => g.phrases).filter(ph => ph.includes(' ')))]
    .sort((a, b) => b.split(' ').length - a.split(' ').length);
  const raw: string[] = [];
  for (let i = 0; i < tokens.length;) {
    const hit = multiPhrases.find(ph => {
      const w = ph.split(' ');
      return w.every((x, k) => tokens[i + k] === x);
    });
    if (hit) { raw.push(hit); i += hit.split(' ').length; } else { raw.push(tokens[i]); i += 1; }
  }
  const endsWithSpace = /\s$/.test(query);
  return raw.map((phrase, i) => {
    const multi = phrase.includes(' ');
    // A group is triggered by an exact term, or a typo of a single-word term.
    const typos = multi ? 0 : maxTypos(phrase.length);
    const exact = new Set<string>();
    const viaTypo = new Set<string>();
    for (const g of groups) {
      if (g.phrases.includes(phrase)) g.phrases.forEach(t => exact.add(t));
      else if (typos > 0 && g.phrases.some(t => !t.includes(' ') && withinDistance(phrase, t, typos))) g.phrases.forEach(t => viaTypo.add(t));
    }
    exact.delete(phrase);
    const expansions = exact.size > 0 ? [...exact] : [...viaTypo].filter(t => t !== phrase);
    return {
      phrase, multi, last: i === raw.length - 1 && !endsWithSpace, expansions,
      expansionKind: exact.size > 0 ? KIND.lexical : KIND.lexical * TYPO_EXPANSION,
    };
  });
}

function fieldHas(f: Field, phrase: string): boolean {
  return phrase.includes(' ') ? f.text.includes(` ${phrase} `) : f.tokens.includes(phrase);
}

/** Best weighted match (0–1) of one query unit in one product. */
function unitScore(u: Unit, fields: Field[]): number {
  let best = 0;
  const typos = u.multi ? 0 : maxTypos(u.phrase.length);
  for (const f of fields) {
    if (f.weight * KIND.direct <= best) continue; // can't beat the current best
    if (fieldHas(f, u.phrase)) { best = f.weight * KIND.direct; continue; }
    if (u.last && !u.multi && u.phrase.length >= PREFIX_MIN && f.tokens.some(t => t.startsWith(u.phrase))) {
      best = Math.max(best, f.weight * KIND.prefix);
    }
    if (f.weight * u.expansionKind > best && u.expansions.some(e => fieldHas(f, e))) best = Math.max(best, f.weight * u.expansionKind);
    if (typos > 0 && f.weight * KIND.typo > best && f.tokens.some(t => withinDistance(u.phrase, t, typos))) {
      best = Math.max(best, f.weight * KIND.typo);
    }
  }
  return best;
}

const popularity = (p: SearchableProduct) => p.rentalCount ?? p.bookingsCount ?? 0;

/** Scores every product (0–100) and returns those ≥ MIN_SEARCH_SCORE, best first. */
export function searchProducts<P extends SearchableProduct>(index: SearchIndex<P>, query: string): SearchResult<P>[] {
  const units = parseQuery(query, index.groups);
  if (units.length === 0) return index.entries.map(e => ({ product: e.product, score: 100 }));
  const results: SearchResult<P>[] = [];
  for (const e of index.entries) {
    const scores = units.map(u => unitScore(u, e.fields));
    const avg = scores.reduce((a, b) => a + b, 0) / units.length;
    const all = units.length > 1 && scores.every(x => x > 0) ? ALL_WORDS_BONUS : 1;
    const score = Math.round(Math.min(1, avg * all) * 100);
    if (score >= MIN_SEARCH_SCORE) results.push({ product: e.product, score });
  }
  return results.sort((a, b) => b.score - a.score || popularity(b.product) - popularity(a.product));
}

/** "Best match" chip: the top result clearly ahead of the next one. */
export function isBestMatch(results: SearchResult<unknown>[]): boolean {
  if (results.length === 0) return false;
  return results.length === 1 || results[0].score - results[1].score >= BEST_MATCH_GAP;
}

/** Keyword suggestions for a product: meaningful name words + its category group terms. */
export function suggestKeywords(name: string, categoryId: string, groups: SearchGroup[], max = 10): string[] {
  const words = normalize(name).split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  const ALIASES: Record<string, string> = { fun: 'party', tools: 'diy', outdoor: 'camping', kids: 'baby' };
  const group = groups.find(g => g.id === (ALIASES[categoryId] ?? categoryId));
  const out: string[] = [];
  for (const t of [...words, ...(group?.terms ?? [])]) {
    const k = t.trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
