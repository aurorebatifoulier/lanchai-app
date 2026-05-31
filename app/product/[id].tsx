import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { getProduct } from '@/lib/firestore';
import { Product } from '@/lib/mockData';

type PriceTier = 'short' | 'medium' | 'long';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<PriceTier>('short');
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (id) {
      getProduct(id).then(p => {
        setProduct(p);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Product not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.warmBeige,
  };
  const heroBg = bgColors[product.cardBg] ?? COLORS.warmBeige;
  const heroIconColor = product.cardBg === 'dark' ? COLORS.amber : COLORS.carbon;

  const prices: Record<PriceTier, { label: string; price: number; discount?: string }> = {
    short: { label: '1–7 days', price: product.pricePerDay },
    medium: { label: '8–30 days', price: product.price8to30, discount: `−${Math.round((1 - product.price8to30 / product.pricePerDay) * 100)}%` },
    long: { label: '30+ days', price: product.price30plus },
  };

  const displayPrice = prices[selectedTier].price;

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        <TouchableOpacity style={styles.heroBack} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={COLORS.carbon} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.heroFav} onPress={() => setIsFav(f => !f)}>
          <Feather name="heart" size={20} color={isFav ? COLORS.danger : COLORS.carbon} />
        </TouchableOpacity>
        <Feather name={product.iconName as never} size={140} color={heroIconColor} />
        {/* Image dots */}
        <View style={styles.imgDots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.imgDot, i === 0 && styles.imgDotActive]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {/* Tags + title */}
        <View style={styles.tagsRow}>
          <View style={styles.chipPopular}>
            <Text style={styles.chipText}>{product.tag ?? 'POPULAR'}</Text>
          </View>
          <View style={styles.chipOutline}>
            <Text style={styles.chipOutlineText}>
              {product.available ? `In stock · ${product.stockLeft} left` : 'Out of stock'}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{product.name}</Text>
        <Text style={styles.titleSub}>{product.shortDesc}</Text>

        <View style={styles.ratingRow}>
          <Feather name="star" size={14} color={COLORS.amber} />
          <Text style={styles.ratingText}>
            {product.rating} · {product.reviewCount} reviews ·{' '}
            <Text style={{ opacity: 0.6 }}>Rented {product.rentalCount} times</Text>
          </Text>
        </View>

        <Text style={styles.description}>{product.description}</Text>

        {/* Pricing tiers */}
        <Text style={styles.sectionLabel}>DAILY RATE — AUTO-DISCOUNT</Text>
        <View style={styles.tierRow}>
          {(['short', 'medium', 'long'] as PriceTier[]).map(tier => {
            const t = prices[tier];
            const isOn = selectedTier === tier;
            return (
              <TouchableOpacity
                key={tier}
                style={[styles.tier, isOn && styles.tierActive]}
                onPress={() => setSelectedTier(tier)}
              >
                {t.discount && (
                  <View style={styles.tierDiscount}>
                    <Text style={styles.tierDiscountText}>{t.discount}</Text>
                  </View>
                )}
                <Text style={[styles.tierName, isOn && styles.tierTextActive]}>{t.label}</Text>
                <Text style={[styles.tierPrice, isOn && styles.tierTextActive]}>{t.price}K</Text>
                <Text style={[styles.tierUnit, isOn && styles.tierTextActive]}>LAK / day</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Specs */}
        {Object.keys(product.specs).length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SPECS</Text>
            <View style={styles.specGrid}>
              {product.specs.dimensions && <SpecCell icon="maximize" label="Dimensions" value={product.specs.dimensions} />}
              {product.specs.weight && <SpecCell icon="package" label="Weight" value={product.specs.weight} />}
              {product.specs.material && <SpecCell icon="sun" label="Material" value={product.specs.material} />}
              {product.specs.condition && <SpecCell icon="shield" label="Condition" value={product.specs.condition} />}
            </View>
          </>
        )}

        {/* Deposit */}
        <Text style={styles.sectionLabel}>DEPOSIT & TRUST</Text>
        <View style={styles.infoCard}>
          <View style={[styles.infoIcon, { backgroundColor: COLORS.carbon }]}>
            <Feather name="shield" size={18} color={COLORS.amber} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>{product.deposit}K LAK refundable deposit</Text>
            <Text style={styles.infoSub}>Held, not charged. Refunded within 48h after return.</Text>
            <Text style={styles.infoLink}>How it works →</Text>
          </View>
        </View>

        {/* Pick-up */}
        <Text style={styles.sectionLabel}>PICK-UP & RETURN</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Feather name="map-pin" size={18} color={COLORS.carbon} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>LANCHAI · Setthathirath shop</Text>
            <Text style={styles.infoSub}>Vientiane · Mon–Sat 9am–7pm</Text>
            <Text style={styles.infoSub}>Ready in 90 sec. Bring your booking QR.</Text>
            <Text style={styles.infoLink}>Get directions →</Text>
          </View>
        </View>

        {/* Reviews */}
        <Text style={styles.sectionLabel}>REVIEWS</Text>
        <View style={styles.reviewsStat}>
          <Text style={styles.reviewsScore}>{product.rating}</Text>
          <View style={styles.reviewsBars}>
            {[
              { stars: 5, pct: 0.85 },
              { stars: 4, pct: 0.10 },
              { stars: 3, pct: 0.05 },
            ].map(r => (
              <View key={r.stars} style={styles.rBar}>
                <Text style={styles.rBarLabel}>{r.stars}</Text>
                <View style={styles.rBarTrack}>
                  <View style={[styles.rBarFill, { width: `${r.pct * 100}%` }]} />
                </View>
                <Text style={styles.rBarCount}>{Math.round(r.pct * product.reviewCount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.sticky}>
        <View style={styles.stickyPrice}>
          <Text style={styles.stickyPriceValue}>{displayPrice}K LAK</Text>
          <Text style={styles.stickyPriceSub}>/ day · {prices[selectedTier].label}</Text>
        </View>
        <TouchableOpacity
          style={styles.rentBtn}
          onPress={() => router.push(`/booking/${product.id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.rentBtnText}>Rent now</Text>
          <Feather name="arrow-right" size={16} color={COLORS.carbon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SpecCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <Feather name={icon as never} size={16} color={COLORS.carbon} style={styles.specIcon} />
      <View>
        <Text style={styles.specLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.specValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  notFoundText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  backBtn: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontWeight: '800',
    color: COLORS.carbon,
  },
  // Hero
  hero: {
    height: 340,
    paddingTop: Platform.OS === 'ios' ? 48 : 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroBack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  heroFav: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imgDots: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    gap: 6,
  },
  imgDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(30,30,30,0.25)',
  },
  imgDotActive: {
    width: 22,
    borderRadius: 999,
    backgroundColor: COLORS.carbon,
  },
  // Body
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chipPopular: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  chipOutline: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOutlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.carbon,
    lineHeight: 30,
    marginBottom: 4,
  },
  titleSub: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: COLORS.fg2,
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
  },
  // Tiers
  tierRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  tier: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderRadius: 16,
    padding: 10,
    position: 'relative',
    backgroundColor: COLORS.white,
    gap: 4,
  },
  tierActive: {
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.warmBeige,
  },
  tierDiscount: {
    position: 'absolute',
    top: -8,
    right: 8,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tierDiscountText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  tierName: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: COLORS.fg3,
  },
  tierPrice: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
  },
  tierUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  tierTextActive: {
    color: COLORS.carbon,
  },
  // Specs
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  spec: {
    width: '47%',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: COLORS.warmBeige,
    borderRadius: 14,
    padding: 12,
  },
  specIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.fg3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  specValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  // Info card
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: COLORS.carbon,
  },
  infoSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
    lineHeight: 17,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  // Reviews
  reviewsStat: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    backgroundColor: COLORS.warmBeige,
    borderRadius: 18,
    padding: 14,
    marginBottom: 22,
  },
  reviewsScore: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: COLORS.carbon,
  },
  reviewsBars: {
    flex: 1,
    gap: 4,
  },
  rBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg3,
    width: 10,
  },
  rBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  rBarFill: {
    height: '100%',
    backgroundColor: COLORS.amber,
    borderRadius: 2,
  },
  rBarCount: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg3,
    width: 22,
    textAlign: 'right',
  },
  // Sticky CTA
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.porcelain,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stickyPrice: {
    flexShrink: 0,
  },
  stickyPriceValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
  },
  stickyPriceSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: -2,
  },
  rentBtn: {
    flex: 1,
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  rentBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
