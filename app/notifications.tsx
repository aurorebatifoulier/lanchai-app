import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifType   = 'rental' | 'message' | 'promo' | 'system' | 'new_item' | 'announcement';
type NotifIcon   = 'clock' | 'check' | 'chat' | 'box' | 'star' | 'alert' | 'tag' | 'percent' | 'radio';
type NotifColor  = 'amber' | 'green' | 'blue' | 'coral' | 'carbon';
type FilterKey   = 'all' | 'rentals' | 'news';

interface NotificationItem {
  id:        string;
  type:      NotifType;
  title:     string;
  body:      string;
  icon:      NotifIcon;
  iconColor: NotifColor;
  deepLink?: string;
  createdAt: Timestamp;
  readAt:    Timestamp | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'rentals', label: 'Rentals' },
  { key: 'news',    label: 'News & offers' },
];

const ICON_NAME: Record<NotifIcon, string> = {
  clock:   'clock',
  check:   'check-circle',
  chat:    'message-circle',
  box:     'package',
  star:    'star',
  alert:   'alert-triangle',
  tag:     'tag',
  percent: 'percent',
  radio:   'radio',
};

const COLOR_CONFIG: Record<NotifColor, { bg: string; icon: string }> = {
  amber:  { bg: COLORS.notifAmberBg,  icon: COLORS.notifAmberIcon },
  green:  { bg: COLORS.notifGreenBg,  icon: COLORS.notifGreenIcon },
  blue:   { bg: COLORS.notifBlueBg,   icon: COLORS.notifBlueIcon },
  coral:  { bg: COLORS.notifCoralBg,  icon: COLORS.notifCoralIcon },
  carbon: { bg: COLORS.notifCarbonBg, icon: COLORS.carbon },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTimeBucket(ts: Timestamp): 'today' | 'yesterday' | 'earlier' {
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 86_400_000)  return 'today';
  if (diff < 172_800_000) return 'yesterday';
  return 'earlier';
}

