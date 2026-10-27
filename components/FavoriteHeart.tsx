import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';

// The ONE favourite heart (every product card + product detail): carbon outline, filled
// amber when liked — never red (red is reserved for small stock / error signals).
export default function FavoriteHeart({ liked, size = 15 }: { liked: boolean; size?: number }) {
  return <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? SHADES.amber : SHADES.carbon} />;
}
