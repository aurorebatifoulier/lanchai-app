import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { HOME_COPY } from '@/constants/homeCopy';
import BackButton from '@/components/BackButton';
import ProductGridCard from '@/components/ProductGridCard';
import { UI, useScreenInsets } from '@/components/account/ui';
import { useAuth } from '@/contexts/AuthContext';
import { getProducts, getFavorites, addFavorite, removeFavorite } from '@/lib/firestore';
import { getCollection, isCollectionActive, shadeOf, type CollectionDoc } from '@/lib/collections';
import type { Product } from '@/lib/mockData';
import { useExchangeRate } from '@/lib/exchangeRate';
import { useLoyaltyTier } from '@/lib/loyalty';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 16;
const COL_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2;

// A Home "Got plans?" collection: its header, then its renter-visible products in the
// admin's order (2-column grid, same cards as Explore). Drafts / out-of-window
// collections show "not available" (renters can't even read a draft — firestore.rules).
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const screen = useScreenInsets();
  const { user, isAdmin } = useAuth();
  const userTier = useLoyaltyTier();
  const exchangeRate = useExchangeRate();
  const [col, setCol] = useState<CollectionDoc | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([getCollection(id), getProducts().catch(() => [] as Product[])])
      .then(([c, all]) => {
        // Admins can open drafts / out-of-date ones (Home "Preview all sections").
        const usable = c && (isAdmin || (c.published && isCollectionActive(c))) ? c : null;
        setCol(usable);
        if (usable) {
          const byId = new Map(all.map(p => [p.id, p]));
          setProducts(usable.productIds.map(pid => byId.get(pid)).filter((p): p is Product => !!p));
        }
      })
      .finally(() => setLoading(false));
  }, [id, isAdmin]);

  useEffect(() => {
    if (!user) return;
    getFavorites(user.uid).then(ids => setFavorites(new Set(ids))).catch(() => {});
  }, [user]);

  const toggleFavorite = useCallback((productId: string) => {
    if (!user) return;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) { next.delete(productId); removeFavorite(user.uid, productId); }
      else { next.add(productId); addFavorite(user.uid, productId); }
      return next;
    });
  }, [user]);

  const shade = col ? shadeOf(col) : null;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={SHADES.amber} /></View>
      ) : !col || !shade ? (
        <View style={s.centered}>
          <Text style={[UI.body, { textAlign: 'center' }]}>{HOME_COPY.collectionUnavailable}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={p => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: COL_GAP }}
          contentContainerStyle={[s.grid, { paddingBottom: screen.contentBottom }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={s.intro}>
              <View style={[s.circle, { backgroundColor: shade.bg }]}>
                <MaterialCommunityIcons name={col.icon} size={26} color={shade.fg} />
              </View>
              <Text style={s.title}>{col.title}</Text>
              {!!col.subtitle && <Text style={[UI.body, s.subtitle]}>{col.subtitle}</Text>}
            </View>
          }
          ListEmptyComponent={<Text style={[UI.body, { textAlign: 'center', marginTop: 24 }]}>{HOME_COPY.collectionEmpty}</Text>}
          renderItem={({ item }) => (
            <ProductGridCard
              product={item}
              width={CARD_WIDTH}
              onPress={() => router.push(`/product/${item.id}`)}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              exchangeRate={exchangeRate}
              userTier={userTier ?? null}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  grid: { paddingHorizontal: H_PAD, gap: COL_GAP },
  intro: { alignItems: 'flex-start', paddingTop: 4, paddingBottom: 12 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.4 },
  subtitle: { marginTop: 4, fontSize: 14 },
});
