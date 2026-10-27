import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { FavoriteButton } from '@/components/FavoriteHeart';
import ProductSocialProof from '@/components/ProductSocialProof';
import type { Product } from '@/lib/mockData';
import type { LoyaltyTier } from '@/lib/firestore';
import { getMinPrice } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { getProductAccessState } from '@/utils/productAccess';
import PressScale from '@/components/PressScale';
import QuickAddButton, { type QuickAddState } from '@/components/QuickAddButton';

// Horizontal-rail product card on the My Account design (Home rails: New arrivals, Rent
// again, Most rented). White card, thin border, radius 18. Shows the access / Premium /
// Popular badge but never "New" — that one stays in Explore (ProductGridCard).
export const RAIL_CARD_WIDTH = 150;

function ProductRailCard({
  product, onPress, exchangeRate, userTier, isFavorite, onToggleFavorite, quickAdd = null, onQuickAdd,
}: {
  product: Product;
  onPress: () => void;
  exchangeRate: number | null;
  userTier: LoyaltyTier | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Quick-add "+" state; null = no button (tier-locked). */
  quickAdd?: QuickAddState | null;
  onQuickAdd?: () => void;
}) {
  const minPrice = getMinPrice(product);
  const access = getProductAccessState(product, userTier);
  const badge: { label: string; icon?: 'award'; dark: boolean } | null =
    access.badgeLabel ? { label: access.badgeLabel, dark: access.badgeTone !== 'unlocked' } :
    product.isPremium ? { label: 'Premium', icon: 'award', dark: false } :
    product.showInPopular ? { label: 'Popular', dark: true } :
    null;
  const image = product.images?.[0];

  return (
    <PressScale style={[UI.card, s.card]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.img}>
        {image
          ? <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
          : <Feather name={(product.iconName || 'package') as never} size={40} color={SHADES.carbonFaint} />}
        <FavoriteButton liked={isFavorite} onPress={onToggleFavorite} />
        {badge && (
          <View style={[s.badge, badge.dark ? s.badgeDark : s.badgeAmber]}>
            {badge.icon && <Feather name={badge.icon} size={9} color={badge.dark ? SHADES.cream : SHADES.carbon} />}
            <Text style={[s.badgeText, badge.dark && { color: SHADES.cream }]}>{badge.label}</Text>
          </View>
        )}
      </View>
      <View style={s.body}>
        <Text style={s.name} numberOfLines={2}>{product.name}</Text>
        <View style={quickAdd && onQuickAdd ? s.withQuickAdd : undefined}>
          {minPrice != null && exchangeRate != null
            ? <Text style={s.price}>{toLak(minPrice, exchangeRate).toLocaleString('en-US')} LAK / day</Text>
            : <Text style={[s.price, s.priceMissing]}>Price not set</Text>}
          <ProductSocialProof product={product} />
        </View>
        {quickAdd && onQuickAdd && <View style={s.quickAdd}><QuickAddButton state={quickAdd} onPress={onQuickAdd} size={32} /></View>}
      </View>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { width: RAIL_CARD_WIDTH, overflow: 'hidden' },
  img: { height: 112, backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: {
    position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
    height: 20, paddingHorizontal: 7, borderRadius: 6,
  },
  badgeAmber: { backgroundColor: SHADES.amber },
  badgeDark: { backgroundColor: SHADES.carbon },
  badgeText: { fontSize: 10, fontWeight: '800', color: SHADES.carbon },
  body: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 3 },
  withQuickAdd: { paddingRight: 36, gap: 3 },
  quickAdd: { position: 'absolute', right: 8, bottom: 8 },
  name: { fontSize: 14, fontWeight: '700', color: SHADES.carbon, lineHeight: 18 },
  price: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted },
  priceMissing: { fontStyle: 'italic' },
});

// Memoised for long lists: re-render only when what the card shows changes. Handlers are
// per-render closures bound to this product's id, so ignoring their identity is safe.
const SHOWN_PROPS = ['product', 'isFavorite', 'exchangeRate', 'userTier', 'quickAdd'] as const;
export default React.memo(ProductRailCard, (a, b) => SHOWN_PROPS.every(k => a[k] === b[k]));
