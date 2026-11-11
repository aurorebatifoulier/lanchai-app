// Home hero marketing banners (components/home/HeroCarousel.tsx) — ONE place to reorder or
// edit them. Shown when no Admin → Home slide is published for the hero placement (a
// published admin hero slide always wins). Every CTA opens through openAppRoute
// (lib/navigation.ts): `/category/{id}` → Explore with that category, `/explore?…` gets a
// fresh `t` token so Explore re-applies it (`q`, `ask=1`) even when already mounted.
// Photos are composed with an empty zone for the text: no overlay, no gradient.
// `textWidth` = the text zone as a fraction of the card width, from the card's left edge
// (the 20px inset included) — default 0.45 light / 0.58 dark; tune it per banner so the
// text never runs over the photo's subject.

export type HomeBanner = {
  id: string;
  /** 'light' = text centred-left on a bright photo; 'dark' = text bottom-left on a dark photo. */
  variant: 'light' | 'dark';
  image: number;
  /** expo-image contentPosition. */
  focalPoint: { top: string; left: string };
  /** Text zone width, fraction of the card width (default: light 0.45, dark 0.58). */
  textWidth?: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  accessibilityLabel: string;
};

export const DEFAULT_TEXT_WIDTH = { light: 0.45, dark: 0.58 } as const;

export const HOME_BANNERS: HomeBanner[] = [
  {
    id: 'manifesto',
    variant: 'light',
    image: require('@/assets/images/banners/banner-1-manifesto.jpg'),
    focalPoint: { top: '0%', left: '50%' },
    eyebrow: 'Rentals in Vientiane',
    title: "That drill you'll use once?",
    subtitle: 'Yeah, rent it.',
    ctaLabel: 'Explore',
    ctaHref: '/explore',
    accessibilityLabel: "That drill you'll use once? Explore",
  },
  {
    id: 'how-it-works',
    variant: 'light',
    image: require('@/assets/images/banners/banner-3-how-it-works.jpg'),
    focalPoint: { top: '30%', left: '50%' },
    eyebrow: 'How it works',
    title: 'Faster than finding your charger.',
    subtitle: 'Book in 2 min, pay at the shop.',
    ctaLabel: 'How it works',
    ctaHref: '/profile/faq',
    accessibilityLabel: 'Faster than finding your charger. How it works',
  },
  {
    id: 'weekend',
    variant: 'dark',
    image: require('@/assets/images/banners/banner-5-weekend.jpg'),
    focalPoint: { top: '62%', left: '50%' },
    eyebrow: 'Weekend escape',
    title: 'Nature called.',
    subtitle: "Don't buy a tent to answer.",
    ctaLabel: 'Outdoor gear',
    ctaHref: '/category/outdoor',
    accessibilityLabel: 'Nature called. Outdoor gear',
  },
  {
    id: 'party',
    variant: 'dark',
    image: require('@/assets/images/banners/banner-6-party.jpg'),
    focalPoint: { top: '100%', left: '50%' },
    eyebrow: 'Party night',
    title: 'Your neighbours will hate us.',
    subtitle: 'Speakers, lights, projector, games.',
    ctaLabel: 'Party gear',
    ctaHref: '/explore?q=party',
    accessibilityLabel: 'Your neighbours will hate us. Party gear',
  },
  {
    id: 'ask-us',
    variant: 'light',
    image: require('@/assets/images/banners/banner-9-ask-us.jpg'),
    focalPoint: { top: '20%', left: '50%' },
    eyebrow: 'Item requests',
    title: "We don't have it. Yet.",
    subtitle: 'Ask, and we might just get it.',
    ctaLabel: 'Request an item',
    ctaHref: '/explore?ask=1',
    accessibilityLabel: "We don't have it. Yet. Request an item",
  },
  {
    id: 'new-in-town',
    variant: 'light',
    image: require('@/assets/images/banners/banner-10-new-in-town.jpg'),
    focalPoint: { top: '60%', left: '50%' },
    eyebrow: 'New in town',
    title: 'Just moved in?',
    subtitle: 'Rent now. No garage sale later.',
    ctaLabel: 'Start renting',
    ctaHref: '/explore',
    accessibilityLabel: 'Just moved in? Start renting',
  },
];
