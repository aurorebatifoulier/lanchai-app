import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';

/**
 * The ONE star row for ratings (product page summary, review cards, all reviews, admin
 * reviews). Feather's "star" is outline-only, so colouring it amber still looked empty:
 * filled amber stars for the rating, a half star from .5 (rounded to the nearest half),
 * empty grey outlines for the rest. `rating` is coerced to a number defensively.
 */
export default function Stars({ rating, size = 14, gap = 2 }: { rating: number | string | null | undefined; size?: number; gap?: number }) {
  const r = Math.max(0, Math.min(5, Math.round((Number(rating) || 0) * 2) / 2));
  return (
    <View style={{ flexDirection: 'row', gap }} accessibilityLabel={`${r} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => {
        const name = r >= i ? 'star' : r >= i - 0.5 ? 'star-half-full' : 'star-outline';
        return <MaterialCommunityIcons key={i} name={name} size={size} color={name === 'star-outline' ? SHADES.carbonFaint : SHADES.amber} />;
      })}
    </View>
  );
}
