import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import type { ClaimStatus } from '@/lib/claims';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';

interface HubCard {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  title: string;
  sub: string;
  route: '/admin/products' | '/admin/reservations' | '/admin/broadcast' | '/admin/reviews' | '/admin/calendar' | '/admin/exchange-rate' | '/admin/loyalty' | '/admin/verifications' | '/admin/claims' | '/admin/inventory' | '/admin/shop-settings' | '/admin/collections' | '/admin/home-slides' | '/admin/search-vocabulary' | '/admin/promo-codes' | '/admin/saved-replies';
}

const CARDS: HubCard[] = [
  {
    icon: 'package',
    iconBg: COLORS.amber,
    title: 'Products',
    sub: 'Manage your rental catalogue',
    route: '/admin/products',
  },
  {
    icon: 'file-text',
    iconBg: COLORS.warmBeige,
    title: 'Reservations',
    sub: 'View and manage bookings',
    route: '/admin/reservations',
  },
  {
    icon: 'search',
    iconBg: COLORS.warmBeige,
    title: 'Search vocabulary',
    sub: 'Related words the app search understands',
    route: '/admin/search-vocabulary',
  },
  {
    icon: 'image',
    iconBg: COLORS.warmBeige,
    title: 'Home slides',
    sub: 'Hero carousel and mid-page banner photos',
    route: '/admin/home-slides',
  },
  {
    icon: 'layers',
    iconBg: COLORS.warmBeige,
    title: 'Collections',
    sub: 'Home "Got plans?" occasion picks',
    route: '/admin/collections',
  },
  {
    icon: 'message-square',
    iconBg: COLORS.warmBeige,
    title: 'Saved replies',
    sub: 'Quick answers for the chat',
    route: '/admin/saved-replies',
  },
  {
    icon: 'tag',
    iconBg: COLORS.warmBeige,
    title: 'Promo codes',
    sub: 'Discount codes for campaigns and partners',
    route: '/admin/promo-codes',
  },
  {
    icon: 'radio',
    iconBg: COLORS.warmBeige,
    title: 'Broadcast',
    sub: 'Send news & announcements',
    route: '/admin/broadcast',
  },
  {
    icon: 'star',
    iconBg: COLORS.warmBeige,
    title: 'Reviews',
    sub: 'Read and reply to customer reviews',
    route: '/admin/reviews',
  },
  {
    icon: 'calendar',
    iconBg: COLORS.warmBeige,
    title: 'Calendar',
    sub: 'Pickups, returns, and scheduled tasks',
    route: '/admin/calendar',
  },
  {
    icon: 'dollar-sign',
    iconBg: COLORS.warmBeige,
    title: 'Exchange rate',
    sub: 'USD → LAK conversion rate',
    route: '/admin/exchange-rate',
  },
  {
    icon: 'shopping-bag',
    iconBg: COLORS.warmBeige,
    title: 'Shop settings',
    sub: 'Address, hours, pick-up slots, WhatsApp, late returns',
    route: '/admin/shop-settings',
  },
  {
    icon: 'award',
    iconBg: COLORS.warmBeige,
    title: 'Loyalty',
    sub: 'Tiers, points, and coupon rewards',
    route: '/admin/loyalty',
  },
  {
    icon: 'shield',
    iconBg: COLORS.warmBeige,
    title: 'Verifications',
    sub: 'ID documents, residency and business accounts',
    route: '/admin/verifications',
  },
  {
    icon: 'flag',
    iconBg: COLORS.warmBeige,
    title: 'Claims',
    sub: 'Review customer disputes and issues',
    route: '/admin/claims',
  },
  {
    icon: 'bar-chart-2',
    iconBg: COLORS.warmBeige,
    title: 'Inventory',
    sub: 'Live stock overview by status, per product',
    route: '/admin/inventory',
  },
];

export default function AdminHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [overdueCount, setOverdueCount] = useState(0);
  const [pendingBtobCount, setPendingBtobCount] = useState(0);
  const [openClaimsCount, setOpenClaimsCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getDocs(query(collection(db, 'reservations'), where('status', '==', 'active')))
        .then(snap => {
          const now = Date.now();
          const count = snap.docs.filter(d => {
            const returnAt = d.data().returnAt as Timestamp | undefined;
            return returnAt != null && returnAt.toMillis() < now;
          }).length;
          setOverdueCount(count);
        })
        .catch(() => {});

      // Verifications badge: pending business accounts + pending residency requests.
      Promise.all([
        getDocs(query(collection(db, 'users'), where('btobStatus', '==', 'pending_approval'))).then(s => s.size).catch(() => 0),
        getDocs(query(collection(db, 'residencyRequests'), where('status', '==', 'pending'))).then(s => s.size).catch(() => 0),
      ]).then(([btob, residency]) => setPendingBtobCount(btob + residency));

      // Single equality-adjacent filter — where('status','in',[...]) needs no composite
      // index on its own.
      getDocs(query(collection(db, 'claims'), where('status', 'in', ['open', 'in_review'] as ClaimStatus[])))
        .then(snap => setOpenClaimsCount(snap.size))
        .catch(() => {});
    }, []),
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Lanchai admin dashboard</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {CARDS.map(card => (
          <TouchableOpacity
            key={card.route}
            style={s.card}
            onPress={() => router.push(card.route)}
            activeOpacity={0.82}
          >
            <View style={[s.cardIconBox, { backgroundColor: card.iconBg }]}>
              <Feather name={card.icon} size={26} color={COLORS.carbon} />
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>{card.title}</Text>
              <Text style={s.cardSub}>{card.sub}</Text>
            </View>
            {card.route === '/admin/calendar' && overdueCount > 0 && (
              <View style={s.overdueBadge}>
                <Text style={s.overdueBadgeText}>{overdueCount > 9 ? '9+' : overdueCount}</Text>
              </View>
            )}
            {card.route === '/admin/verifications' && pendingBtobCount > 0 && (
              <View style={s.overdueBadge}>
                <Text style={s.overdueBadgeText}>{pendingBtobCount > 9 ? '9+' : pendingBtobCount}</Text>
              </View>
            )}
            {card.route === '/admin/claims' && openClaimsCount > 0 && (
              <View style={s.overdueBadge}>
                <Text style={s.overdueBadgeText}>{openClaimsCount > 9 ? '9+' : openClaimsCount}</Text>
              </View>
            )}
            <Feather name="chevron-right" size={18} color={COLORS.fg3} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: COLORS.fg3,
    marginBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 18,
    marginBottom: 14,
  },
  cardIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  overdueBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overdueBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },
});
