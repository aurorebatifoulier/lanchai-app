import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import type { Product } from '@/lib/mockData';
import type { LoyaltyTier } from '@/lib/firestore';
import { getProductAccessState, fmtShortDate } from '@/utils/productAccess';
import type { GridAvailability } from '@/utils/availability';
import ProductSocialProof from '@/components/ProductSocialProof';
import { getMinPrice } from '@/utils/pricing';
import { toLak, formatKip } from '@/utils/currency';
import FavoriteHeart from '@/components/FavoriteHeart';

// Shared 2-column grid product card — Explore (app/(tabs)/explore.tsx) and Liked
// (app/liked.tsx). Home sections and category pages use their own, different cards.

// ── Layout ────────────────────────────────────────────────────────────────────
// Cards keep a fixed height so every row in the 2-column grid lines up, but that
// height is DERIVED from its parts below — never hardcoded — so a font/size change
// can't silently clip the availability badge again. Text-bearing heights scale with
// the OS font size (fontScale), since Android scales fontSize AND lineHeight with it.
const CARD_IMAGE_H     = 150;
const CARD_PAD_TOP     = 10;
const CARD_PAD_BOTTOM  = 12;
const CARD_NAME_LH     = 17; // cardName lineHeight
const CARD_NAME_LINES  = 2;  // title block always reserves exactly 2 lines
const CARD_NAME_GAP    = 4;
const CARD_PRICE_LH    = 16; // cardPrice / cardPriceUnavailable lineHeight
const CARD_PRICE_GAP   = 6; // price → social proof / booking pill
const CARD_BADGE_H     = 22; // slot under the price — always reserved: booking pill, social proof, or empty

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

export default function ProductGridCard({
  product,
  width,
  onPress,
  isFavorite,
  onToggleFavorite,
  exchangeRate,
  userTier,
  availability,
}: {
  product: Product;
  width: number;
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  exchangeRate: number | null;
  userTier: LoyaltyTier | null;
  /** From gridAvailability(); null/undefined = bookable today (show social proof). */
  availability?: GridAvailability;
}) {
  const layout = useProductCardLayout();
  const imageUri = product.images?.[0] ?? null;
  const minPrice = getMinPrice(product);
  const accessState = getProductAccessState(product, userTier);
  const sectionBadge: { label: string; icon?: string; bg: string; text: string } | null =
    accessState.badgeLabel ? {
      label: accessState.badgeLabel,
      bg:    accessState.badgeTone === 'unlocked' ? COLORS.amber : COLORS.carbon,
      text:  accessState.badgeTone === 'unlocked' ? COLORS.carbon : COLORS.white,
    } :
    product.isPremium     ? { label: 'Premium', icon: 'award', bg: COLORS.amber,   text: COLORS.carbon } :
    product.showInNew     ? { label: 'New',                    bg: SHADES.amberLight, text: SHADES.amberDeep } :
    product.showInPopular ? { label: 'Popular',                bg: COLORS.carbon,  text: COLORS.white  } :
    null;

  return (
    <TouchableOpacity style={[s.card, { width, height: layout.card }]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardImageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.cardImage} contentFit="cover" transition={300} />
        ) : (
          <View style={[s.cardImage, s.cardImagePlaceholder]}>
            <Feather name="image" size={28} color={COLORS.softGray} />
          </View>
        )}

        {sectionBadge && (
          <View style={[s.sectionBadge, { backgroundColor: sectionBadge.bg }]}>
            {sectionBadge.icon && (
              <Feather name={sectionBadge.icon as never} size={9} color={sectionBadge.text} />
            )}
            <Text style={[s.sectionBadgeText, { color: sectionBadge.text }]}>
              {sectionBadge.label}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={s.heartBtn}
          onPress={e => { e.stopPropagation(); onToggleFavorite(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.8}
        >
          <FavoriteHeart liked={isFavorite} />
        </TouchableOpacity>
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardName, { height: layout.name }]} numberOfLines={CARD_NAME_LINES}>{product.name}</Text>
        {minPrice != null && exchangeRate != null
          ? <Text style={s.cardPrice} numberOfLines={1}>{formatKip(toLak(minPrice, exchangeRate))} / day</Text>
          : <Text style={s.cardPriceUnavailable} numberOfLines={1}>Price not set</Text>}
        {/* Fixed-height slot right under the price, content top-aligned — any spare
            height ends up at the bottom of the card, never between price and line. */}
        <View style={[s.bottomSlot, { height: layout.badge }]}>
          {availability ? (
            <View style={[s.pill, availability.kind === 'unavailable' && s.pillMuted]}>
              <Text style={[s.pillText, availability.kind === 'unavailable' && s.pillTextMuted]} numberOfLines={1}>
                {availability.kind === 'backOn'
                  ? `Back on ${fmtShortDate(availability.date)}`
                  : availability.kind === 'fullyBooked' ? 'Fully booked' : 'Unavailable'}
              </Text>
            </View>
          ) : (
            <ProductSocialProof product={product} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImageWrap: {
    width: '100%',
    height: CARD_IMAGE_H,
    position: 'relative',
    overflow: 'hidden', // expo-image on Fabric/Android — keep it clipped to its box
    flexShrink: 0,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadge: {
    position: 'absolute',
    bottom: 7,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  sectionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sizes below are the CARD_* constants above — change them there, not here, so
  // productCardLayout() keeps the card tall enough for everything.
  cardBody: {
    paddingHorizontal: 10,
    paddingTop: CARD_PAD_TOP,
    paddingBottom: CARD_PAD_BOTTOM,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
    lineHeight: CARD_NAME_LH,
    marginBottom: CARD_NAME_GAP,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.fg2,
    lineHeight: CARD_PRICE_LH,
    marginBottom: CARD_PRICE_GAP,
  },
  cardPriceUnavailable: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    fontStyle: 'italic',
    lineHeight: CARD_PRICE_LH,
    marginBottom: CARD_PRICE_GAP,
  },
  bottomSlot: {
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  pill: {
    alignSelf: 'flex-start',
    height: '100%',
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillMuted: {
    backgroundColor: COLORS.softGray200,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: 0.2,
  },
  pillTextMuted: {
    color: COLORS.fg3,
  },
});
