// Every "My rentals" tab string (validated mockup) — edit here only. Sentence case.
export const RENTALS_COPY = {
  title: 'My rentals',
  sub: 'Borrowed, not owned. As it should be.',

  tabs: {
    upcoming: (n: number) => `Upcoming · ${n}`,
    active: (n: number) => `Active · ${n}`,
    past: 'Past',
  },
  pastFilters: { returned: 'Returned', cancelled: 'Cancelled', all: 'All' },
  pastCount: (n: number) => `${n} ${n === 1 ? 'rental' : 'rentals'}.`,
  pastCountWit: ' Not a single one in your closet.',

  // Next pick-up (carbon card)
  nextPickup: (when: string) => `Next pick-up · ${when}`,
  today: 'Today',
  tomorrow: 'Tomorrow',
  inDays: (n: number) => `in ${n} days`,
  toPay: (amount: string) => `${amount} to pay`,
  directions: 'Directions',
  addToCalendar: 'Add to calendar',

  // Upcoming cards
  inDaysChip: (n: number) => (n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`),
  toPayAtPickup: (amount: string) => `${amount} to pay at pick-up`,
  items: (n: number) => `${n} items`,
  pickups: (n: number) => `${n} pick-ups`,

  // Active
  dueChip: (n: number) => (n <= 0 ? 'Due back today' : n === 1 ? 'Due back tomorrow' : `Due back in ${n} days`),
  returnLine: (when: string) => `Return ${when}`,
  returns: (n: number) => `${n} returns`,
  extend: 'Extend',
  extendQuestion: 'Can I extend it?',
  lateChip: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} late`,
  lateText: (date: string) => `Was due ${date}. A late fee may apply — our team will confirm.`,
  onMyWay: 'I’m on my way',
  onMyWaySent: 'On my way · sent',
  onMyWayMessage: (product: string) => `I’m on my way to return ${product}`,
  onMyWayError: 'Couldn’t send — try again.',
  messageUs: 'Message us',

  // Past
  returned: 'Returned',
  cancelled: 'Cancelled',
  missedPickup: 'Missed pick-up',
  notReturned: 'Not returned',
  day: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
  nothingCharged: 'nothing charged',
  paid: (amount: string) => `Paid ${amount}`,
  depositRefunded: 'deposit refunded',
  depositChecking: 'deposit being checked',
  charged: (amount: string) => `${amount} charged`,
  balanceDue: 'balance due',
  rentAgain: 'Rent again',
  review: (pts: number | null) => (pts ? `Review · +${pts} pts` : 'Review'),
  youRated: (n: number) => `You rated it ${n}`,

  // Order sheet
  yourOrder: 'Your order',
  orderLabel: (id: string) => `Order ${id}`,
  showQr: 'Show this at pick-up for the whole order',
  cancelOrder: (n: number) => `Cancel ${n === 1 ? '1 item' : `${n} items`}`,
  cancelAsk: 'Free cancellation — nothing is charged before pick-up. You can book again anytime.',
  cancelConfirm: 'Cancel order',
  cancelError: 'Could not cancel. Please try again.',
  cancelledNotifTitle: 'Order cancelled',
  cancelledNotifBody: (n: number) => `Your order (${n} item${n !== 1 ? 's' : ''}) has been cancelled.`,

  empty: {
    upcoming: 'Nothing planned yet. Your weekend called.',
    active: 'Nothing out right now. Your closet is suspiciously tidy.',
    past: 'No rentals yet. Everyone starts somewhere.',
    cta: 'Explore',
  },
  loadError: 'Couldn’t load your rentals — pull to refresh.',
} as const;
