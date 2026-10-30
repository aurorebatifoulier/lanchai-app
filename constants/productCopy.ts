// Every product detail string (validated mockup) — edit here only. Sentence case.
export const PRODUCT_COPY = {
  share: (name: string) => `${name} — rent it at LANCHAI, Vientiane`,
  edit: 'Edit',
  counter: (i: number, n: number) => `${i} / ${n}`,

  signal: {
    reviews: (n: number) => `${n} ${n === 1 ? 'review' : 'reviews'}`,
    rentals: (n: number) => ` ${n === 1 ? 'rental' : 'rentals'}`,
    thisMonth: (n: number) => `${n} this month`,
  },

  availability: {
    freeToday: 'Free today',
    backOn: (d: string) => `Back on ${d}`,
    fullyBooked: 'Fully booked',
    unavailable: 'Not available right now',
    seeCalendar: 'See calendar',
    calendarTitle: 'Pick your dates',
    calendarHint: 'Choose a pick-up day, then a return day.',
  },

  perfectFor: 'Perfect for',
  readMore: 'Read more',
  showLess: 'Show less',

  pricing: {
    title: 'The longer, the cheaper',
    sub: 'Price per day, applied automatically.',
    week: 'A full week: ',
    weekUnit: ' LAK.',
    vat: (pct: number) => `Prices include VAT (${pct}%).`,
    notSet: "Pricing for this item hasn't been set yet. Check back soon.",
  },

  whyBuy: {
    label: 'Why buy it?',
    worth: (x: string) => `Worth ${x} LAK new.`,
    weekend: (x: string) => `A weekend costs you ${x} LAK.`,
    kicker: "And it won't live in your closet after.",
  },

  details: {
    title: 'The details',
    whatsIncluded: "What's included",
    basicInfo: 'Basic information',
    techSpecs: 'Technical specifications',
    goodToKnow: 'Good to know',
    usageExamples: 'Usage examples',
  },

  how: {
    title: 'How it works',
    deposit: (x: string) => `${x} LAK refundable deposit`,
    residentLess: (pct: number) => `Residents pay ${pct}% less · `,
    verify: 'Verify',
    depositSub: 'Held, not charged. Back after a quick check.',
    payTitle: 'Nothing to pay online',
    paySub: 'Pay at pick-up. Deposit back on the spot.',
    points: (n: number) => `+${n} points for a weekend`,
    pickup: (street: string) => `Pick up at ${street}`,
    pickupSub: (hours: string, h: number) => `${hours} · ready ${h}h after booking`,
    directions: 'Directions',
  },

  reviews: {
    title: 'Reviews',
    seeAll: (n: number) => `See all (${n})`,
    summary: (n: number) => `${n} ${n === 1 ? 'review' : 'reviews'} · all from real rentals`,
    replied: 'LANCHAI replied',
    screenTitle: 'Reviews',
    loadMore: 'Load more',
    empty: 'No reviews yet.',
  },

  pairs: 'Pairs well with',
  question: { title: 'A question about this item?', sub: 'Real humans in Vientiane. Usually fast.' },
  chatPrefill: (name: string) => `About: ${name}\n`,

  bar: {
    from: 'From',
    perDay: ' / day',
    rent: 'Rent it',
    restricted: 'Access restricted',
    comingSoon: 'Coming soon',
    notForRent: 'Not available for rent yet',
    docRequired: 'Please upload your business registration document before booking.',
    docLink: 'Go to settings',
  },

  notFound: "This item isn't available",
  loadError: "Couldn't load this item",
  loadErrorSub: 'Check your connection and try again.',
  goBack: 'Go back',
  favError: 'Couldn’t save your like — try again.',
} as const;
