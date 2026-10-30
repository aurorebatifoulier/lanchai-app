import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import type { Product } from '@/lib/mockData';
import type { LoyaltyTier } from '@/lib/firestore';
import { getProductAccessState } from '@/utils/productAccess';
import type { GridAvailability } from '@/utils/availability';
import { getMinPrice } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { UI } from '@/components/account/ui';
import { productSignal } from '@/lib/productSignal';
import { FavoriteButton } from '@/components/FavoriteHeart';
import PressScale from '@/components/PressScale';
import QuickAddButton, { type QuickAddState } from '@/components/QuickAddButton';
import { SEARCH_COPY } from '@/constants/searchCopy';
import SignalLine from '@/components/SignalLine';

// Shared 2-column grid product card — Explore and Liked (category pages use their own).
// My Account / Home language (validated mockup): white, radius 18, thin border, heart in a
// white circle, name, "126,000 LAK / day", then ONE honest signal line (lib/productSignal).

// ── Layout ────────────────────────────────────────────────────────────────────
// Cards keep a fixed height so every row in the 2-column grid lines up, but that
// height is DERIVED from its parts below — never hardcoded. Text-bearing heights scale
// with the OS font size (fontScale), since Android scales fontSize AND lineHeight with it.
const CARD_IMAGE_H     = 140;
const CARD_PAD_TOP     = 12;
const CARD_PAD_BOTTOM  = 14;
const CARD_NAME_LH     = 19; // cardName lineHeight
const CARD_NAME_LINES  = 2;  // title block always reserves exactly 2 lines
const CARD_NAME_GAP    = 2;
const CARD_PRICE_LH    = 18;
const CARD_PRICE_GAP   = 4;
const CARD_BADGE_H     = 18; // signal line slot — always reserved

/** Height of the optional footer row (Liked "Notify me"). */
const FOOTER_H = 46;

export function productCardLayout(fontScale: number) {
  const scale  = Math.max(1, fontScale);
  const name   = Math.ceil(CARD_NAME_LH * CARD_NAME_LINES * scale);
  const price  = Math.ceil(CARD_PRICE_LH * scale);
  const badge  = Math.ceil(CARD_BADGE_H * scale);
  const card   = CARD_IMAGE_H + CARD_PAD_TOP + name + CARD_NAME_GAP + price + CARD_PRICE_GAP + badge + CARD_PAD_BOTTOM;
  return { card, name, badge };
}

/** Card layout for the current OS font size — also used for loading skeletons. */
export function useProductCardLayout() {
  const { fontScale } = useWindowDimensions();
  return productCardLayout(fontScale);
}

// ── Component ─────────────────────────────────────────────────────────────────

function ProductGridCard({
  product,
  width,
  onPress,
  isFavorite,
  onToggleFavorite,
  exchangeRate,
  userTier,
  availability,
  weekendUnits = null,
  bestMatch = false,
  matchPercent = null,
  quickAdd = null,
  onQuickAdd,
  footer,
  reserveFooter = false,
}: {
  product: Product;
  width: number;
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  exchangeRate: number | null;
  userTier: LoyaltyTier | null;
  /** From gridAvailability(); null/undefined = bookable today. */
  availability?: GridAvailability;
  /** Units free in the active "Free this weekend" window (null = chip off). */
  weekendUnits?: number | null;
  /** Search: "Best match" chip (renters and admins). */
  bestMatch?: boolean;
  /** Search score shown to ADMINS only (null = hidden) — to tune keywords. */
  matchPercent?: number | null;
  /** Quick-add "+" state (bottom-right); null = no button (e.g. tier-locked). */
  quickAdd?: QuickAddState | null;
  onQuickAdd?: () => void;
  /** Extra row under the signal (Liked: "Notify me") — the card grows by FOOTER_H.
   *  `reserveFooter` (unused today) would give a card without one the same height. */
  footer?: React.ReactNode;
  footerKey?: string;
  reserveFooter?: boolean;
}) {
  const layout = useProductCardLayout();
  const imageUri = product.images?.[0] ?? null;
  const minPrice = getMinPrice(product);
  const accessState = getProductAccessState(product, userTier);
  const sectionBadge: { label: string; icon?: string; bg: string; text: string } | null =
    accessState.badgeLabel ? {
      label: accessState.badgeLabel,
      icon:  accessState.locked ? 'lock' : undefined,
      bg:    accessState.badgeTone === 'unlocked' ? SHADES.amber : SHADES.carbon,
      text:  accessState.badgeTone === 'unlocked' ? SHADES.carbon : SHADES.cream,
    } :
    product.isPremium     ? { label: 'Premium', icon: 'award', bg: SHADES.amber, text: SHADES.carbon } :
    product.showInNew     ? { label: 'New', bg: SHADES.amberLight, text: SHADES.amberDeep } :
    null;
  const signal = productSignal(product, { availability, weekendUnits });

  return (
    <PressScale style={[UI.card, s.card, { width, height: layout.card + (footer || reserveFooter ? FOOTER_H : 0) }]} onPress={onPress}>
      <View style={s.cardImageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.cardImage} contentFit="cover" transition={300} />
        ) : (
          <View style={[s.cardImage, s.cardImagePlaceholder]}>
            <Feather name={(product.iconName || 'package') as never} size={34} color={SHADES.carbonFaint} />
          </View>
        )}

        {(bestMatch || matchPercent != null) && (
          <View style={s.searchChips}>
            {bestMatch && <View style={s.bestChip}><Text style={s.bestText}>{SEARCH_COPY.bestMatch}</Text></View>}
            {matchPercent != null && <View style={s.pctChip}><Text style={s.pctText}>{SEARCH_COPY.matchPercent(matchPercent)}</Text></View>}
          </View>
        )}

        {sectionBadge && (
          <View style={[s.sectionBadge, { backgroundColor: sectionBadge.bg }]}>
            {sectionBadge.icon && <Feather name={sectionBadge.icon as never} size={10} color={sectionBadge.text} />}
            <Text style={[s.sectionBadgeText, { color: sectionBadge.text }]}>{sectionBadge.label}</Text>
          </View>
        )}

        <FavoriteButton liked={isFavorite} onPress={onToggleFavorite} />
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardName, { height: layout.name }]} numberOfLines={CARD_NAME_LINES}>{product.name}</Text>
        {minPrice != null && exchangeRate != null ? (
          <Text style={s.cardPrice} numberOfLines={1}>{`${toLak(minPrice, exchangeRate).toLocaleString('en-US')} LAK / day`}</Text>
        ) : <Text style={s.cardPriceUnavailable} numberOfLines={1}>Price not set</Text>}
        <View style={[s.signalSlot, { height: layout.badge }, quickAdd ? s.withQuickAdd : undefined]}>
          <SignalLine signal={signal} />
        </View>
        {quickAdd && onQuickAdd && <View style={s.quickAdd}><QuickAddButton state={quickAdd} onPress={onQuickAdd} /></View>}
        {!!footer && <View style={s.footer}>{footer}</View>}
      </View>
    </PressScale>
  );
}

