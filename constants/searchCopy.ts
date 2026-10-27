// Search strings (Explore, Liked) — edit here only.
export const SEARCH_COPY = {
  bestMatch: 'Best match',
  noResults: (q: string) => `Nothing for “${q}” yet.`,
  noResultsSub: 'Try another word, or browse:',
  categoriesLabel: 'Categories',
  collectionsLabel: 'Got plans?',
  matchPercent: (n: number) => `${n}%`,
} as const;
