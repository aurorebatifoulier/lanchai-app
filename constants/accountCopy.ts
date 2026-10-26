// ALL the playful My Account strings in one place — edit freely. (Loyalty card lines
// live in constants/loyaltyCopy.ts.) Sentence case, English.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ACCOUNT_COPY = {
  // ── Header greeting (Vientiane time) ──
  greeting: (hour: number) =>
    hour >= 5 && hour < 12 ? 'Good morning,'
      : hour >= 12 && hour < 18 ? 'Good afternoon,'
        : hour >= 18 && hour < 22 ? 'Good evening,'
          : 'Up late,',
  name: (firstName: string) => `${firstName}.`,
  businessChip: 'Business',

  // ── Stats ──
  roundTrips: (n: number) => plural(n, 'round trip', 'round trips'),
  notInCloset: (n: number) => plural(n, 'thing not in your closet', 'things not in your closet'),
  notSpent: 'LAK not spent on stuff',
  firstRentalTitle: 'Your first rental is waiting.',
  firstRentalSub: 'Rent it, use it, bring it back — no clutter.',
  firstRentalCta: 'Browse',

  // ── Stickers (one per category rented at least once) ──
  stickersTitle: 'Your stickers',
  stickerNames: {
    outdoor: 'Weekend camper',
    tools: 'DIY hero',
    fun: 'Party starter',
    sports: 'Game on',
    kids: 'Super parent',
    home: 'Home hero',
  } as Record<string, string>,
  stickerLocked: (category: string) => `Rent ${category.toLowerCase()} to unlock`,

  // ── Resident promo card ──
  promoTitle: 'Live in Laos?',
  promoSub: (pct: number) => `Pay a ${pct}% lower deposit. Verify once.`,
};