function formatTimestamp(ts: Timestamp): string {
  const date  = ts.toDate();
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `Yesterday, ${hh}:${mm}`;
  }
  if (days < 7) return `${days} days ago`;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function getCtaLabel(type: NotifType): string {
  if (type === 'rental')      return 'See rental →';
  if (type === 'new_item')    return 'See item →';
  if (type === 'promo')       return 'See offer →';
  if (type === 'system' || type === 'announcement') return 'View →';
  return '';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [items,      setItems]      = useState<NotificationItem[]>([]);
  const [broadcasts, setBroadcasts] = useState<NotificationItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [bLoading,   setBLoading]   = useState(true);
  const [filter,     setFilter]     = useState<FilterKey>('all');

  // ── Real-time listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      snap => {
        setItems(snap.docs.map(d => {
          const data = d.data();
          return {
            id:        d.id,
            type:      (data.type      ?? 'system')  as NotifType,
            title:     data.title     ?? '',
            body:      data.body      ?? '',
            icon:      (data.icon      ?? 'alert')   as NotifIcon,
            iconColor: (data.iconColor ?? 'carbon')  as NotifColor,
            deepLink:  data.deepLink  ?? undefined,
            createdAt: data.createdAt as Timestamp,
            readAt:    data.readAt    ?? null,
          };
        }));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  // ── Broadcasts listener (shared across all users) ───────────────────────────
  useEffect(() => {
    if (!user) { setBLoading(false); return; }
    const q = query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setBroadcasts(snap.docs.map(d => {
          const data = d.data();
          return {
            id:        d.id,
            type:      (data.type      ?? 'announcement') as NotifType,
            title:     data.title     ?? '',
            body:      data.body      ?? '',
            icon:      (data.icon      ?? 'radio')        as NotifIcon,
            iconColor: (data.iconColor ?? 'blue')         as NotifColor,
            deepLink:  data.deepLink  ?? undefined,
            createdAt: data.createdAt as Timestamp,
            readAt:    new Timestamp(1, 0), // broadcasts are always "read" — no unread dot
          };
        }));
        setBLoading(false);
      },
      () => setBLoading(false),
    );
  }, [user]);

  // ── Merged + sorted stream ──────────────────────────────────────────────────
  const allItems = useMemo(() => {
    return [...items, ...broadcasts].sort((a, b) => {
      const aMs = a.createdAt?.toMillis() ?? 0;
      const bMs = b.createdAt?.toMillis() ?? 0;
      return bMs - aMs;
    });
  }, [items, broadcasts]);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'rentals') return allItems.filter(n => n.type === 'rental');
    if (filter === 'news')    return allItems.filter(n =>
      n.type === 'new_item' || n.type === 'promo' || n.type === 'announcement');
    return allItems;
  }, [allItems, filter]);

  // ── Time grouping ───────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const today:     NotificationItem[] = [];
    const yesterday: NotificationItem[] = [];
    const earlier:   NotificationItem[] = [];
    for (const n of filtered) {
      if (!n.createdAt) { earlier.push(n); continue; }
      const b = getTimeBucket(n.createdAt);
      if (b === 'today')          today.push(n);
      else if (b === 'yesterday') yesterday.push(n);
      else                        earlier.push(n);
    }
    const sections: { label: string; data: NotificationItem[] }[] = [];
    if (today.length)     sections.push({ label: 'Today',     data: today });
    if (yesterday.length) sections.push({ label: 'Yesterday', data: yesterday });
    if (earlier.length)   sections.push({ label: 'Earlier',   data: earlier });
    return sections;
  }, [filtered]);

  // ── Mark as read + navigate ─────────────────────────────────────────────────
  const handlePress = useCallback(async (item: NotificationItem) => {
    if (!user) return;
    if (!item.readAt) {
      updateDoc(
        doc(db, 'notifications', user.uid, 'items', item.id),
        { readAt: serverTimestamp() },
      ).catch(() => {});
    }
    if (item.deepLink) {
      router.push(item.deepLink as never);
    }
  }, [user, router]);

  // ── Mark all as read (currently visible tab only; broadcasts have no per-user
  // readAt doc to update, so they're excluded via the broadcastIds set) ────────
  const broadcastIds = useMemo(() => new Set(broadcasts.map(b => b.id)), [broadcasts]);
  const visibleUnreadIds = useMemo(
    () => filtered.filter(n => !n.readAt && !broadcastIds.has(n.id)).map(n => n.id),
    [filtered, broadcastIds],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!user || visibleUnreadIds.length === 0) return;
    const batch = writeBatch(db);
    visibleUnreadIds.forEach(id => {
      batch.update(doc(db, 'notifications', user.uid, 'items', id), { readAt: serverTimestamp() });
    });
    batch.commit().catch(() => {});
  }, [user, visibleUnreadIds]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Fixed top bar ──────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chipsScroll}
          contentContainerStyle={s.chipsRow}
        >
          {FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.chip, filter === opt.key && s.chipActive]}
              onPress={() => setFilter(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.chipText, filter === opt.key && s.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {visibleUnreadIds.length > 0 && (
          <View style={s.markAllRow}>
            <TouchableOpacity
              onPress={handleMarkAllRead}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <Text style={s.markAllText}>Mark all as read</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Scrollable list ─────────────────────────────────────────────── */}
      <ScrollView
        style={s.list}
        contentContainerStyle={[
          s.listContent,
          !(loading || bLoading) && filtered.length === 0 && s.listContentCenter,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading || bLoading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : filtered.length === 0 ? (
          <>
            <View style={s.emptyIconBox}>
              <Feather name="bell" size={32} color={COLORS.fg3} />
            </View>
            <Text style={s.emptyTitle}>No notifications yet</Text>
            <Text style={s.emptyBody}>You&apos;re all caught up!</Text>
          </>
        ) : (
          grouped.map(section => (
            <View key={section.label}>
              <Text style={s.sectionLabel}>{section.label}</Text>
              {section.data.map((item, i) => (
                <NotifRow
                  key={item.id}
                  item={item}
                  onPress={() => handlePress(item)}
                  isLast={i === section.data.length - 1}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── NotifRow ──────────────────────────────────────────────────────────────────

function NotifRow({
  item,
  onPress,
  isLast,
}: {
  item: NotificationItem;
  onPress: () => void;
  isLast: boolean;
}) {
  const isUnread = !item.readAt;
  const colors   = COLOR_CONFIG[item.iconColor] ?? COLOR_CONFIG.carbon;
  const iconName = ICON_NAME[item.icon] ?? 'bell';
  const ctaLabel = item.deepLink ? getCtaLabel(item.type) : null;

  return (
    <>
      <TouchableOpacity
        style={[s.row, isUnread && s.rowUnread]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Colored icon square */}
        <View style={[s.iconBox, { backgroundColor: colors.bg }]}>
          <Feather name={iconName as never} size={18} color={colors.icon} />
        </View>

        {/* Text block */}
        <View style={s.rowBody}>
          <View style={s.rowTitleRow}>
            <Text style={[s.rowTitle, isUnread && s.rowTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.rowTime}>
              {item.createdAt ? formatTimestamp(item.createdAt) : ''}
            </Text>
          </View>
          <Text style={s.rowBodyText} numberOfLines={2}>{item.body}</Text>
          {ctaLabel ? <Text style={s.rowCta}>{ctaLabel}</Text> : null}
        </View>

        {/* Unread amber dot */}
        {isUnread && <View style={s.unreadDot} />}
      </TouchableOpacity>

      {!isLast && <View style={s.sep} />}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.porcelain },
  topBar: { flexShrink: 0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0,
    textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  chipsScroll: { height: 44, flexShrink: 0 },
  chipsRow: {
    paddingHorizontal: 20, paddingBottom: 10,
    gap: 8, flexDirection: 'row', alignItems: 'center',
  },
  chip: {
    height: 32, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive:     { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText:       { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  chipTextActive: { color: COLORS.porcelain },

  markAllRow: { paddingHorizontal: 20, paddingBottom: 10, alignItems: 'flex-end' },
  markAllText: { fontSize: 12, fontWeight: '700', color: COLORS.amber },

  list:              { flex: 1 },
  listContent:       { paddingTop: 4, paddingBottom: 32 },
  listContentCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 0 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.fg3,
    letterSpacing: 0.2,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
    backgroundColor: COLORS.porcelain,
  },
  rowUnread: { backgroundColor: COLORS.notifUnreadBg },

  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  rowBody:    { flex: 1, gap: 3 },
  rowTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 8,
  },
  rowTitle:       { fontSize: 13.5, fontWeight: '500', color: COLORS.fg2, flex: 1, letterSpacing: -0.1 },
  rowTitleUnread: { fontWeight: '700', color: COLORS.carbon },
  rowTime:        { fontSize: 11, fontWeight: '500', color: COLORS.fg3, flexShrink: 0 },
  rowBodyText:    { fontSize: 12.5, fontWeight: '400', color: COLORS.fg2, lineHeight: 17 },
  rowCta:         { fontSize: 12, fontWeight: '700', color: COLORS.amber, marginTop: 4 },

  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.amber,
    marginTop: 16, flexShrink: 0,
  },

  // Separator indented to align with text (20 pad + 40 icon + 14 gap = 74)
  sep: { height: 1, backgroundColor: COLORS.softGray200, marginLeft: 74 },

  emptyIconBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.carbon,
    textAlign: 'center', letterSpacing: -0.2, marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13, fontWeight: '400', color: COLORS.fg3, textAlign: 'center',
  },
});
