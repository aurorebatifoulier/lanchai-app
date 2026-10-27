// Every Explore / quick-add string (validated mockups) — edit here only. Sentence case.
export const EXPLORE_COPY = {
  title: 'Explore',
  oneLiners: [
    "Everything you'll never have to store.",
    'Rent the drill. Skip the drawer.',
    'Your closet called. It says thanks.',
  ],
  searchPlaceholder: 'Tent, drill, party…',
  allCategory: 'All',

  chips: { weekend: 'Free this weekend', under: (x: string) => `Under ${x}`, newItems: 'New', popular: 'Popular' },
  bestMatchSort: 'Best match',

  // Card signal line — real data only, first applicable.
  signal: {
    backOn: (d: string) => `Back on ${d}`,
    fullyBooked: 'Fully booked',
    unavailable: 'Not available right now',
    lastOneWeekend: 'Only 1 left this weekend',
    rentedThisMonth: (n: number) => `Rented ${n}× this month`,
    rentalsWord: (n: number) => (n === 1 ? ' rental' : ' rentals'),
  },

  ask: { title: "Can't find it? Ask us.", sub: 'Tell us what you need. We might just get it.' },

  quickAdd: {
    when: 'When do you need it?',
    weekend: (dates: string) => `This weekend · ${dates}`,
    tomorrow: 'Tomorrow',
    pickDates: 'Pick dates',
    notFreeWeekend: 'Not free this weekend',
    notFreeTomorrow: 'Not free tomorrow',
    notFreeDates: 'Not free on these dates',
    pickup: 'Pick-up',
    return: 'Return',
    days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    add: 'Add to bag',
    payLater: 'Nothing to pay now. Pay at pick-up.',
    added: 'Added to your bag',
    viewBag: 'View bag',
    error: "Couldn't add it to your bag. Please try again.",
    chooseDates: 'Choose your dates in the calendar.',
  },

  surprise: {
    collectionsLabel: 'Got plans?',
    reviewBy: (name: string, product: string) => `${name} · rented the ${product.toLowerCase()}`,
    residentTitle: (pct: number) => `Residents pay a ${pct}% lower deposit`,
    residentSub: 'Living in Laos? Verify your residency once.',
    loyaltyTitle: (line: string) => line,
    loyaltySub: 'Every rental brings you closer.',
  },
} as const;
