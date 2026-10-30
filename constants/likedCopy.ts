// Liked — every string. Edit here only. Sentence case.
export const LIKED_COPY = {
  title: 'Liked',
  items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  search: 'Search your favourites',
  notify: 'Notify me',
  notifying: 'We’ll notify you',
  notifyError: 'Couldn’t save — try again.',
  recent: 'Recently viewed',
} as const;
