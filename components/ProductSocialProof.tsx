import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

// Social proof shown on product cards (Home sections + Explore/Liked grid). Below the
// thresholds it renders NOTHING — a single low review or a first rental is never
// promoted; the "New" image badge covers fresh items instead.
export const MIN_REVIEWS_FOR_RATING = 3;
export const MIN_RENTALS_FOR_COUNT  = 3;

export function hasSocialProof(product: { reviewCount?: number; averageRating?: number; rentalCount?: number }): boolean {
  return (product.averageRating != null && (product.reviewCount ?? 0) >= MIN_REVIEWS_FOR_RATING)
    || (product.rentalCount ?? 0) >= MIN_RENTALS_FOR_COUNT;
}

// Visual style matches the original Home card rating (11px amber star, 11px/600 fg2).
// Single line: the rating never shrinks; the rentals text truncates if space is short.
export default function ProductSocialProof({
  product,
}: {
  product: { reviewCount?: number; averageRating?: number; rentalCount?: number };
}) {
  const reviewCount = product.reviewCount ?? 0;
  const rentalCount = product.rentalCount ?? 0;
  const showRating  = product.averageRating != null && reviewCount >= MIN_REVIEWS_FOR_RATING;
  const showRentals = rentalCount >= MIN_RENTALS_FOR_COUNT;
  if (!showRating && !showRentals) return null;

  return (
    <View style={s.row}>
      {showRating && (
        <View style={s.rating}>
          <Feather name="star" size={11} color={COLORS.amber} />
          <Text style={s.text} numberOfLines={1}>
            {product.averageRating!.toFixed(1)} ({reviewCount})
          </Text>
        </View>
      )}
      {showRating && showRentals && <Text style={s.text}>·</Text>}
      {showRentals && (
        <Text style={[s.text, s.rentals]} numberOfLines={1}>
          Rented {rentalCount} times
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  rating:  { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  text:    { fontSize: 11, fontWeight: '600', color: COLORS.fg2 },
  rentals: { flexShrink: 1 },
});
