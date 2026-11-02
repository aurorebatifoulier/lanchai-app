// Guest browsing + auth screens — every string here (validated mockups). Sentence case.
export type GateAction = 'rent' | 'book' | 'save' | 'notify' | 'chat' | 'codes' | 'other';

export const AUTH_COPY = {
  // Guest sheet ("Good taste. Now, who are you?") — the lines follow the action.
  sheet: {
    title: 'Good taste. Now, who are you?',
    lead: (action: GateAction, item?: string) => {
      const it = item ? `the ${item}` : 'it';
      switch (action) {
        case 'rent': case 'book': return `Sign in to rent ${it}.`;
        case 'save': return `Sign in to save ${it}.`;
        case 'notify': return `Sign in to get notified about ${it}.`;
        case 'chat': return 'Sign in to message us.';
        case 'codes': return 'Sign in to use your codes.';
        default: return 'Sign in to continue.';
      }
    },
    after: (action: GateAction) => {
      switch (action) {
        case 'rent': return 'It takes 30 seconds, and we’ll add it to your bag right after.';
        case 'book': return 'It takes 30 seconds, and you’ll pick your dates right after.';
        case 'save': return 'It takes 30 seconds, and we’ll save it right after.';
        case 'notify': return 'It takes 30 seconds, and we’ll keep an eye on it right after.';
        default: return 'It takes 30 seconds.';
      }
    },
    signUpEmail: 'Sign up with email',
    haveAccount: 'Already have an account? ',
    signIn: 'Sign in',
    invite: (pct: number) => `Got an invite code? You’ll get ${pct}% off your first rental.`,
  },
  inviteBanner: (pct: number) => `Sign up with an invite code and get ${pct}% off your first rental.`,
  inviteBannerCta: 'Sign up',
  guest: {
    accountTitle: 'You’re browsing as a guest',
    accountSub: 'Sign in to rent, save favourites and chat with us.',
    signIn: 'Sign in',
    createAccount: 'Create account',
    help: 'Help',
    faq: 'FAQ',
    faqSub: 'Returns, deposits, cancellations',
    whatsapp: 'WhatsApp',
    whatsappSub: 'Message us — quick questions welcome',
    email: 'Email us',
    legal: 'Legal',
    terms: 'Terms of service',
    privacy: 'Privacy policy',
    cancellation: 'Cancellation policy',
    rentalsTitle: 'Your rentals will live here.',
    rentalsSub: 'Sign in to book and keep track of your pick-ups and returns.',
  },
} as const;
