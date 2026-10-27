import { useEffect, useMemo, useState } from 'react';
import { buildSearchIndex, searchProducts, isBestMatch, type SearchResult } from '@/lib/search';
import { useSearchGroups } from '@/lib/searchConfig';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { getPublishedCollections, type CollectionDoc } from '@/lib/collections';
import { CATEGORIES, type Product } from '@/lib/mockData';

export const SEARCH_DEBOUNCE_MS = 200;

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Published collections, shared cache with the Home (collection titles feed the search). */
export function usePublishedCollections(): CollectionDoc[] {
  const [cols, setCols] = useState<CollectionDoc[]>([]);
  useEffect(() => {
    let alive = true;
    cached('collections:published', HOME_TTL.config, getPublishedCollections)
      .then(c => { if (alive) setCols(c); }, () => {});
    return () => { alive = false; };
  }, []);
  return cols;
}

export interface ProductSearch {
  /** False when the (debounced) query is empty — show the normal list. */
  active: boolean;
  query: string;
  /** Matching products, best first (≥ MIN_SEARCH_SCORE). */
  results: SearchResult<Product>[];
  scoreById: Map<string, number>;
  collections: CollectionDoc[];
}

// The ONE search hook (Explore, Liked): debounced query → lib/search.ts on the loaded
// product list. Index rebuilt only when products / vocabulary / collections change.
export function useProductSearch(products: Product[], rawQuery: string): ProductSearch {
  const query = useDebouncedValue(rawQuery.trim(), SEARCH_DEBOUNCE_MS);
  const groups = useSearchGroups();
  const collections = usePublishedCollections();
  const index = useMemo(
    () => buildSearchIndex(products, {
      groups,
      categories: CATEGORIES.filter(c => c.id !== 'all'),
      collections: collections.map(c => ({ title: c.title, productIds: c.productIds })),
    }),
    [products, groups, collections],
  );
  return useMemo(() => {
    const results = query ? searchProducts(index, query) : [];
    return {
      active: !!query,
      query,
      results,
      scoreById: new Map(results.map(r => [r.product.id, r.score])),
      collections,
    };
  }, [index, query, collections]);
}

/** Id of the product that gets the "Best match" chip in an ordered result list, or null. */
export function bestMatchId(ordered: Product[], scoreById: Map<string, number>): string | null {
  const scored = ordered.map(p => ({ product: p, score: scoreById.get(p.id) ?? 0 }));
  return scored.length > 0 && isBestMatch(scored) ? scored[0].product.id : null;
}
