import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { getProductsByCategory } from '@/lib/firestore';
import { Product, CATEGORIES, CATEGORY_DETAILS, ProductCategory } from '@/lib/mockData';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  const catId = id as ProductCategory;
  const catDetails = CATEGORY_DETAILS[catId];
  const cat = CATEGORIES.find(c => c.id === catId);

  useEffect(() => {
    if (catId) {
      getProductsByCategory(catId).then(data => {
        setProducts(data);
        setLoading(false);
      });
    }
  }, [catId]);

  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.porcelain,
  };
  const heroBg = bgColors[catDetails?.cardBg ?? 'default'];
  const isDark = catDetails?.cardBg === 'dark';
  const heroTextColor = isDark ? COLORS.porcelain : COLORS.carbon;

  const subFilters = ['All', 'Available now', 'Best rated', 'Lowest price'];

  return (
    <SafeAreaView style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        <View style={styles.heroTopBar}>
          <TouchableOpacity style={[styles.backBtn, isDark && styles.backBtnDark]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={isDark ? COLORS.porcelain : COLORS.carbon} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: isDark ? COLORS.porcelain : COLORS.carbon }]}>LANCHAI</Text>
          <TouchableOpacity style={[styles.backBtn, isDark && styles.backBtnDark]}>
            <Feather name="search" size={20} color={isDark ? COLORS.porcelain : COLORS.carbon} />
          </TouchableOpacity>
        </View>
        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroEyebrow, { color: isDark ? COLORS.amber : 'rgba(30,30,30,0.55)' }]}>
              CATEGORY · {products.length} ITEMS
            </Text>
            <Text style={[styles.heroTitle, { color: heroTextColor }]}>
              {catDetails?.label ?? cat?.name ?? id}
            </Text>
            <Text style={[styles.heroSub, { color: isDark ? 'rgba(250,250,247,0.7)' : 'rgba(30,30,30,0.65)' }]}>
              {catDetails?.description ?? ''}
            </Text>
          </View>
          <View style={[styles.heroIcon, isDark && styles.heroIconDark]}>
            <Feather name={(cat?.icon ?? 'grid') as never} size={40} color={isDark ? COLORS.amber : COLORS.carbon} />
          </View>
        </View>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterBar}
      >
        {subFilters.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarCount}>{products.length} items</Text>
        <View style={styles.toolbarRight}>
          <TouchableOpacity style={styles.toolbarBtn}>
            <Feather name="sliders" size={14} color={COLORS.fg2} />
            <Text style={styles.toolbarBtnText}>Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn}>
            <Feather name="trending-up" size={14} color={COLORS.fg2} />
            <Text style={styles.toolbarBtnText}>Popular</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Products */}
      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContent}>
          <View style={styles.grid}>
            {products.map(p => (
              <CategoryProductCard
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

function CategoryProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
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
          <View style={[
            styles.prodTag,
            product.tagStyle === 'dark' && styles.prodTagDark,
            product.tagStyle === 'amber' && styles.prodTagAmber,
          ]}>
            <Text style={[styles.prodTagText, product.tagStyle === 'dark' && { color: COLORS.amber }]}>
              {product.tag}
            </Text>
          </View>
        )}
        {product.stockLeft <= 1 && !product.tag && (
          <View style={[styles.prodTag, { backgroundColor: '#C8412C' }]}>
            <Text style={[styles.prodTagText, { color: '#FAFAF7' }]}>1 LEFT</Text>
          </View>
        )}
        <TouchableOpacity style={styles.prodFav}>
          <Feather name="heart" size={12} color={COLORS.carbon} />
        </TouchableOpacity>
        <Feather name={product.iconName as never} size={52} color={iconColor} />
      </View>
      <View style={styles.prodMeta}>
        <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.prodSub} numberOfLines={1}>{product.shortDesc}</Text>
        <View style={styles.prodBottom}>
          <View style={styles.prodPriceRow}>
            <Text style={styles.prodPrice}>{product.pricePerDay}K</Text>
            <Text style={styles.prodPriceUnit}> LAK/day</Text>
          </View>
          <View style={styles.ratingRow}>
            <Feather name="star" size={10} color={COLORS.amber} />
            <Text style={styles.ratingText}>{product.rating}</Text>
          </View>
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
  hero: {
    paddingBottom: 18,
  },
  heroTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDark: {
    backgroundColor: 'rgba(250,250,247,0.15)',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 3,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(30,30,30,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroIconDark: {
    backgroundColor: 'rgba(250,250,247,0.1)',
  },
  // Filters
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  filterScroll: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  filterChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg1,
  },
  filterTextActive: {
    color: COLORS.porcelain,
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  toolbarCount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  toolbarRight: {
    flexDirection: 'row',
    gap: 12,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  // Grid
  gridContent: {
    padding: 16,
    paddingBottom: 24,
  },
  grid: {
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
    zIndex: 1,
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
    zIndex: 1,
  },
  prodMeta: {
    padding: 12,
  },
  prodName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  prodSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
    marginBottom: 8,
  },
  prodBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prodPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prodPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  prodPriceUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
});
