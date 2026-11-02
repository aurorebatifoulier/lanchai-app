import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Reanimated, { FadeInUp, ReduceMotion } from 'react-native-reanimated';
import { SHADES } from '@/constants/brandShades';
import { MOTION } from '@/constants/motion';
import { RENTALS_COPY as c } from '@/constants/rentalsCopy';
import { UI } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { QRLightbox } from '@/components/QRLightbox';
import { useAuth } from '@/contexts/AuthContext';
import { getMyReservations, cancelReservations, getProducts, getProduct, type RentalDoc } from '@/lib/firestore';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { sendNotif } from '@/lib/notifications';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { DEFAULT_REVIEW_REWARD_POINTS } from '@/lib/loyalty';
import {
  type RentalsTab, type PastFilter, type RentalEntry,
  tabOf, groupEntries, matchesPastFilter, heroEntry, isPickupPassed, withProductImages, type ProductLook,
} from '@/lib/rentalsList';
import {
  NextPickupHero, UpcomingCard, MissedPickupsCard, ActiveCard, PastCard, RentalsEmpty, clearReviewCache,
} from '@/components/rentals/RentalCards';
import { OrderSheet } from '@/components/rentals/OrderSheet';

// "My rentals" tab (validated mockup, 2026-11-02) — Upcoming (carbon "Next pick-up" card
// + countdown cards), Active (due-back countdown, Extend, calm late card with "I'm on my
// way"), Past (Returned / Cancelled / All). One card per order; a multi-item card opens
// the order sheet. Pure picks in lib/rentalsList.ts, cards in components/rentals/.

// Products the renter catalogue doesn't hold (drafts, archived — getProducts hides them):
// read once by id for their photo / category, kept for the app session.
const extraLooks = new Map<string, ProductLook>();

async function productLooks(rentals: RentalDoc[]): Promise<Map<string, ProductLook>> {
  const looks = new Map<string, ProductLook>();
  const products = await cached('products', HOME_TTL.products, getProducts).catch(() => []);
  const imagesOf = (p: { images?: string[]; imageUrl?: string } | null) =>
    [...(p?.images ?? []).slice(0, 2), p?.imageUrl].filter((u): u is string => typeof u === 'string' && u.length > 0);
  for (const p of products) looks.set(p.id, { images: imagesOf(p), category: p.category ?? null });
  const missing = [...new Set(rentals.map(r => r.productId))].filter(id => id && !looks.has(id));
  await Promise.all(missing.map(async id => {
    if (!extraLooks.has(id)) {
      const p = await getProduct(id).catch(() => null);
      extraLooks.set(id, { images: imagesOf(p), category: p?.category ?? null });
    }
    looks.set(id, extraLooks.get(id)!);
  }));
  return looks;
}

