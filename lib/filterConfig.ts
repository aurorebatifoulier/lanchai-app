export type SortOption = 'popular' | 'newest' | 'price-asc' | 'price-desc';
export type MinRating  = 0 | 2 | 3 | 4;

export interface Filters {
  priceMin:      number;
  priceMax:      number;
  sort:          SortOption;
  minRating:     MinRating;
  availableOnly: boolean;
}

export const PRICE_CONFIG = { min: 0, max: 10_000_000, step: 50_000 } as const;

export const SORT_LABELS: Record<SortOption, string> = {
  popular:      'Popular',
  newest:       'Most recent',
  'price-asc':  'Price: low',
  'price-desc': 'Price: high',
};

export const DEFAULT_FILTERS: Filters = {
  priceMin:      PRICE_CONFIG.min,
  priceMax:      PRICE_CONFIG.max,
  sort:          'popular',
  minRating:     0,
  availableOnly: false,
};