const s = StyleSheet.create({
  searchChips: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4, zIndex: 1 },
  bestChip: { backgroundColor: SHADES.amber, borderRadius: 6, paddingHorizontal: 7, height: 20, justifyContent: 'center' },
  bestText: { fontSize: 10, fontWeight: '800', color: SHADES.carbon },
  pctChip: { backgroundColor: SHADES.carbon, borderRadius: 6, paddingHorizontal: 6, height: 20, justifyContent: 'center' },
  pctText: { fontSize: 10, fontWeight: '800', color: SHADES.cream },
  card: { overflow: 'hidden' },
  cardImageWrap: {
    width: '100%', height: CARD_IMAGE_H, position: 'relative',
    overflow: 'hidden', // expo-image on Fabric/Android — keep it clipped to its box
    flexShrink: 0,
  },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center' },
  sectionBadge: {
    position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
    height: 20, paddingHorizontal: 7, borderRadius: 6,
  },
  sectionBadgeText: { fontSize: 10, fontWeight: '800' },
  // Sizes below are the CARD_* constants above — change them there, not here.
  cardBody: { paddingHorizontal: 12, paddingTop: CARD_PAD_TOP, paddingBottom: CARD_PAD_BOTTOM },
  cardName: {
    fontSize: 15, fontWeight: '700', color: SHADES.carbon, letterSpacing: -0.1,
    lineHeight: CARD_NAME_LH, marginBottom: CARD_NAME_GAP,
  },
  withQuickAdd: { paddingRight: 30 },
  // Price digits in the same grey as "LAK / day" (all product cards).
  cardPrice: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: CARD_PRICE_LH, marginBottom: CARD_PRICE_GAP },
  cardPriceUnavailable: {
    fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, fontStyle: 'italic',
    lineHeight: CARD_PRICE_LH, marginBottom: CARD_PRICE_GAP,
  },
  signalSlot: { justifyContent: 'center', flexShrink: 0 },
  quickAdd: { position: 'absolute', right: 10, bottom: CARD_PAD_BOTTOM },
  footer: { marginTop: 8, height: FOOTER_H - 8 },
});

// Memoised for long lists: re-render only when what the card shows changes. Handlers are
// per-render closures bound to this product's id, so ignoring their identity is safe;
// availability is compared by value (a fresh object each parent render).
const SHOWN_PROPS = ['product', 'width', 'isFavorite', 'exchangeRate', 'userTier', 'weekendUnits', 'bestMatch', 'matchPercent', 'quickAdd', 'footerKey', 'reserveFooter'] as const;
const availKey = (a: GridAvailability | undefined) =>
  !a ? '' : a.kind === 'backOn' ? `b${a.date.getTime()}` : a.kind;
type Props = React.ComponentProps<typeof ProductGridCard>;
export default React.memo(ProductGridCard, (a: Props, b: Props) =>
  SHOWN_PROPS.every(k => a[k] === b[k])
  && availKey(a.availability) === availKey(b.availability));
