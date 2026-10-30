// Notifications inbox — every string. Edit here only. Sentence case.
export const NOTIF_COPY = {
  title: 'Notifications',
  markAll: 'Mark all read',
  filters: { all: 'All', rentals: 'Rentals', codes: 'Codes', news: 'News' },
  sections: { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' },
  emptyTitle: 'All quiet.',
  emptySub: 'Your stuff is behaving.',
  swipeHint: 'Swipe left to delete',
  delete: 'Delete',
  deleteError: 'Couldn’t delete — try again.',
} as const;
