import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import type { Product } from '@/lib/mockData';

/**
 * Product photo (or its icon on light grey) — square with radius, or a circle. `fill`
 * stretches it to its parent (size then only scales the fallback icon).
 */
export function ProductThumb({ product, size, radius, fill }: { product: Product; size: number; radius?: number; fill?: boolean }) {
  const r = radius ?? size / 2;
  const uri = product.images?.[0];
  return (
    <View style={[s.box, fill ? { width: '100%', height: '100%', borderRadius: r } : { width: size, height: size, borderRadius: r }]}>
      {uri
        ? <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        : <Feather name={(product.iconName || 'package') as never} size={Math.round(size * 0.42)} color={SHADES.carbonFaint} />}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
