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
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { getReservations } from '@/lib/firestore';
import { Reservation } from '@/lib/mockData';

type TabId = 'active' | 'upcoming' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'History' },
];

export default function ReservationsScreen() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('active');

  useEffect(() => {
    getReservations().then(data => {
      setReservations(data);
      setLoading(false);
    });
  }, []);

  const filtered = reservations.filter(r => {
    if (activeTab === 'active') return r.status === 'active';
    if (activeTab === 'upcoming') return r.status === 'upcoming';
    return r.status === 'returned' || r.status === 'cancelled';
  });

  const activeCount = reservations.filter(r => r.status === 'active').length;
  const upcomingCount = reservations.filter(r => r.status === 'upcoming').length;
  const historyCount = reservations.filter(r => r.status === 'returned' || r.status === 'cancelled').length;

  const countMap: Record<TabId, number> = {
    active: activeCount,
    upcoming: upcomingCount,
    history: historyCount,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome back</Text>
        <Text style={styles.name}>My Rentals.</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardAmber]}>
          <Text style={styles.statEyebrow}>ACTIVE</Text>
          <Text style={styles.statValue}>{activeCount} rental{activeCount !== 1 ? 's' : ''}</Text>
          <Text style={styles.statSub}>Returns within 14 days</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEyebrow}>DEPOSITS HELD</Text>
          <Text style={styles.statValue}>
            {reservations.filter(r => r.status === 'active').reduce((s, r) => s + r.depositAmount, 0)}K
          </Text>
          <Text style={styles.statSub}>Refunded 48h after return</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label} · {countMap[tab.id]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <EmptyState onBrowse={() => router.push('/catalogue')} />
        ) : (
          filtered.map(res => (
            <ReservationCard key={res.id} reservation={res} />
          ))
        )}

        {/* Recently returned */}
        {activeTab === 'active' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently returned</Text>
            <TouchableOpacity style={styles.historyRow}>
              <View style={[styles.historyImg, { backgroundColor: COLORS.warmBeige }]}>
                <Feather name="zap" size={18} color={COLORS.carbon} />
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyName}>HD projector · Sony</Text>
                <Text style={styles.historySub}>Returned Apr 22 · Deposit refunded</Text>
              </View>
              <Text style={styles.historyAmount}>+500K</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyRow}>
              <View style={[styles.historyImg, { backgroundColor: COLORS.warmBeige }]}>
                <Feather name="user" size={18} color={COLORS.carbon} />
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyName}>Babyzen YOYO² stroller</Text>
                <Text style={styles.historySub}>Returned Mar 14 · 5-star left</Text>
              </View>
              <Text style={styles.historyAmount}>+400K</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReservationCard({ reservation }: { reservation: Reservation }) {
  const progress = reservation.daysTotal > 0 ? reservation.daysCurrent / reservation.daysTotal : 0;
  const bgColors: Record<string, string> = {
    amber: COLORS.amber,
    dark: COLORS.carbon,
    beige: COLORS.warmBeige,
    default: COLORS.warmBeige,
  };
  const imgBg = bgColors[reservation.cardBg] ?? COLORS.warmBeige;
  const iconColor = reservation.cardBg === 'dark' ? COLORS.amber : COLORS.carbon;
  const isActive = reservation.status === 'active';

  return (
    <View style={[styles.rentalCard, isActive && styles.rentalCardActive]}>
      {/* Top row */}
      <View style={styles.rentalTop}>
        <View style={[styles.rentalImg, { backgroundColor: imgBg }]}>
          <Feather name={reservation.productIcon as never} size={28} color={iconColor} />
        </View>
        <View style={styles.rentalInfo}>
          <Text style={styles.rentalName}>{reservation.productName}</Text>
          <Text style={styles.rentalSub}>
            Returns in {reservation.daysTotal - reservation.daysCurrent} days · <Text style={styles.rentalId}>{reservation.bookingId}</Text>
          </Text>
        </View>
        <View style={[styles.rentalChip, isActive && styles.rentalChipActive]}>
          <Text style={[styles.rentalChipText, isActive && styles.rentalChipTextActive]}>
            DAY {reservation.daysCurrent} / {reservation.daysTotal}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.progressLegend}>
          <Text style={styles.legendText}>Picked up {reservation.startDate.slice(5).replace('-', ' ')}</Text>
          <Text style={styles.legendText}>Return {reservation.endDate.slice(5).replace('-', ' ')}</Text>
        </View>
      </View>

      {/* Actions */}
      {isActive && (
        <View style={styles.rentalActions}>
          <TouchableOpacity style={styles.btnGhost}>
            <Text style={styles.btnGhostText}>Extend</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnDark}>
            <Feather name="maximize" size={12} color={COLORS.amber} style={{ marginRight: 6 }} />
            <Text style={styles.btnDarkText}>Return QR</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="file-text" size={32} color={COLORS.fg3} />
      </View>
      <Text style={styles.emptyTitle}>No reservations yet</Text>
      <Text style={styles.emptySub}>Browse our catalogue and rent your first item today.</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onBrowse}>
        <Text style={styles.emptyBtnText}>Browse catalogue</Text>
        <Feather name="arrow-right" size={14} color={COLORS.carbon} />
      </TouchableOpacity>
    </View>
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
    paddingBottom: 4,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.carbon,
    marginTop: 2,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  statCardAmber: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  statEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: 'rgba(30,30,30,0.6)',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.carbon,
    marginTop: 6,
    marginBottom: 2,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(30,30,30,0.7)',
  },
  // Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: COLORS.carbon,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.fg3,
  },
  tabTextActive: {
    color: COLORS.porcelain,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: 20,
  },
  // Rental card
  rentalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  rentalCardActive: {
    borderColor: COLORS.carbon,
  },
  rentalTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  rentalImg: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rentalInfo: {
    flex: 1,
  },
  rentalName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: COLORS.carbon,
  },
  rentalSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  rentalId: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  rentalChip: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rentalChipActive: {
    backgroundColor: COLORS.amber,
  },
  rentalChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  rentalChipTextActive: {
    color: COLORS.carbon,
  },
  // Progress
  progressWrap: {
    marginBottom: 14,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.amber,
    borderRadius: 3,
  },
  progressLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg3,
  },
  // Actions
  rentalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnGhost: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  btnDark: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLORS.carbon,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDarkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.porcelain,
  },
  // Section
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
    marginLeft: 2,
  },
  historyRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 8,
  },
  historyImg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  historySub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E8B57',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
    marginBottom: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    backgroundColor: COLORS.amber,
    borderRadius: 999,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});

