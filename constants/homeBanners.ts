// Home hero marketing banners (components/home/HeroCarousel.tsx) — ONE place to reorder or
// edit them. Shown when no Admin → Home slide is published for the hero placement (a
// published admin hero slide always wins). Every CTA opens through openAppRoute
// (lib/navigation.ts): `/category/{id}` → Explore with that category, `/explore?…` gets a
// fresh `t` token so Explore re-applies it (`q`, `ask=1`) even when already mounted.
// Photos are composed with an empty zone for the text: no overlay, no gradient.
// "\n" in a subtitle = forced line break.

export type HomeBanner = {
  id: string;
  /** 'light' = text centred-left on a bright photo; 'dark' = text bottom-left on a dark photo. */
  variant: 'light' | 'dark';
  image: number;
  /** expo-image contentPosition. */
  focalPoint: { top: string; left: string };
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  accessibilityLabel: string;
};

export const HOME_BANNERS: HomeBanner[] = [
  {
    id: 'manifesto',
    variant: 'light',
    image: require('@/assets/images/banners/banner-1-manifesto.jpg'),
    focalPoint: { top: '0%', left: '50%' },
    eyebrow: 'Rentals in Vientiane',
    title: 'Rent. Return. Repeat.',
    subtitle: "Why buy it when you'll use it twice?",
    ctaLabel: 'Explore the catalogue',
    ctaHref: '/explore',
    accessibilityLabel: 'Rent. Return. Repeat. Explore the catalogue',
  },
  {
    id: 'how-it-works',
    variant: 'light',
    image: require('@/assets/images/banners/banner-3-how-it-works.jpg'),
    focalPoint: { top: '30%', left: '50%' },
    eyebrow: 'How it works',
    title: 'Book in 2 minutes. Pick up in store.',
    subtitle: 'No online payment.\nPay at the shop, cash or QR.',
    ctaLabel: 'See how it works',
    ctaHref: '/profile/faq',
    accessibilityLabel: 'Book in 2 minutes. Pick up in store. See how it works',
  },
  {
    id: 'weekend',
    variant: 'dark',
    image: require('@/assets/images/banners/banner-5-weekend.jpg'),
    focalPoint: { top: '62%', left: '50%' },
    eyebrow: 'Weekend escape',
    title: "Weekend plans? We've got the gear.",
    subtitle: 'Pack light. Rent the rest.',
    ctaLabel: 'Browse outdoor gear',
    ctaHref: '/category/outdoor',
    accessibilityLabel: "Weekend plans? We've got the gear. Browse outdoor gear",
  },
  {
    id: 'party',
    variant: 'dark',
    image: require('@/assets/images/banners/banner-6-party.jpg'),
    focalPoint: { top: '100%', left: '50%' },
    eyebrow: 'Party night',
    title: 'Throwing a party? Skip the shopping.',
    subtitle: 'Sound, light, screen, games. Rented for the night.',
    ctaLabel: 'Browse party gear',
    ctaHref: '/explore?q=party',
    accessibilityLabel: 'Throwing a party? Skip the shopping. Browse party gear',
  },
  {
    id: 'ask-us',
    variant: 'light',
    image: require('@/assets/images/banners/banner-9-ask-us.jpg'),
    focalPoint: { top: '20%', left: '50%' },
    eyebrow: 'Item requests',
    title: "Can't find it? Ask us.",
    subtitle: 'Tell us what you need.\nWe might just get it.',
    ctaLabel: 'Request an item',
    ctaHref: '/explore?ask=1',
    accessibilityLabel: "Can't find it? Ask us. Request an item",
  },
  {
    id: 'new-in-town',
    variant: 'light',
    image: require('@/assets/images/banners/banner-10-new-in-town.jpg'),
    focalPoint: { top: '60%', left: '50%' },
    eyebrow: 'New in town',
    title: "New in Vientiane? Don't buy everything.",
    subtitle: 'Settle in with what you need,\nfor as long as you need it.',
    ctaLabel: 'Start renting',
    ctaHref: '/explore',
    accessibilityLabel: "New in Vientiane? Don't buy everything. Start renting",
  },
];
