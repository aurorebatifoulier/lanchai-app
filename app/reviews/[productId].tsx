import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import ReviewCard from '@/components/product/ReviewCard';
import { UI, useScreenInsets } from '@/components/account/ui';
import { getProductReviewsPage, type ReviewDoc } from '@/lib/firestore';

const PAGE = 10;

// All reviews of one product (product page "See all"), newest first, 10 per page.
// Lives at /reviews/[productId] — NOT under app/product/[id]/ (a [id].tsx file + [id]/
// folder pair breaks navigation, see CLAUDE.md).
export default function ProductReviewsScreen() {
  const { productId, name } = useLocalSearchParams<{ productId: string; name?: string }>();
  const router = useRouter();
  const screen = useScreenInsets();
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [last, setLast] = useState<QueryDocumentSnapshot | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (after: QueryDocumentSnapshot | null) => {
    if (!productId) return;
    setLoading(true);
    try {
      const page = await getProductReviewsPage(productId, PAGE, after);
      setReviews(r => (after ? [...r, ...page.reviews] : page.reviews));
      setLast(page.last);
      setDone(page.reviews.length < PAGE);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { load(null); }, [load]);

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{PRODUCT_COPY.reviews.screenTitle}</Text>
          {!!name && <Text style={UI.small} numberOfLines={1}>{name}</Text>}
        </View>
      </View>
      <FlatList
        data={reviews}
        keyExtractor={(r, i) => `${r.reservationId ?? i}`}
        contentContainerStyle={[UI.screenContent, { paddingTop: 12, paddingBottom: screen.contentBottom }]}
        renderItem={({ item, index }) => (
          <View style={[UI.card, s.card, index > 0 && { marginTop: 10 }]}>
            <ReviewCard review={item} />
          </View>
        )}
        ListEmptyComponent={loading ? null : <Text style={[UI.body, { textAlign: 'center', marginTop: 32 }]}>{PRODUCT_COPY.reviews.empty}</Text>}
        ListFooterComponent={
          loading ? <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 20 }} />
          : !done && reviews.length > 0 ? (
            <PressScale style={[UI.btnSecondary, { marginTop: 16 }]} onPress={() => load(last)}>
              <Text style={UI.btnSecondaryText}>{PRODUCT_COPY.reviews.loadMore}</Text>
            </PressScale>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  title: { fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  card: { paddingHorizontal: 16, paddingVertical: 2 },
});
