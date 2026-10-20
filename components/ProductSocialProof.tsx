import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

// Social proof line shown directly under the price on product cards (Home sections +
// Explore/Liked grid). Below the thresholds it renders NOTHING — a single low review
// or a first rental is never promoted; the "New" image badge covers fresh items.
export const MIN_REVIEWS_FOR_RATING = 3;
export const MIN_RENTALS_FOR_COUNT  = 3;

/** Line height of this component — product cards reserve exactly this much for it. */
export const SOCIAL_PROOF_LINE_H = 16;

type SocialProofProduct = { reviewCount?: number; averageRating?: number; rentalCount?: number };

export function hasSocialProof(product: SocialProofProduct): boolean {
  return (product.averageRating != null && (product.reviewCount ?? 0) >= MIN_REVIEWS_FOR_RATING)
    || (product.rentalCount ?? 0) >= MIN_RENTALS_FOR_COUNT;
}

// "★ 4.8 (12 rented)" · "★ 4.8" · "⟳ 7 rentals" · nothing. 12px, matching the price line.
export default function ProductSocialProof({ product }: { product: SocialProofProduct }) {
  const rentalCount = product.rentalCount ?? 0;
  const showRating  = product.averageRating != null && (product.reviewCount ?? 0) >= MIN_REVIEWS_FOR_RATING;
  const showRentals = rentalCount >= MIN_RENTALS_FOR_COUNT;
  if (!showRating && !showRentals) return null;

  if (!showRating) {
    // Same grammar as the rated line: amber icon + bold number + secondary word.
    return (
      <View style={s.row}>
        <Feather name="repeat" size={12} color={COLORS.amber} />
        <Text style={s.line} numberOfLines={1}>
          <Text style={s.rating}>{rentalCount}</Text>
          <Text style={s.secondary}> rentals</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <Feather name="star" size={12} color={COLORS.amber} />
      <Text style={s.line} numberOfLines={1}>
        <Text style={s.rating}>{product.averageRating!.toFixed(1)}</Text>
        {showRentals && <Text style={s.secondary}> ({rentalCount} rented)</Text>}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  line:      { flexShrink: 1, fontSize: 12, lineHeight: SOCIAL_PROOF_LINE_H },
  rating:    { fontSize: 12, fontWeight: '700', color: COLORS.carbon },
  secondary: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: SOCIAL_PROOF_LINE_H },
});
