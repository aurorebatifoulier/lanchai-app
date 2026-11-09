import type { Product } from '@/lib/mockData';
import type { SortOption } from '@/lib/filterConfig';
import { inCategory } from '@/functions/src/shared/categories';

export interface ProductFilterContext {
  // 'all' or omitted = no category restriction.
  category?: string;
}

// Explore's catalogue filter: category only (a product shows in EACH of its categories,
// legacy single-category products too). Text search is lib/search.ts, the quick chips
// (Available now, Free this weekend, Under X, New) live in Explore itself. The price /
// rating / available-only filters were removed from Explore (Liked keeps its own sheet).
export function filterProducts(products: Product[], context: ProductFilterContext = {}): Product[] {
  const { category } = context;
  return category && category !== 'all' ? products.filter(p => inCategory(p, category)) : [...products];
}

// Explore's sort menu (Popular, price low → high, high → low, Newest). Always returns a
// new array (clones internally), so it's safe to call on a caller's stored state array.
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

