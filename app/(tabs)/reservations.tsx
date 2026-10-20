import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { QRThumb } from '@/components/QRThumb';
import { QRLightbox } from '@/components/QRLightbox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { cancelTier as getCancelTier, cancellationOutcome, type CancelTier } from '@/functions/src/shared/cancellation';
import { useAuth } from '@/contexts/AuthContext';
import { getMyReservations, cancelReservations, RentalDoc } from '@/lib/firestore';
import { overdueSeverity, overdueLabel, overdueChipColors, renterLateFeeText } from '@/utils/overdue';
import { sendNotif } from '@/lib/notifications';
import DateFilterSheet from '@/components/DateFilterSheet';
import {
  DateFilterState,
  DateFieldOption,
  DEFAULT_DATE_FILTER,
  isDateFilterActive,
  getDateFieldValue,
  compareByDateField,
} from '@/lib/dateFilterConfig';

const DATE_FIELD_OPTIONS: DateFieldOption[] = [
  { id: 'pickupAt',   label: 'Pick-up date' },
  { id: 'returnAt',   label: 'Return date' },
  { id: 'returnedAt', label: 'Returned on' },
];

// ── Types ────────────────────────────────────────────────────────────────────

type TabId = 'upcoming' | 'active' | 'history' | 'cancelled';

const TABS: { id: TabId; label: string }[] = [
  { id: 'upcoming',  label: 'Upcoming'  },
  { id: 'active',    label: 'Active'    },
  { id: 'history',   label: 'History'   },
  { id: 'cancelled', label: 'Cancelled' },
];

type RenderEntry =
  | { type: 'single'; key: string; rental: RentalDoc }
  | { type: 'group';  key: string; orderId: string; items: RentalDoc[] };

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCategory(r: RentalDoc, now: number): TabId {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'returned')  return 'history';
  if (r.status === 'active')    return 'active';
  const pickup = r.pickupAt.toDate().getTime();
  const ret    = r.returnAt.toDate().getTime();
  if (ret < now)     return 'history';
  if (pickup <= now) return 'active';
  return 'upcoming';
}

interface Badge { label: string; color: string; bg: string }

