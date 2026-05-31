import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import LanchaiMark from '@/components/LanchaiMark';
import LanchaiIcon from '@/components/LanchaiIcon';
import { getProducts } from '@/lib/firestore';
import { Product, CATEGORIES } from '@/lib/mockData';

export default function HomeScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const featured = products.slice(0, 4);

  const handleProductPress = useCallback((id: string) => {
    router.push(`/product/${id}`);
  }, [router]);

  const handleCategoryPress = useCallback((catId: string) => {
    if (catId === 'all') {
      router.push('/catalogue');
    } else {
      router.push(`/category/${catId}`);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn}>
          <Feather name="menu" size={22} color={COLORS.carbon} />
        </TouchableOpacity>
        <View style={styles.wordmarkRow}>
          <LanchaiMark size={28} color={COLORS.carbon} hexColor={COLORS.amber} />
          <Text style={styles.wordmark}>LANCHAI</Text>
        </View>
        <TouchableOpacity style={styles.topBtn}>
          <Feather name="bell" size={22} color={COLORS.carbon} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>2</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Location */}
        <TouchableOpacity style={styles.locRow}>
          <Feather name="map-pin" size={13} color={COLORS.amber} />
          <Text style={styles.locText}>Vientiane, Laos</Text>
          <Feather name="chevron-down" size={13} color={COLORS.fg3} />
        </TouchableOpacity>

        {/* Headline */}
        <Text style={styles.headline}>Everything you need.{'\n'}Only when you need it.</Text>
        <Text style={styles.tagline}>
          Rent. <Text style={styles.taglineAccent}>Return.</Text> Repeat.
        </Text>

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Feather name="search" size={18} color={COLORS.fg3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for items"
              placeholderTextColor={COLORS.fg3}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
          <TouchableOpacity style={styles.filterBtn}>
            <Feather name="sliders" size={20} color={COLORS.carbon} />
          </TouchableOpacity>
        </View>

        {/* Category circles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.catItem}
              onPress={() => {
                setActiveCat(cat.id);
                handleCategoryPress(cat.id);
              }}
            >
              <View style={[styles.catCircle, activeCat === cat.id && styles.catCircleActive]}>
                <Feather
                  name={cat.icon as never}
                  size={20}
                  color={activeCat === cat.id ? COLORS.carbon : COLORS.carbon}
                />
              </View>
              <Text style={[styles.catLabel, activeCat === cat.id && styles.catLabelActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Move lighter.{'\n'}Live better.</Text>
            <Text style={styles.heroSub}>Rent smart. Save more.{'\n'}Do more.</Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => router.push('/catalogue')}
            >
              <Text style={styles.heroCtaText}>Explore now</Text>
              <Feather name="arrow-right" size={14} color={COLORS.amber} />
            </TouchableOpacity>
          </View>
          <HeroIllustration />
        </View>

        {/* Popular near you */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Popular near you</Text>
          <TouchableOpacity onPress={() => router.push('/catalogue')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
            {featured.map(p => (
              <ProductCard key={p.id} product={p} onPress={() => handleProductPress(p.id)} />
            ))}
          </ScrollView>
        )}

        {/* Trust strip */}
        <View style={styles.trustStrip}>
          <TrustCell icon="shield" title="Quality checked" sub="All items are verified and insured" />
          <View style={styles.trustDivider} />
          <TrustCell icon="message-circle" title="24/7 Support" sub="We're here for you, anytime" />
          <View style={styles.trustDivider} />
          <TrustCell icon="credit-card" title="Secure payments" sub="Safe and flexible options" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TrustCell({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={styles.trustCell}>
      <Feather name={icon as never} size={20} color={COLORS.carbon} />
      <Text style={styles.trustTitle}>{title}</Text>
      <Text style={styles.trustSub}>{sub}</Text>
    </View>
  );
}

function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
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
            <Text style={[styles.prodTagText, product.tagStyle === 'dark' && styles.prodTagTextLight]}>{product.tag}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.prodFav}>
          <Feather name="heart" size={12} color={COLORS.carbon} />
        </TouchableOpacity>
        <Feather name={product.iconName as never} size={44} color={iconColor} />
      </View>
      <View style={styles.prodBody}>
        <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.prodPrice}>From {product.pricePerDay}K <Text style={styles.prodPriceUnit}>LAK / day</Text></Text>
        <View style={styles.prodRating}>
          <Feather name="star" size={11} color={COLORS.amber} />
          <Text style={styles.prodRatingText}>{product.rating} ({product.reviewCount})</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function HeroIllustration() {
  return (
    <View style={styles.heroStage}>
      {/* Simplified product collage */}
      <View style={styles.heroItem1}>
        <Feather name="briefcase" size={28} color={COLORS.carbon} />
      </View>
      <View style={styles.heroItem2}>
        <Feather name="coffee" size={22} color={COLORS.carbon} />
      </View>
      <View style={styles.heroItem3}>
        <Feather name="camera" size={24} color={COLORS.amber} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.porcelain,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.porcelain,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmark: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 5,
    color: COLORS.carbon,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  locText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg1,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.7,
    color: COLORS.carbon,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 18,
    letterSpacing: -0.2,
  },
  taglineAccent: {
    color: COLORS.amber,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  filterBtn: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  // Categories
  catScroll: {
    gap: 14,
    paddingBottom: 4,
    marginBottom: 22,
    paddingLeft: 0,
    paddingRight: 8,
  },
  catItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 52,
  },
  catCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCircleActive: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg1,
    textAlign: 'center',
  },
  catLabelActive: {
    fontWeight: '700',
  },
  // Hero card
  heroCard: {
    backgroundColor: COLORS.amber,
    borderRadius: 22,
    padding: 22,
    marginBottom: 22,
    minHeight: 180,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  heroText: {
    flex: 1,
    maxWidth: '56%',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 23,
    letterSpacing: -0.4,
    color: COLORS.carbon,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    color: 'rgba(30,30,30,0.7)',
    marginBottom: 16,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 14,
    backgroundColor: COLORS.carbon,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  heroCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.porcelain,
  },
  heroStage: {
    position: 'absolute',
    right: 12,
    top: 12,
    bottom: 12,
    width: '44%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroItem1: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: 'rgba(30,30,30,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroItem2: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(30,30,30,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginRight: 8,
  },
  heroItem3: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  // Section head
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.amber,
  },
  // Product strip
  productStrip: {
    gap: 12,
    paddingRight: 20,
    paddingLeft: 20,
    marginLeft: -20,
    marginBottom: 22,
  },
  prodCard: {
    width: 138,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  prodImg: {
    height: 120,
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
  prodTagAmber: {
    backgroundColor: COLORS.amber,
  },
  prodTagDark: {
    backgroundColor: COLORS.carbon,
  },
  prodTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: 0.4,
  },
  prodTagTextLight: {
    color: COLORS.amber,
  },
  prodFav: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodBody: {
    padding: 10,
  },
  prodName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 3,
    letterSpacing: -0.1,
  },
  prodPrice: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 6,
  },
  prodPriceUnit: {
    fontSize: 10,
  },
  prodRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prodRatingText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  // Trust strip
  trustStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 8,
  },
  trustCell: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  trustDivider: {
    width: 1,
    backgroundColor: COLORS.softGray200,
    marginVertical: 4,
  },
  trustTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  trustSub: {
    fontSize: 9.5,
    fontWeight: '500',
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 13,
  },
});
