// Every bag string (validated mockup) — edit here only. Sentence case.
export const BAG_COPY = {
  title: 'Your bag',
  itemsChip: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  sameDates: 'Same dates for everything',

  setDates: 'Set dates',
  edit: 'Edit',
  returnPrefix: '→ ',
  remove: {
    ask: (name: string) => `Remove ${name} from your bag?`,
    confirm: 'Remove',
    keep: 'Keep',
  },

  // Honest signal under an item — one line, only when relevant.
  signal: {
    lastOne: 'Only 1 left on these dates.',
    conflict: 'Not available on these dates — ',
    conflictLink: 'change them',
    unpriced: "No price yet — this item can't be booked.",
  },

  addMore: 'Add more items',

  total: 'Your total',
  rental: (n: number) => `Rental · ${n} ${n === 1 ? 'item' : 'items'}`,
  toPay: 'To pay at pick-up',
  deposit: 'Refundable deposit',
  note: 'Given back at return. Coupons and points on the next step.',
  needDates: (n: number) => `${n} ${n === 1 ? 'item needs' : 'items need'} dates before you continue.`,

  barSub: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} · pay at pick-up`,
  continue: 'Continue',
  setDatesToContinue: 'Set dates to continue',

  empty: {
    title: 'Your bag is empty.',
    sub: 'Your closet is relieved.',
    cta: 'Explore',
  },
} as const;
