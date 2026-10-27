import { SHADES } from '@/constants/brandShades';

// The Home's built-in slides: shown when no published Admin → Home slide exists for a
// placement, and recreated as drafts by "Create example drafts". The banner's built-in
// slides live in components/WhyRentSection.tsx (WHY_RENT_SLIDES).
export interface HeroSlide {
  // Local asset from assets/images/. null = placeholder tint shown until photo is added.
  // When ready: replace null with require('@/assets/images/FILENAME.jpg')
  // Recommended size: 1080 × 540 px (2:1 ratio)
  image: number | null;
  tint: string;  // background color shown when image is null or loading
  title: string;
  subtitle: string;
  cta: string;
  route: string;
}

export const HERO_BUILT_IN: HeroSlide[] = [
  {
    image: null, // → assets/images/hero-lifestyle.jpg  (LANCHAI store or rental lifestyle scene)
    tint: SHADES.carbon,
    title: 'Why buy it when\nyou can rent it?',
    subtitle: 'Everything you need. Only when you need it.',
    cta: 'Explore now',
    route: '/explore',
  },
  {
    image: null, // → assets/images/hero-outdoor.jpg   (outdoor / camping gear in nature)
    tint: SHADES.carbonSoft,
    title: 'Planning a weekend\noutdoors?',
    subtitle: 'Rent camping gear instead of buying it.',
    cta: 'Explore camping',
    route: '/category/outdoor',
  },
  {
    image: null, // → assets/images/hero-creator.jpg   (camera / content creation setup)
    tint: SHADES.carbon,
    title: 'Creating content?',
    subtitle: 'Access professional equipment instantly.',
    cta: 'Explore creator gear',
    route: '/explore',
  },
  {
    image: null, // → assets/images/hero-tools.jpg     (power tools / DIY workshop)
    tint: SHADES.carbonSoft,
    title: 'Working on a\nDIY project?',
    subtitle: 'Rent tools and get the job done.',
    cta: 'Explore tools',
    route: '/category/tools',
  },
];

