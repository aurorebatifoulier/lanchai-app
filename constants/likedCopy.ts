// Liked — every string. Edit here only. Sentence case.
export const LIKED_COPY = {
  title: 'Liked',
  items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  search: 'Search your favourites',
  recent: 'Recently viewed',
} as const;
