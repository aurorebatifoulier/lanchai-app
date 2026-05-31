import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import LanchaiIcon from '@/components/LanchaiIcon';
import { getProducts } from '@/lib/firestore';
import { Product, CATEGORIES, CATEGORY_DETAILS } from '@/lib/mockData';

const FILTER_CHIPS = ['All', 'Available now', 'Long-term', 'Under 50K'];

export default function CatalogueScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{products.length} ITEMS · VIENTIANE STOCK</Text>
        <Text style={styles.title}>Browse the{'\n'}<Text style={styles.titleAccent}>catalogue.</Text></Text>
        <View style={styles.searchField}>
          <Feather name="search" size={18} color={COLORS.fg3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search 200+ items..."
            placeholderTextColor={COLORS.fg3}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip}
              style={[styles.filterChip, activeFilter === chip && styles.filterChipActive]}
              onPress={() => setActiveFilter(chip)}
            >
              <Text style={[styles.filterChipText, activeFilter === chip && styles.filterChipTextActive]}>{chip}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.filterChip}>
            <Feather name="sliders" size={12} color={COLORS.fg1} style={{ marginRight: 4 }} />
            <Text style={styles.filterChipText}>Filters</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Category grid */}
      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.grid} showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
          {/* Banner */}
          <View style={styles.banner}>
            <View>
              <Text style={styles.bannerEyebrow}>MONTHLY DEAL</Text>
              <Text style={styles.bannerTitle}>Stay-month kit</Text>
              <Text style={styles.bannerSub}>Chair + AC + coffee machine</Text>
            </View>
            <TouchableOpacity
              style={styles.bannerCta}
              onPress={() => router.push('/catalogue')}
            >
              <Feather name="arrow-right" size={16} color={COLORS.amber} />
            </TouchableOpacity>
          </View>

          {/* Category tiles */}
          <Text style={styles.sectionTitle}>Browse by category</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.filter(c => c.id !== 'all').map((cat, i) => {
              const detail = CATEGORY_DETAILS[cat.id];
              const bgColors = [COLORS.amber, COLORS.warmBeige, COLORS.carbon, COLORS.warmBeige, COLORS.porcelain, COLORS.warmBeige, COLORS.amber];
              const bg = bgColors[i % bgColors.length];
              const isDark = bg === COLORS.carbon;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catTile, { backgroundColor: bg }]}
                  onPress={() => router.push(`/category/${cat.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.tileGlyph, isDark && styles.tileGlyphDark]}>
                    <Feather name={cat.icon as never} size={20} color={isDark ? COLORS.amber : COLORS.carbon} />
                  </View>
                  <View style={styles.tileInfo}>
                    <Text style={[styles.tileName, isDark && { color: COLORS.porcelain }]} numberOfLines={2}>
                      {detail?.label ?? cat.name}
                    </Text>
                    <Text style={[styles.tileSub, isDark && { color: 'rgba(250,250,247,0.7)' }]}>
                      {products.filter(p => p.category === cat.id).length} items
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* All products grid */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>All items</Text>
          </View>
          <View style={styles.productGrid}>
            {products
              .filter(p => search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
              .map(p => (
                <CatalogueProductCard
                  key={p.id}
                  product={p}
                  onPress={() => router.push(`/product/${p.id}`)}
                />
              ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CatalogueProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.warmBeige,
  };
  const bg = bgColors[product.cardBg] ?? COLORS.warmBeige;
  const iconColor = product.cardBg === 'dark' ? COLORS.amber : COLORS.carbon;

  return (
    <TouchableOpacity style={styles.prodCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.prodImg, { backgroundColor: bg }]}>
        {product.tag && (
          <View style={[styles.prodTag, product.tagStyle === 'dark' && styles.prodTagDark, product.tagStyle === 'amber' && styles.prodTagAmber]}>
            <Text style={[styles.prodTagText, product.tagStyle === 'dark' && { color: COLORS.amber }]}>{product.tag}</Text>
          </View>
        )}
        {product.stockLeft <= 1 && (
          <View style={[styles.prodTag, { backgroundColor: '#C8412C', right: 8, left: 'auto' as any }]}>
            <Text style={[styles.prodTagText, { color: COLORS.white }]}>1 LEFT</Text>
          </View>
        )}
        <TouchableOpacity style={styles.prodFav}>
          <Feather name="heart" size={12} color={COLORS.carbon} />
        </TouchableOpacity>
        <Feather name={product.iconName as never} size={48} color={iconColor} />
      </View>
      <View style={styles.prodMeta}>
        <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.prodSub} numberOfLines={1}>{product.shortDesc}</Text>
        <View style={styles.prodPriceRow}>
          <Text style={styles.prodPrice}>{product.pricePerDay}K LAK</Text>
          <Text style={styles.prodPriceUnit}> /day</Text>
        </View>
        <View style={styles.prodRating}>
          <Feather name="star" size={11} color={COLORS.amber} />
          <Text style={styles.prodRatingText}>{product.rating} ({product.reviewCount})</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: COLORS.porcelain,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: COLORS.fg3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
    color: COLORS.carbon,
    marginBottom: 14,
  },
  titleAccent: {
    color: COLORS.amber,
    fontStyle: 'italic',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  filterRow: {
    gap: 8,
    paddingBottom: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
  },
  filterChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg1,
  },
  filterChipTextActive: {
    color: COLORS.porcelain,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Banner
  banner: {
    backgroundColor: COLORS.carbon,
    borderRadius: 18,
    padding: 18,
    marginTop: 14,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: COLORS.amber,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.porcelain,
    letterSpacing: -0.3,
  },
  bannerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(250,250,247,0.7)',
    marginTop: 2,
  },
  bannerCta: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Category grid
  sectionHead: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
    marginBottom: 12,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  catTile: {
    width: '47%',
    minHeight: 130,
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-between',
  },
  tileGlyph: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(30,30,30,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyphDark: {
    backgroundColor: 'rgba(250,250,247,0.1)',
  },
  tileInfo: {
    marginTop: 12,
  },
  tileName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
    lineHeight: 19,
  },
  tileSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  // Product grid
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  prodCard: {
    width: '47%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  prodImg: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  prodTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: COLORS.porcelain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodTagAmber: { backgroundColor: COLORS.amber },
  prodTagDark: { backgroundColor: COLORS.carbon },
  prodTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: 0.4,
  },
  prodFav: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodMeta: {
    padding: 12,
  },
  prodName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  prodSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  prodPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  prodPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  prodPriceUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  prodRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  prodRatingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
});