const ENTER = FadeInUp.duration(MOTION.duration.base)
  .withInitialValues({ opacity: 0, transform: [{ translateY: MOTION.riseY }] })
  .reduceMotion(ReduceMotion.System);

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const loyalty = useMyLoyalty();

  const [rentals, setRentals] = useState<RentalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<RentalsTab>('upcoming');
  const [pastFilter, setPastFilter] = useState<PastFilter>('returned');
  const [order, setOrder] = useState<RentalEntry | null>(null);
  const [qr, setQr] = useState<{ value: string; label: string } | null>(null);
  const tabChosen = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      // Photos: the stored one, else the product's first photo (shared 5-min products
      // cache + a by-id read for hidden products), else its category badge.
      const data = await getMyReservations(user.uid);
      const looks = await productLooks(data).catch(() => new Map<string, ProductLook>());
      setRentals(withProductImages(data, looks));
      setFailed(false);
      // First load only: open the first tab with something in it.
      if (!tabChosen.current) {
        tabChosen.current = true;
        const tabs = data.map(tabOf);
        setTab((['upcoming', 'active', 'past'] as RentalsTab[]).find(t => tabs.includes(t)) ?? 'upcoming');
      }
    } catch {
      setFailed(true);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    clearReviewCache(); // back from the review screen → "★ You rated it n"
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearReviewCache();
    await load();
    setRefreshing(false);
  }, [load]);

  const byTab = useMemo(() => {
    const pick = (t: RentalsTab) => groupEntries(rentals.filter(r => tabOf(r) === t), t);
    return { upcoming: pick('upcoming'), active: pick('active'), past: pick('past') };
  }, [rentals]);

  const hero = useMemo(() => heroEntry(byTab.upcoming), [byTab.upcoming]);
  const returnedCount = useMemo(() => rentals.filter(r => r.status === 'returned').length, [rentals]);

  // Upcoming: the carbon hero (next FUTURE pick-up) first, then ONE collapsible card for
  // the pick-ups missed in the last 48h (older ones are in Past), then the others.
  const missed = tab === 'upcoming' ? byTab.upcoming.filter(e => isPickupPassed(e)) : [];
  const list: RentalEntry[] =
    tab === 'upcoming' ? byTab.upcoming.filter(e => e !== hero && !isPickupPassed(e))
    : tab === 'active' ? byTab.active
    : byTab.past.filter(e => matchesPastFilter(e, pastFilter));

  const reviewPoints = loyalty.excluded ? null : (loyalty.config?.reviewRewardPoints ?? DEFAULT_REVIEW_REWARD_POINTS);

  const cancelOrder = useCallback(async (items: RentalDoc[]) => {
    if (items.length === 0) return;
    await cancelReservations(items.map(r => r.id));
    sendNotif(items[0].renterId, {
      type: 'rental', icon: 'x-circle', iconColor: SHADES.carbonMuted,
      title: c.cancelledNotifTitle, body: c.cancelledNotifBody(items.length),
      deepLink: '/(tabs)/reservations',
    });
    await load();
  }, [load]);

  const renderItem = ({ item }: { item: RentalEntry }) => (
    <Reanimated.View entering={ENTER}>
      {tab === 'upcoming' ? <UpcomingCard entry={item} onOpenOrder={setOrder} />
        : tab === 'active' ? <ActiveCard entry={item} onOpenOrder={setOrder} />
        : <PastCard entry={item} onOpenOrder={setOrder} reviewPoints={reviewPoints} />}
    </Reanimated.View>
  );

  const header = (
    <>
      {tab === 'upcoming' && hero && (
        <Reanimated.View entering={ENTER}>
          <NextPickupHero entry={hero} onOpenOrder={setOrder} onOpenQR={(value, label) => setQr({ value, label })} />
        </Reanimated.View>
      )}
      {missed.length > 0 && (
        <Reanimated.View entering={ENTER}>
          <MissedPickupsCard entries={missed} />
        </Reanimated.View>
      )}
      {tab === 'past' && returnedCount > 0 && pastFilter !== 'cancelled' && (
        <Text style={s.countLine}>
          <Text style={s.countStrong}>{c.pastCount(returnedCount)}</Text>
          {c.pastCountWit}
        </Text>
      )}
    </>
  );

  const pastHasAny = byTab.past.length > 0;
  const emptyText = tab === 'upcoming' ? c.empty.upcoming : tab === 'active' ? c.empty.active : c.empty.past;
  const showEmpty = list.length === 0 && missed.length === 0 && !(tab === 'upcoming' && hero);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ONE fixed sibling before the list (Fabric/Android flex bug). */}
      <View style={s.top}>
        <Text style={s.title}>{c.title}</Text>
        <Text style={s.sub}>{c.sub}</Text>
        <View style={s.tabs}>
          {([
            ['upcoming', c.tabs.upcoming(byTab.upcoming.length)],
            ['active', c.tabs.active(byTab.active.length)],
            ['past', c.tabs.past],
          ] as [RentalsTab, string][]).map(([id, label]) => (
            <PressScale key={id} style={[s.tab, tab === id && s.tabOn]} onPress={() => setTab(id)}>
              <Text style={[s.tabText, tab === id && s.tabTextOn]}>{label}</Text>
            </PressScale>
          ))}
        </View>
        {tab === 'past' && pastHasAny && (
          <View style={s.filters}>
            {(['returned', 'cancelled', 'all'] as PastFilter[]).map(f => (
              <PressScale key={f} style={[s.filter, pastFilter === f && s.filterOn]} onPress={() => setPastFilter(f)}>
                <Text style={[s.filterText, pastFilter === f && s.filterTextOn]}>{c.pastFilters[f]}</Text>
              </PressScale>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          key={tab}
          data={list}
          keyExtractor={e => e.key}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={showEmpty ? (
            failed ? <Text style={[UI.errorText, s.error]}>{c.loadError}</Text>
            : <RentalsEmpty
                text={emptyText}
                onExplore={tab === 'upcoming' ? () => router.push('/(tabs)/explore') : undefined}
              />
          ) : null}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SHADES.amber} colors={[SHADES.amber]} />}
        />
      )}

      <OrderSheet
        entry={order}
        onClose={() => setOrder(null)}
        onOpenQR={(value, label) => setQr({ value, label })}
        onCancel={cancelOrder}
        reviewPoints={reviewPoints}
      />
      {qr && <QRLightbox value={qr.value} label={qr.label} onClose={() => setQr(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  top: { flexShrink: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: SHADES.carbon, lineHeight: 28 },
  sub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2, lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tab: {
    height: 34, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  tabOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  tabText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  tabTextOn: { color: SHADES.white },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filter: {
    height: 30, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  filterOn: { backgroundColor: SHADES.amberLight, borderColor: SHADES.amberLight },
  filterText: { fontSize: 12, fontWeight: '600', color: SHADES.carbon },
  filterTextOn: { color: SHADES.amberDeep },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 },
  countLine: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 10 },
  countStrong: { fontWeight: '800', color: SHADES.carbon },
  error: { textAlign: 'center', marginTop: 40 },
});