function getBadge(r: RentalDoc, cat: TabId): Badge {
  if (r.status === 'cancelled') {
    return { label: 'Cancelled', color: COLORS.fg3, bg: COLORS.softGray200 };
  }
  if (cat === 'history') {
    return { label: 'Returned', color: COLORS.fg3, bg: COLORS.warmBeige };
  }
  if (cat === 'active') {
    return { label: 'Active', color: COLORS.success, bg: 'rgba(46,139,87,0.1)' };
  }
  if (r.status === 'pending_payment') {
    return { label: 'Pending payment at pick-up', color: '#854F0B', bg: '#FBE8C4' };
  }
  return { label: 'Confirmed', color: COLORS.success, bg: 'rgba(46,139,87,0.1)' };
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [rentals,        setRentals]        = useState<RentalDoc[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [activeTab,      setActiveTab]      = useState<TabId>('upcoming');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [qrLightbox,     setQrLightbox]     = useState<{ value: string; label: string } | null>(null);
  const [dateFilter,        setDateFilter]        = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [pendingDateFilter, setPendingDateFilter]  = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [dateSheetVisible,  setDateSheetVisible]   = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getMyReservations(user.uid);
      setRentals(data);
      const now  = Date.now();
      const cats = data.map(r => getCategory(r, now));
      const order: TabId[] = ['upcoming', 'active', 'history', 'cancelled'];
      const firstFilled = order.find(t => cats.includes(t));
      if (firstFilled) setActiveTab(firstFilled);
    } catch {
      // keep empty list
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleCancelOrder = useCallback(async (
    orderId: string,
    cancellableItems: RentalDoc[],
  ) => {
    await cancelReservations(cancellableItems.map(r => r.id));
    if (cancellableItems.length > 0) {
      sendNotif(cancellableItems[0].renterId, {
        type:      'rental',
        icon:      'x-circle',
        iconColor: COLORS.fg3,
        title:     'Order cancelled',
        body:      `Your order (${cancellableItems.length} item${cancellableItems.length !== 1 ? 's' : ''}) has been cancelled.`,
        deepLink:  '/(tabs)/reservations',
      });
    }
    await load();
  }, [load]);

  const toggleGroup = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  // ── Categorise + sort ─────────────────────────────────────────────────────
  const now = Date.now();

  const categorised = rentals.map(r => ({ r, cat: getCategory(r, now) }));

  const forTab = (tab: TabId) => {
    const items = categorised.filter(({ cat }) => cat === tab).map(({ r }) => r);
    if (dateFilter.sortDir != null) {
      const sortDir = dateFilter.sortDir;
      return [...items].sort((a, b) =>
        compareByDateField(getDateFieldValue(a, dateFilter.field), getDateFieldValue(b, dateFilter.field), sortDir),
      );
    }
    return [...items].sort((a, b) => {
      if (tab === 'history' || tab === 'cancelled') {
        return b.returnAt.toDate().getTime() - a.returnAt.toDate().getTime();
      }
      return a.pickupAt.toDate().getTime() - b.pickupAt.toDate().getTime();
    });
  };

  const tabItems = forTab(activeTab);

  const counts: Record<TabId, number> = {
    upcoming:  forTab('upcoming').length,
    active:    forTab('active').length,
    history:   forTab('history').length,
    cancelled: forTab('cancelled').length,
  };

  // ── Group by orderId ──────────────────────────────────────────────────────
  const renderEntries: RenderEntry[] = (() => {
    const grouped  = new Map<string, RentalDoc[]>();
    const singles: RentalDoc[] = [];

    tabItems.forEach(r => {
      if (r.orderId) {
        const g = grouped.get(r.orderId) ?? [];
        g.push(r);
        grouped.set(r.orderId, g);
      } else {
        singles.push(r);
      }
    });

    const entries: RenderEntry[] = [];
    singles.forEach(r => entries.push({ type: 'single', key: r.id, rental: r }));
    grouped.forEach((items, orderId) => {
      if (items.length === 1) {
        entries.push({ type: 'single', key: items[0].id, rental: items[0] });
      } else {
        entries.push({ type: 'group', key: orderId, orderId, items });
      }
    });
    return entries;
  })();

  // ── Empty state per tab ───────────────────────────────────────────────────
  const emptyConfig: Record<TabId, { icon: string; title: string; sub: string }> = {
    upcoming: {
      icon:  'calendar',
      title: 'Nothing booked yet',
      sub:   'Owning is overrated. Go grab something.',
    },
    active: {
      icon:  'clock',
      title: 'No active rentals',
      sub:   'Nothing in your hands right now — let\'s fix that.',
    },
    history: {
      icon:  'archive',
      title: 'No past rentals yet',
      sub:   'Your rental story starts with the first one.',
    },
    cancelled: {
      icon:  'x-circle',
      title: 'No cancelled rentals',
      sub:   'All good — nothing cancelled here.',
    },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* flexShrink:0 wrapper — required by Fabric/Android: multiple fixed siblings before a FlatList
          must be grouped into one View or the list starts at the wrong offset */}
      <View style={{ flexShrink: 0 }}>
        {/* ── Header ── */}
        <View style={[s.header, s.headerRow]}>
          <Text style={s.title}>My rentals</Text>
          <TouchableOpacity
            style={s.dateFilterBtn}
            onPress={() => { setPendingDateFilter(dateFilter); setDateSheetVisible(true); }}
            activeOpacity={0.75}
          >
            <Feather name="sliders" size={17} color={COLORS.carbon} />
            {isDateFilterActive(dateFilter) && <View style={s.dateFilterDot} />}
          </TouchableOpacity>
        </View>

        {/* ── Tab selector ── */}
        <View style={s.tabRow}>
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[s.tab, active && s.tabActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.75}
                focusable={false}
              >
                <Text style={[s.tabText, active && s.tabTextActive]}>
                  {tab.label} · {counts[tab.id]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={renderEntries}
          keyExtractor={entry => entry.key}
          renderItem={({ item: entry }) => {
            if (entry.type === 'group') {
              return (
                <OrderGroupCard
                  orderId={entry.orderId}
                  items={entry.items}
                  now={now}
                  expanded={expandedOrders.has(entry.orderId)}
                  onToggle={() => toggleGroup(entry.orderId)}
                  onItemPress={id => router.push(`/rentals/${id}`)}
                  onCancelOrder={handleCancelOrder}
                  onOpenQR={(value, label) => setQrLightbox({ value, label })}
                />
              );
            }
            return (
              <RentalCard
                rental={entry.rental}
                cat={getCategory(entry.rental, now)}
                onPress={() => router.push(`/rentals/${entry.rental.id}`)}
              />
            );
          }}
          contentContainerStyle={[
            s.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.amber}
              colors={[COLORS.amber]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={emptyConfig[activeTab].icon as any}
              title={emptyConfig[activeTab].title}
              sub={emptyConfig[activeTab].sub}
              onExplore={() => router.push('/(tabs)/explore')}
            />
          }
        />
      )}

      {/* ── QR lightbox — outside FlatList to cover the full screen ── */}
      {qrLightbox && (
        <QRLightbox
          value={qrLightbox.value}
          label={qrLightbox.label}
          onClose={() => setQrLightbox(null)}
        />
      )}

      <DateFilterSheet
        visible={dateSheetVisible}
        title="Sort & filter"
        fieldOptions={DATE_FIELD_OPTIONS}
        pending={pendingDateFilter}
        onChange={setPendingDateFilter}
        onClose={() => setDateSheetVisible(false)}
        onApply={() => { setDateFilter(pendingDateFilter); setDateSheetVisible(false); }}
      />
    </View>
  );
}

