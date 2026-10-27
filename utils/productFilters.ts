import type { Product } from '@/lib/mockData';
import { Filters, SortOption, PRICE_CONFIG } from '@/lib/filterConfig';
import { toLak } from './currency';

export interface ProductFilterContext {
  // 'all' or omitted = no category restriction (the caller may have already
  // scoped the list server-side, e.g. app/category/[id].tsx's getProductsByCategory).
  category?: string;
  searchQuery?: string;
  exchangeRate?: number | null;
  // For matching a search query against a category's display name, not just the
  // product name. Omit when the caller has no search UI (e.g. the category screen).
  categories?: readonly { id: string; name: string }[];
}

// Extracted verbatim from app/(tabs)/explore.tsx's filteredProducts useMemo so
// app/category/[id].tsx (and any future screen) can apply the exact same matching
// rules instead of a second, divergent implementation. Same filter order, same
// field semantics (e.g. `availableOnly` reads the manual `product.available` toggle,
// matching Explore's own definition — not effectiveStock()).
export function filterProducts(
  products: Product[],
  filters: Filters,
  context: ProductFilterContext = {},
): Product[] {
  // Text search is lib/search.ts (useProductSearch) — not here.
  const { category, exchangeRate } = context;
  let list = [...products];

  if (category && category !== 'all') list = list.filter(p => p.category === category);
  if (filters.availableOnly) list = list.filter(p => p.available);

  // Price range (always on pricePerDay = 1–2 day base rate). PRICE_CONFIG /
  // filters.priceMin/Max are LAK-denominated (the filter UI), while pricePerDay is
  // USD — convert before comparing. Skipped while the rate hasn't loaded yet.
  if (exchangeRate != null) {
    if (filters.priceMin > PRICE_CONFIG.min) {
      list = list.filter(p => toLak(p.pricePerDay, exchangeRate) >= filters.priceMin);
    }
    if (filters.priceMax < PRICE_CONFIG.max) {
      list = list.filter(p => toLak(p.pricePerDay, exchangeRate) <= filters.priceMax);
    }
  }

  if (filters.minRating > 0) {
    list = list.filter(p => p.averageRating != null && p.averageRating >= filters.minRating);
  }

  return list;
}

// Extracted verbatim from the same useMemo's sort switch — same 4 cases, same
// comparators. Always returns a new array (clones internally), so it's safe to call
// on a caller's stored state array without mutating it in place.
export function sortProducts(products: Product[], sort: SortOption): Product[] {
  const list = [...products];
  switch (sort) {
    case 'popular':
      list.sort((a, b) => (b.bookingsCount ?? b.rentalCount ?? 0) - (a.bookingsCount ?? a.rentalCount ?? 0));
      break;
    case 'price-asc':
      list.sort((a, b) => a.pricePerDay - b.pricePerDay);
      break;
    case 'price-desc':
      list.sort((a, b) => b.pricePerDay - a.pricePerDay);
      break;
    case 'newest':
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      break;
  }
  return list;
}

// "Best rated" has no equivalent in the shared SortOption enum — Explore's own
// FilterSheet doesn't expose a rating-based sort option, and adding one to
// SortOption/SORT_LABELS would make it appear as a new, unrequested chip there (since
// FilterSheet renders one chip per SORT_LABELS entry). Kept as its own small helper
// instead, used only by screens (like the category screen) that need it directly —
// zero behavior change to Explore.
export function sortProductsByRating(products: Product[]): Product[] {
  const list = [...products];
  list.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
  return list;
}
