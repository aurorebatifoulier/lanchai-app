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
import { getMyReservations, cancelReservations, getProducts, type RentalDoc } from '@/lib/firestore';
import { cached, HOME_TTL } from '@/lib/homeCache';
import { sendNotif } from '@/lib/notifications';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { DEFAULT_REVIEW_REWARD_POINTS } from '@/lib/loyalty';
import {
  type RentalsTab, type PastFilter, type RentalEntry,
  tabOf, groupEntries, matchesPastFilter, heroEntry, isPickupPassed, withProductImages,
} from '@/lib/rentalsList';
import {
  NextPickupHero, UpcomingCard, MissedPickupCard, ActiveCard, PastCard, RentalsEmpty, clearReviewCache,
} from '@/components/rentals/RentalCards';
import { OrderSheet } from '@/components/rentals/OrderSheet';

// "My rentals" tab (validated mockup, 2026-11-02) — Upcoming (carbon "Next pick-up" card
// + countdown cards), Active (due-back countdown, Extend, calm late card with "I'm on my
// way"), Past (Returned / Cancelled / All). One card per order; a multi-item card opens
// the order sheet. Pure picks in lib/rentalsList.ts, cards in components/rentals/.

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
      // cache — the catalogue failing to load only costs the fallback photos).
      const [data, products] = await Promise.all([
        getMyReservations(user.uid),
        cached('products', HOME_TTL.products, getProducts).catch(() => []),
      ]);
      const imageOf = new Map<string, string>();
      for (const p of products) if (p.images?.[0]) imageOf.set(p.id, p.images[0]);
      setRentals(withProductImages(data, imageOf));
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

  // Upcoming: "Pick-up missed?" cards first (pick-up time passed, no hand-over — in the
  // list header, above the carbon card), then the future pick-ups. A passed pick-up is
  // never "Today" nor the hero.
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
      {missed.map(e => (
        <Reanimated.View key={e.key} entering={ENTER}>
          <MissedPickupCard entry={e} onOpenOrder={setOrder} />
        </Reanimated.View>
      ))}
      {tab === 'upcoming' && hero && (
        <Reanimated.View entering={ENTER}>
          <NextPickupHero entry={hero} onOpenOrder={setOrder} onOpenQR={(value, label) => setQr({ value, label })} />
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
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: SHADES.carbon, lineHeight: 33 },
  sub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tab: {
    height: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  tabOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  tabText: { fontSize: 14, fontWeight: '700', color: SHADES.carbon },
  tabTextOn: { color: SHADES.white },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filter: {
    height: 32, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  filterOn: { backgroundColor: SHADES.amberLight, borderColor: SHADES.amberLight },
  filterText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  filterTextOn: { color: SHADES.amberDeep },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 },
  countLine: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 12 },
  countStrong: { fontWeight: '800', color: SHADES.carbon },
  error: { textAlign: 'center', marginTop: 40 },
});
