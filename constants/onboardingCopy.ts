// Onboarding ("living cards", validated mockup) — fixed strings + the DEFAULT slide texts
// (Admin → Onboarding can override titles, sub-lines and sticker texts). In titles,
// [brackets] mark the highlighted words. Sentence case.
export const ONBOARDING_COPY = {
  wordmark: 'LANCHAI',
  skip: 'Skip',
  next: 'Next',
  start: 'Start exploring',
  member: 'Already a member? ',
  signIn: 'Sign in',
  priceChip: (lak: string) => `From ${lak} LAK / day`,
  liked: 'Liked',
} as const;

export interface OnboardingDefaults {
  title: string;
  sub: string;
  stickers: Record<string, string>;
}

export const ONBOARDING_DEFAULT_TEXTS: OnboardingDefaults[] = [
  {
    title: 'Camping trip? Family visiting? [Party at home?]',
    sub: 'Whatever’s coming up, we’ve got the gear.',
    stickers: { chip: 'Used twice a year? Rent it.' },
  },
  {
    title: 'Use it. [Bring it back.] Repeat.',
    sub: 'Pick it up at our shop in Vientiane.',
    stickers: {
      step1: 'Book', step2: 'Pick up', step3: 'Bring back',
      booked: 'Dates picked', place: 'QR scanned · Vientiane shop', points: 'Points earned',
    },
  },
  {
    title: 'Spend less on stuff. [More on weekends.]',
    sub: 'Moments over things you’ll store.',
    stickers: { checked: 'Checked', clean: 'Clean', deposit: 'Deposit back on the spot' },
  },
];

/** Admin labels for the sticker fields of each slide. */
export const ONBOARDING_STICKER_LABELS: Record<string, string>[] = [
  { chip: 'Light-amber chip' },
  {
    step1: 'Card 1 label (number shown in the circle)', step2: 'Card 2 label (carbon)', step3: 'Card 3 label',
    booked: 'Step 1 sticker (carbon)', place: 'Step 2 sticker (light amber)', points: 'Step 3 sticker (yellow)',
  },
  { checked: 'Yellow chip', clean: 'Dark chip', deposit: 'Light-amber chip' },
];

/** Photo slots per slide (slide 1: 2, slide 2: 3, slide 3: 1). */
export const ONBOARDING_PHOTO_SLOTS = [2, 3, 1] as const;