// ── Order group card ──────────────────────────────────────────────────────────

function OrderGroupCard({
  orderId, items, now, expanded, onToggle, onItemPress, onCancelOrder, onOpenQR,
}: {
  orderId:       string;
  items:         RentalDoc[];
  now:           number;
  expanded:      boolean;
  onToggle:      () => void;
  onItemPress:   (id: string) => void;
  onCancelOrder: (orderId: string, cancellableItems: RentalDoc[]) => Promise<void>;
  onOpenQR:      (value: string, label: string) => void;
}) {
  const [cancelPhase,  setCancelPhase]  = useState<'idle' | 'confirm' | 'terms'>('idle');
  const [cancelAgreed, setCancelAgreed] = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [cancelError,  setCancelError]  = useState<string | null>(null);

  const firstItem    = items[0];
  const cat          = getCategory(firstItem, now);
  const badge        = getBadge(firstItem, cat);
  const totalFees    = items.reduce((sum, r) => sum + r.total, 0);
  const totalDeposit = items.reduce((sum, r) => sum + r.deposit, 0);
  const depositPaid  = items.some(r => r.status !== 'pending_payment');

  const cancellableItems = items.filter(
    r => (r.status === 'pending_payment' || r.status === 'confirmed') &&
         r.pickupAt.toDate().getTime() > now,
  );
  const isCancellable = cancellableItems.length > 0;

  // Show the order QR when at least one item still needs pickup
  const showOrderQR = items.some(
    r => r.status === 'pending_payment' || r.status === 'confirmed' || r.status === 'active',
  );

  const itemTiers = cancellableItems.map(r =>
    getCancelTier((r.pickupAt.toDate().getTime() - now) / (1000 * 60 * 60)),
  );
  const groupTier: CancelTier = itemTiers.includes('no_refund') ? 'no_refund'
    : itemTiers.includes('voucher') ? 'voucher'
    : itemTiers.includes('premium') ? 'premium'
    : 'free';
  const tiersAreMixed = new Set(itemTiers).size > 1;
  // Nothing is charged before pick-up today → no money warnings. The tier flow below
  // only applies if an item ever carries an advance (advancePaidLak > 0).
  const nothingToPay = cancellableItems.every(r => cancellationOutcome({
    advancePaidLak: r.advancePaidLak,
    hoursUntilPickup: (r.pickupAt.toDate().getTime() - now) / (1000 * 60 * 60),
  }).kind === 'nothing_to_pay');

  const handleDoCancel = async () => {
    if (cancelling || !isCancellable) return;
    if (cancelPhase === 'terms' && !cancelAgreed) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await onCancelOrder(orderId, cancellableItems);
      setCancelPhase('idle');
      setCancelAgreed(false);
    } catch {
      setCancelError('Could not cancel. Please try again.');
      setCancelling(false);
    }
  };

  return (
    <View style={s.groupCard}>
      {/* Header row */}
      <TouchableOpacity style={s.groupHeader} onPress={onToggle} activeOpacity={0.75}>
        <View style={s.groupHeaderLeft}>
          <Text style={s.groupTitle}>Order · {items.length} items</Text>
        </View>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.fg3} />
      </TouchableOpacity>

      {/* Expanded items */}
      {expanded && (
        <>
          <View style={s.cardDivider} />

          {/* Order-level QR — shown when at least one item still needs pickup */}
          {showOrderQR && (
            <View style={s.orderQRRow}>
              <View style={s.orderQRLeft}>
                <Text style={s.orderQRTitle}>Order QR</Text>
                <Text style={s.orderQRHint}>Show this at pick-up for the whole order</Text>
              </View>
              <QRThumb
                value={`LANCHAI-ORDER:${orderId}`}
                size={80}
                variant="order"
                onPress={() => onOpenQR(`LANCHAI-ORDER:${orderId}`, `Order · ${items.length} items`)}
              />
            </View>
          )}

          {items.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <View style={s.groupItemSep} />}
              <TouchableOpacity
                style={s.groupItemRow}
                onPress={() => onItemPress(item.id)}
                activeOpacity={0.75}
              >
                <View style={s.groupItemInfo}>
                  <Text style={s.groupItemName} numberOfLines={1}>{item.productName}</Text>
                  <View style={s.groupItemDateRow}>
                    <Feather name="calendar" size={11} color={COLORS.fg3} />
                    <Text style={s.groupItemDateText} numberOfLines={1}>
                      {item.pickupLabel} → {item.returnLabel}
                    </Text>
                  </View>
                  <Text style={s.groupItemSub}>
                    {item.durationDays} day{item.durationDays !== 1 ? 's' : ''}
                    {' · '}
                    {item.quantity} unit{item.quantity !== 1 ? 's' : ''}
                    {' · '}
                    {item.total.toLocaleString('en-US')} LAK
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={COLORS.fg3} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
          <View style={s.cardDivider} />
          <View style={s.groupFooter}>
            {depositPaid ? (
              <Text style={s.groupFooterText}>
                Total{' '}
                <Text style={s.groupFooterAmount}>{totalFees.toLocaleString('en-US')} LAK</Text>
                {'  ·  Deposit '}
                <Text style={s.groupFooterAmount}>{totalDeposit.toLocaleString('en-US')} LAK</Text>
                {' paid in store'}
              </Text>
            ) : (
              <Text style={s.groupFooterText}>
                Total{' '}
                <Text style={s.groupFooterAmount}>{totalFees.toLocaleString('en-US')} LAK</Text>
                {'  ·  Deposit collected at pick-up'}
              </Text>
            )}
          </View>

          {/* ── Cancel order ── */}
          {isCancellable && (
            <View style={s.groupCancelSection}>
              {cancelError && (
                <View style={s.cancelErrorBox}>
                  <Feather name="alert-circle" size={13} color={COLORS.danger} />
                  <Text style={s.cancelErrorText}>{cancelError}</Text>
                </View>
              )}

              {cancelPhase === 'idle' && (
                <TouchableOpacity
                  style={s.cancelLink}
                  onPress={() => setCancelPhase(nothingToPay || groupTier === 'free' ? 'confirm' : 'terms')}
                  activeOpacity={0.7}
                >
                  <Feather name="x-circle" size={13} color={COLORS.danger} />
                  <Text style={s.cancelLinkText}>
                    Cancel {cancellableItems.length} item{cancellableItems.length !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              )}

              {cancelPhase === 'confirm' && (
                <View style={s.cancelCard}>
                  <Text style={s.cancelCardTitle}>Cancel this order?</Text>
                  <Text style={s.cancelCardBody}>
                    {nothingToPay
                      ? 'Nothing to pay — nothing is charged before pick-up. You can book again anytime.'
                      : 'Free cancellation — all items are more than 48 hours before pickup. No charges apply.'}
                  </Text>
                  <View style={s.cancelBtnRow}>
                    <TouchableOpacity style={s.cancelKeepBtn} onPress={() => setCancelPhase('idle')} activeOpacity={0.8}>
                      <Text style={s.cancelKeepText}>Keep it</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.cancelConfirmBtn, cancelling && s.cancelBtnOff]}
                      onPress={handleDoCancel}
                      disabled={cancelling}
                      activeOpacity={0.8}
                    >
                      {cancelling
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.cancelConfirmText}>Cancel order</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {cancelPhase === 'terms' && (
                <View style={s.cancelCard}>
                  <View style={s.cancelWarningRow}>
                    <Feather
                      name={groupTier === 'premium' ? 'info' : 'alert-triangle'}
                      size={13}
                      color={
                        groupTier === 'no_refund' ? COLORS.danger
                        : groupTier === 'premium'  ? COLORS.fg2
                        : '#854F0B'
                      }
                    />
                    <Text style={[
                      s.cancelWarningTitle,
                      groupTier === 'no_refund' && { color: COLORS.danger },
                    ]}>
                      {groupTier === 'voucher'  ? 'No cash refund — store credit applies'
                      : groupTier === 'premium' ? 'Non-refundable — premium equipment'
                      : 'No refund or voucher'}
                    </Text>
                  </View>
                  {/* Per-tier breakdown when items have different pickup windows */}
                  {tiersAreMixed ? (
                    <>
                      <Text style={s.cancelCardBody}>
                        Items in this order have different pickup times and are subject to different conditions:
                      </Text>
                      {(['no_refund', 'voucher', 'free'] as CancelTier[])
                        .filter(t => itemTiers.includes(t))
                        .map(t => {
                          const count = itemTiers.filter(x => x === t).length;
                          const label = t === 'no_refund'
                            ? `${count} item${count !== 1 ? 's' : ''} <24h before pickup — advance retained, no refund or voucher.`
                            : t === 'voucher'
                            ? `${count} item${count !== 1 ? 's' : ''} 24–48h before pickup — store credit voucher (valid 6 months).`
                            : `${count} item${count !== 1 ? 's' : ''} >48h before pickup — full refund.`;
                          return (
                            <View key={t} style={s.cancelBulletRow}>
                              <Text style={s.cancelBullet}>·</Text>
                              <Text style={s.cancelBulletText}>{label}</Text>
                            </View>
                          );
                        })}
                    </>
                  ) : groupTier === 'premium' ? (
                    <Text style={s.cancelCardBody}>
                      This order contains premium items. Per cancellation policy, the advance payment
                      is non-refundable regardless of cancellation date. No refund or store credit applies.
                    </Text>
                  ) : groupTier === 'voucher' ? (
                    <Text style={s.cancelCardBody}>
                      All items are 24–48 hours before pickup. No cash refund applies — a store
                      credit voucher (valid 6 months, non-transferable) will be issued for each item.
                    </Text>
                  ) : (
                    <Text style={s.cancelCardBody}>
                      All items are less than 24 hours before pickup. No refund or store credit
                      applies — the advance payment is retained by LANCHAI.
                    </Text>
                  )}
                  <TouchableOpacity
                    style={s.cancelAgreeRow}
                    onPress={() => setCancelAgreed(v => !v)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.cancelCheckbox, cancelAgreed && s.cancelCheckboxChecked]}>
                      {cancelAgreed && <Feather name="check" size={11} color={COLORS.carbon} />}
                    </View>
                    <Text style={s.cancelAgreeText}>
                      I have read and accept the cancellation terms
                    </Text>
                  </TouchableOpacity>
                  <View style={s.cancelBtnRow}>
                    <TouchableOpacity
                      style={s.cancelKeepBtn}
                      onPress={() => { setCancelPhase('idle'); setCancelAgreed(false); }}
                      activeOpacity={0.8}
                    >
                      <Text style={s.cancelKeepText}>Keep it</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.cancelConfirmBtn, (!cancelAgreed || cancelling) && s.cancelBtnOff]}
                      onPress={handleDoCancel}
                      disabled={!cancelAgreed || cancelling}
                      activeOpacity={0.8}
                    >
                      {cancelling
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.cancelConfirmText}>Cancel order</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Rental card ──────────────────────────────────────────────────────────────

function RentalCard({
  rental, cat, onPress,
}: { rental: RentalDoc; cat: TabId; onPress: () => void }) {
  const badge = getBadge(rental, cat);
  const isOverdue = cat === 'active' && rental.returnAt.toDate().getTime() < Date.now();
  const sev = isOverdue ? overdueSeverity(rental.returnAt) : null;

  return (
    <TouchableOpacity
      style={[s.card, isOverdue && { backgroundColor: '#FFF8F8', borderColor: '#FCA5A5' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Top row */}
      <View style={s.cardTop}>
        <Text style={s.cardName} numberOfLines={1}>{rental.productName}</Text>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      {/* Overdue chip + penalty hint */}
      {isOverdue && sev && (() => {
        const { bg, border: bdr, fg: txt } = overdueChipColors(sev);
        return (
          <View style={s.overdueRow}>
            <View style={[s.overdueChip, { backgroundColor: bg, borderColor: bdr }]}>
              <Text style={[s.overdueChipText, { color: txt }]}>{overdueLabel(rental.returnAt)}</Text>
            </View>
            {(rental.latePenaltyAmount ?? 0) > 0 && (
              <Text style={s.penaltyHint}>
                {renterLateFeeText(rental.latePenaltyAmount!, rental.latePenaltyDays)}
              </Text>
            )}
          </View>
        );
      })()}

      {/* Dates */}
      <View style={s.cardDateRow}>
        <Feather name="calendar" size={13} color={COLORS.fg3} />
        <Text style={s.cardDateText} numberOfLines={1}>
          {rental.pickupLabel} → {rental.returnLabel}
        </Text>
      </View>

      {/* Duration / qty */}
      <Text style={s.cardSub}>
        {rental.durationDays === 1 ? '1 day (24h)' : `${rental.durationDays} days`}
        {' · '}
        {rental.quantity} unit{rental.quantity !== 1 ? 's' : ''}
      </Text>

      {/* Divider + footer */}
      <View style={s.cardDivider} />
      <View style={s.cardFooter}>
        <Text style={s.cardFooterText}>
          Paid{' '}
          <Text style={s.cardFooterAmount}>{rental.total.toLocaleString('en-US')} LAK</Text>
          {'  ·  Deposit '}
          <Text style={s.cardFooterAmount}>{rental.deposit.toLocaleString('en-US')} LAK</Text>
          {' in store'}
        </Text>
        <Feather name="chevron-right" size={16} color={COLORS.fg3} />
      </View>
    </TouchableOpacity>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  icon, title, sub, onExplore,
}: { icon: React.ComponentProps<typeof Feather>['name']; title: string; sub: string; onExplore: () => void }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIconBox}>
        <Feather name={icon} size={28} color={COLORS.fg3} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={onExplore} activeOpacity={0.85}>
        <Text style={s.emptyBtnText}>Explore items</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFilterBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  dateFilterDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.amber,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.carbon,
  },

  // Tab selector
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: COLORS.carbon,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
  },
  tabTextActive: {
    color: COLORS.white,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Order QR row (in expanded group card)
  orderQRRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.warmBeige,
  },
  orderQRLeft: {
    flex: 1,
    gap: 3,
  },
  orderQRTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  orderQRHint: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.fg3,
  },

  // Shared badge
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Shared divider
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
  },

  // Single rental card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  cardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardDateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardFooterText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    flex: 1,
  },
  cardFooterAmount: {
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Group card
  groupCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    marginBottom: 10,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  groupHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  groupItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  groupItemSep: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginLeft: 14,
  },
  groupItemInfo: {
    flex: 1,
    gap: 2,
  },
  groupItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  groupItemDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  groupItemDateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  groupItemSub: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
  },
  groupFooter: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  groupFooterText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
  },
  groupFooterAmount: {
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Cancel UI (shared between OrderGroupCard and future uses)
  groupCancelSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 14,
  },
  cancelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  cancelLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  cancelCard: {
    backgroundColor: COLORS.porcelain,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginVertical: 4,
  },
  cancelCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  cancelCardBody: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 17,
  },
  cancelBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  cancelBullet: {
    fontSize: 13,
    color: COLORS.fg3,
    lineHeight: 17,
  },
  cancelBulletText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 17,
  },
  cancelWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelWarningTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#854F0B',
  },
  cancelAgreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cancelCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  cancelCheckboxChecked: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  cancelAgreeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg2,
    lineHeight: 17,
  },
  cancelBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelKeepBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  cancelKeepText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  cancelConfirmBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnOff: {
    backgroundColor: COLORS.softGray200,
  },
  cancelConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  cancelErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  cancelErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyBtn: {
    height: 46,
    paddingHorizontal: 24,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // Overdue chip (in RentalCard)
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  overdueChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overdueChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  penaltyHint: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.danger,
    flexShrink: 1,
  },
});
