// ALL the playful loyalty / referral strings in one place — edit freely. Placeholders
// are function parameters ({n} points, {tier} name, {k} rentals, {pts} earned…).
// Sentence case, English. Never mention internal rules (grace period etc.).

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const LOYALTY_COPY = {
  // ── My Account loyalty card ──
  memberLabel: 'LANCHAI member',
  points: (n: number) => `${n.toLocaleString('en-US')} pts`,
  pointsToNext: (n: number, tier: string) => `${plural(n, 'point')} to ${tier}.`,
  justStarted: 'Everyone starts somewhere. Even tents.',
  middle: (k: number) => `About ${k} more ${k === 1 ? 'trip' : 'trips'}. Your closet will thank you.`,
  almostReview: (n: number) => `${plural(n, 'point')} to go. One review would do it. Hint, hint.`,
  almostRental: 'One more trip. Your closet is already celebrating.',
  topTier: 'Top tier. You now own nothing and rent everything.',

  // ── Tier-up celebration ──
  tierUpTitle: (tier: string) => `Hello, ${tier}.`,
  tierUpBody: 'You rented your way up.\nYour storage space thanks you.',
  tierUpUnlocked: 'Unlocked',
  tierUpCoupon: (pct: number) => `${pct}% coupon`,
  tierUpCta: 'Use it on my next rental',
  tierUpLater: 'Maybe later',

  // ── Booking reminder (summary + bag checkout) ──
  bookingNormal: (pts: number, tier: string, n: number) => ({ bold: `+${pts} points.`, rest: ` ${tier} is getting nervous: ${n} to go.` }),
  bookingCrossing: (pts: number, tier: string) => ({ bold: `+${pts} points`, rest: ` — that's ${tier}. Confetti incoming.` }),
  bookingTop: (pts: number) => ({ bold: `+${pts} points.`, rest: ' Still the top. Obviously.' }),

  // ── Referral ──
  referralTitle: 'Friends don’t let friends buy a drill they’ll use once.',
  referralSub: (n: number) => `Invite a friend. You both get ${n} points after their first rental.`,
  referralShare: 'Share my invite link',
  referralYourCode: (code: string) => `Your code: ${code}`,
  referralShareMessage: (code: string, n: number) =>
    `Rent instead of buying in Vientiane with LANCHAI. Sign up with my invite code ${code} and we both get ${n} points after your first rental.`,
  referralCredited: (n: number) => `Your friend's first rental is done: +${n} points`,
};
