import type { Product } from '@/lib/mockData';
import type { LoyaltyTier } from '@/lib/firestore';
import { TIER_LABELS } from '@/lib/loyalty';
import { accessDecision } from '@/functions/src/shared/productAccess';

export interface ProductAccessState {
  locked: boolean;                          // true → booking must be disabled
  badgeLabel: string | null;                // null → no access badge at all
  badgeTone: 'locked' | 'unlocked' | null;  // styling hook
  message: string | null;                   // explanatory line near the disabled CTA
}

const NOT_RESTRICTED: ProductAccessState = { locked: false, badgeLabel: null, badgeTone: null, message: null };

export function fmtShortDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// Pure function — never touches Firestore. Products are never hidden; this only decides
// the badge/message and whether booking should be disabled for a given viewer.
export function getProductAccessState(
  product: Pick<Product, 'accessMode' | 'minTierRequired' | 'earlyAccessUntil'>,
  userTier: LoyaltyTier | null,
): ProductAccessState {
  // Lock decision shared with the createReservations callable (same rule server-side).
  // An expired early-access window is treated as public even before the scheduled
  // Cloud Function flips accessMode.
  const decision = accessDecision(
    { ...product, earlyAccessUntilMs: product.earlyAccessUntil?.toMillis() ?? null },
    userTier,
  );
  const mode = decision.mode;
  if (mode === 'public' || decision.expired) return NOT_RESTRICTED;

  const minTier   = decision.minTier;
  const meets     = decision.meetsTier;
  const tierLabel = TIER_LABELS[minTier];

  if (mode === 'exclusive') {
    return meets
      ? { locked: false, badgeLabel: `${tierLabel} access`, badgeTone: 'unlocked', message: null }
      : { locked: true, badgeLabel: `${tierLabel} access only`, badgeTone: 'locked',
          message: `This item is reserved for ${tierLabel}+ members.` };
  }

  // earlyAccess, still within the window
  const untilLabel = product.earlyAccessUntil ? fmtShortDate(product.earlyAccessUntil.toDate()) : '';
  return meets
    ? { locked: false, badgeLabel: `Early access · ${tierLabel}`, badgeTone: 'unlocked', message: null }
    : { locked: true, badgeLabel: `Early access — ${tierLabel}+ only until ${untilLabel}`, badgeTone: 'locked',
        message: `This item unlocks for everyone on ${untilLabel}. ${tierLabel}+ members can book it now.` };
}
