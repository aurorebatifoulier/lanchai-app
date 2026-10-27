import { weekdayName, type ShopOpenState } from '@/functions/src/shared/shop';

// Every Home string (validated mockup) — edit here only. Renter-facing, sentence case.
export const HOME_COPY = {
  searchPlaceholder: (firstName: string) =>
    firstName ? `Hi ${firstName}, what do you need today?` : 'What do you need today?',

  nextPickupTitle: 'Your next pick-up',

  directions: 'Directions',
  shopStatus: (st: ShopOpenState): string => {
    switch (st.kind) {
      case 'open': return `Open now · until ${st.until}`;
      case 'opensLater': return `Opens at ${st.at}`;
      case 'closed': {
        const head = st.allDay ? 'Closed today' : 'Closed now';
        if (!st.next) return head;
        const when = st.next.dayOffset === 1 ? 'tomorrow' : weekdayName(st.next.weekday);
        return `${head} · opens ${when} at ${st.next.at}`;
      }
    }
  },

  categoriesTitle: 'Categories',
  collectionsTitle: 'Got plans?',
  newArrivalsTitle: 'New arrivals',
  rentAgainTitle: 'Rent again',
  rentAgainButton: 'Rent again',
  lastRented: (date: string) => `Last rented ${date}`,
  mostRentedTitle: 'Most rented this month',
  mostRentedAllTimeTitle: 'Most rented',

  whyBuyLabel: 'Why buy it?',
  whyBuyCosts: (product: string, retail: string) => `${/^[aeiou]/i.test(product) ? 'An' : 'A'} ${product} costs ${retail} LAK.`,
  whyBuyMine: (times: number, paid: string) =>
    `You rented it ${times === 1 ? 'once' : times === 2 ? 'twice' : `${times} times`} for ${paid} LAK.`,
  whyBuyMineKicker: "And it's not in your closet. Win-win.",
  whyBuyCatalogue: (perDay: string) => `Rent it for ${perDay} LAK a day.`,
  whyBuyCatalogueKicker: 'Use it, return it, keep the space.',

  referralTitle: "Friends don't let friends buy a drill they'll use once.",
  referralSub: (points: number) => `Invite one. You both get ${points} points.`,
  seeAll: 'See all',
  loadError: "Couldn't load products. Check your connection and try again.",

  stepsTitle: 'Rent. Return. Repeat.',
  steps: [
    { title: 'Rent.', text: 'Pick your dates in a minute. Your card can relax.' },
    { title: 'Pick up.', text: 'Show your QR at the shop. Every item checked.' },
    { title: 'Return. Repeat.', text: 'Deposit back on the spot. Then rent again. Obviously.' },
  ],

  // Admin-only (never shown to renters)
  adminPreviewToggle: 'Preview all sections',
  adminPreviewSub: 'Admin only · shows every Home section, with example data when needed.',
  adminNoCollections: 'No published collection yet — Admin › Collections',
  adminPickupExample: 'Example data — no upcoming pick-up on this account.',
  adminRentAgainStats: (returned: number, matched: number) =>
    `${returned} returned rental${returned === 1 ? '' : 's'} · ${matched} product${matched === 1 ? '' : 's'} still in the catalogue`,
  adminPodiumScope: (scope: 'month' | 'allTime') =>
    scope === 'month' ? 'Podium: returns this month.' : 'Podium: all-time rentals (fewer than 3 products rented this month).',
  adminWhyBuyMine: 'Returning renter version:',
  adminWhyBuyCatalogue: 'New renter version:',
  adminDraftsIncluded: 'Drafts and out-of-date collections included.',

  collectionEmpty: 'Nothing here yet — check back soon.',
  collectionUnavailable: 'This collection is not available.',
} as const;

// Seed drafts for Admin → Collections ("Create example drafts"): no products, unpublished.
export const COLLECTION_SEEDS: { title: string; subtitle: string; icon: string; shade: string }[] = [
  { title: 'Weekend by the river', subtitle: 'Tent, cooler, speaker. Sunset not included.', icon: 'tent', shade: 'amberLight' },
  { title: 'Family visiting?', subtitle: 'Cot, stroller, extra chairs.', icon: 'baby-carriage', shade: 'carbon' },
  { title: 'Moving day', subtitle: 'Drill, ladder, trolley. Friends sold separately.', icon: 'truck-outline', shade: 'amberMid' },
  { title: 'Party at home', subtitle: 'Speakers, lights, chairs. The neighbours will cope.', icon: 'party-popper', shade: 'carbonLight' },
];
