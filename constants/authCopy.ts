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
  signIn: {
    browseFirst: 'Just looking? Browse first',
    lines: [
      'Owning a drill you use twice a year? Bold.',
      'Your closet called. It’s full.',
      'Buy less. Borrow better.',
      'Your garage deserves a break.',
      'Rent the tent. Keep the memories.',
      'Less stuff, more weekends.',
    ],
    google: 'Continue with Google',
    orEmail: 'or with email',
    email: 'Email',
    password: 'Password',
    forgot: 'Forgot password?',
    submit: 'Sign in',
    newHere: 'New here? ',
    create: 'Create an account',
    business: 'Business account? ',
    businessLink: 'Apply here',
    termsPrefix: 'By continuing, you agree to our ',
    terms: 'Terms',
    and: ' and ',
    privacy: 'Privacy policy',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  signUp: {
    stepOf: (n: number) => `${n} of 2`,
    step1Title: 'Let’s make it official.',
    step1Sub: 'Two minutes. No furniture assembly.',
    confirm: 'Confirm password',
    minChars: 'At least 8 characters.',
    match: 'Passwords match',
    noMatch: 'Passwords don’t match yet',
    continue: 'Continue',
    already: 'Already renting with us? ',
    signIn: 'Sign in',
    step2Title: 'Almost there. Who’s renting?',
    step2Sub: 'So the shop knows who to wave at.',
    firstName: 'First name',
    lastName: 'Last name',
    phone: '20 XXXX XXXX',
    phoneHint: 'For pick-up reminders. WhatsApp works too.',
    phoneInvalid: 'Check the number — digits only, without the country code.',
    invite: (pct: number) => `Got an invite code? ${pct}% off`,
    inviteLabel: 'Invite code',
    invitePlaceholder: 'e.g. AURORE-7K2',
    create: 'Create my account',
    countryTitle: 'Country code',
    countrySearch: 'Search a country',
  },
  forgot: {
    title: 'Happens to the best of us.',
    sub: 'We’ll email you a link to set a new password.',
    send: 'Send the link',
    spam: 'Check your spam folder if it doesn’t show up.',
    sent: (email: string) => `If an account exists for ${email}, a reset link is on its way.`,
    invalid: 'Enter a valid email address.',
    rateLimited: 'Too many attempts, please try again later.',
    failed: 'Could not send the reset email. Please try again.',
  },
  errors: {
    invalidEmail: 'That email address looks invalid.',
    wrongCredentials: 'Incorrect email or password.',
    emailInUse: 'An account already exists with this email. Sign in instead.',
    weakPassword: 'Use at least 8 characters.',
    otherProvider: 'This email is already used with another sign-in method. Sign in with your email and password.',
    network: 'No connection. Check your internet and try again.',
    googleSetup: 'Google sign-in isn’t available right now. Please use your email.',
    googlePlayServices: 'Google sign-in needs Google Play services on this phone. Please use your email.',
    generic: 'Something went wrong. Please try again.',
  },
} as const;
