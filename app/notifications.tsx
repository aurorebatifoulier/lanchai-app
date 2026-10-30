import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { NOTIF_COPY as c } from '@/constants/notificationsCopy';
import { UI, IconCircle, type IconTone, type AnyIcon, useScreenInsets } from '@/components/account/ui';
import BackButton from '@/components/BackButton';

// Notifications inbox (validated mockup): All / Rentals / Codes / News chips; Today /
// Yesterday / Earlier cards; ONE icon per kind in palette circles (ticket = code,
// clock = booking, alert = late / issue, package = rental started / returned,
// chat = message); titles on up to 2 lines; swipe left to delete (personal items are
// deleted; shared broadcasts are hidden on this device only); witty empty state.
// The kind is derived from the stored type + icon, so older notifications work too.

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  deepLink?: string;
  createdAt: Timestamp;
  readAt: Timestamp | null;
  broadcast: boolean;
}

type Kind = 'code' | 'booking' | 'alert' | 'package' | 'message' | 'news' | 'other';
type FilterKey = 'all' | 'rentals' | 'codes' | 'news';
const FILTERS: FilterKey[] = ['all', 'rentals', 'codes', 'news'];
const HIDDEN_KEY = 'notifications.hiddenBroadcasts';

function kindOf(n: NotificationItem): Kind {
  if (n.type === 'code' || n.icon === 'gift') return 'code';
  if (n.type === 'message' || n.icon === 'message-circle' || n.icon === 'chat') return 'message';
  if (['alert', 'alert-circle', 'alert-triangle', 'x-circle'].includes(n.icon)) return 'alert';
  if (n.icon === 'clock') return 'booking';
  if (['box', 'package', 'check', 'check-circle'].includes(n.icon)) return 'package';
  if (n.broadcast || ['new_item', 'promo', 'announcement'].includes(n.type)) return 'news';
  return 'other';
}

const KIND_ICON: Record<Kind, { icon: AnyIcon; tone: IconTone }> = {
  code:    { icon: { set: 'mci', name: 'ticket-percent-outline' }, tone: 'amber' },
  booking: { icon: { name: 'clock' }, tone: 'grey' },
  alert:   { icon: { name: 'alert-triangle' }, tone: 'amber' },
  package: { icon: { name: 'package' }, tone: 'grey' },
  message: { icon: { name: 'message-circle' }, tone: 'amber' },
  news:    { icon: { name: 'radio' }, tone: 'grey' },
  other:   { icon: { name: 'bell' }, tone: 'grey' },
};

function inFilter(n: NotificationItem, f: FilterKey): boolean {
  if (f === 'all') return true;
  const k = kindOf(n);
  if (f === 'codes') return k === 'code';
  if (f === 'news') return k === 'news';
  return n.type === 'rental' || k === 'booking' || k === 'alert' || k === 'package';
}

function bucket(ts: Timestamp): 'today' | 'yesterday' | 'earlier' {
  const d = ts.toDate();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (d >= start) return 'today';
  const y = new Date(start); y.setDate(y.getDate() - 1);
  return d >= y ? 'yesterday' : 'earlier';
}

function shortAge(ts: Timestamp): string {
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [broadcasts, setBroadcasts] = useState<NotificationItem[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bLoading, setBLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'notifications', user.uid, 'items'), orderBy('createdAt', 'desc')),
      snap => {
        setItems(snap.docs.map(d => {
          const x = d.data();
          return {
            id: d.id, type: x.type ?? 'system', title: x.title ?? '', body: x.body ?? '', icon: x.icon ?? 'bell',
            deepLink: x.deepLink || undefined, createdAt: x.createdAt as Timestamp, readAt: x.readAt ?? null, broadcast: false,
          };
        }));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  useEffect(() => {
    if (!user) { setBLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc')),
      snap => {
        setBroadcasts(snap.docs.map(d => {
          const x = d.data();
          return {
            id: d.id, type: x.type ?? 'announcement', title: x.title ?? '', body: x.body ?? '', icon: x.icon ?? 'radio',
            deepLink: x.deepLink || undefined, createdAt: x.createdAt as Timestamp,
            readAt: new Timestamp(1, 0), // broadcasts are always "read" — no unread dot
            broadcast: true,
          };
        }));
        setBLoading(false);
      },
      () => setBLoading(false),
    );
  }, [user]);

  // Broadcasts swiped away — hidden on this device only (shared docs).
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then(v => { try { setHidden(new Set(JSON.parse(v ?? '[]') as string[])); } catch { /* ignore */ } })
      .catch(() => {});
  }, []);

  const all = useMemo(() => [...items, ...broadcasts.filter(b => !hidden.has(b.id))]
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)), [items, broadcasts, hidden]);
  const filtered = useMemo(() => all.filter(n => inFilter(n, filter)), [all, filter]);
  const sections = useMemo(() => {
    const groups: Record<'today' | 'yesterday' | 'earlier', NotificationItem[]> = { today: [], yesterday: [], earlier: [] };
    filtered.forEach(n => groups[n.createdAt ? bucket(n.createdAt) : 'earlier'].push(n));
    return (['today', 'yesterday', 'earlier'] as const).filter(k => groups[k].length).map(k => ({ key: k, label: c.sections[k], data: groups[k] }));
  }, [filtered]);

  const open = useCallback((n: NotificationItem) => {
    if (user && !n.readAt) updateDoc(doc(db, 'notifications', user.uid, 'items', n.id), { readAt: serverTimestamp() }).catch(() => {});
    if (n.deepLink) router.push(n.deepLink as never);
  }, [user, router]);

  const remove = useCallback((n: NotificationItem) => {
    setError(null);
    if (n.broadcast) {
      setHidden(prev => {
        const next = new Set(prev); next.add(n.id);
        AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
      return;
    }
    if (!user) return;
    deleteDoc(doc(db, 'notifications', user.uid, 'items', n.id)).catch(() => setError(c.deleteError));
  }, [user]);

  const unreadIds = useMemo(() => filtered.filter(n => !n.readAt && !n.broadcast).map(n => n.id), [filtered]);
  const markAll = useCallback(() => {
    if (!user || unreadIds.length === 0) return;
    const batch = writeBatch(db);
    unreadIds.forEach(id => batch.update(doc(db, 'notifications', user.uid, 'items', id), { readAt: serverTimestamp() }));
    batch.commit().catch(() => {});
  }, [user, unreadIds]);

  const busy = loading || bLoading;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={{ flexShrink: 0 }}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>{c.title}</Text>
          {unreadIds.length > 0 && (
            <TouchableOpacity onPress={markAll} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <Text style={s.markAll}>{c.markAll}</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} style={[s.chip, filter === f && s.chipOn]} onPress={() => setFilter(f)} activeOpacity={0.8}>
              <Text style={[s.chipText, filter === f && s.chipTextOn]}>{c.filters[f]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.list, { paddingBottom: screen.contentBottom }, !busy && filtered.length === 0 && s.listCenter]}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Text style={[UI.errorText, { marginHorizontal: 16, marginTop: 8 }]}>{error}</Text>}
        {busy ? (
          <ActivityIndicator color={SHADES.amber} />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center' }}>
            <IconCircle icon={{ name: 'bell' }} size={64} />
            <Text style={s.emptyTitle}>{c.emptyTitle}</Text>
            <Text style={s.emptySub}>{c.emptySub}</Text>
          </View>
        ) : (
          <>
            {sections.map(sec => (
              <View key={sec.key}>
                <Text style={s.section}>{sec.label}</Text>
                <View style={[UI.card, s.card]}>
                  {sec.data.map((n, i) => (
                    <ReanimatedSwipeable
                      key={n.id}
                      friction={2}
                      rightThreshold={60}
                      overshootRight={false}
                      renderRightActions={() => (
                        <View style={s.deleteAction}>
                          <Feather name="trash-2" size={16} color={SHADES.cream} />
                          <Text style={s.deleteText}>{c.delete}</Text>
                        </View>
                      )}
                      onSwipeableOpen={() => remove(n)}
                    >
                      <Row n={n} onPress={() => open(n)} last={i === sec.data.length - 1} />
                    </ReanimatedSwipeable>
                  ))}
                </View>
              </View>
            ))}
            <Text style={s.hint}>{c.swipeHint}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ n, onPress, last }: { n: NotificationItem; onPress: () => void; last: boolean }) {
  const unread = !n.readAt;
  const k = KIND_ICON[kindOf(n)];
  return (
    <TouchableOpacity style={[s.row, unread && s.rowUnread, !last && s.sep]} onPress={onPress} activeOpacity={0.8}>
      <IconCircle icon={k.icon} tone={k.tone} size={44} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={2}>{n.title}</Text>
          <View style={s.meta}>
            <Text style={s.time}>{n.createdAt ? shortAge(n.createdAt) : ''}</Text>
            {unread && <View style={s.dot} />}
          </View>
        </View>
        {!!n.body && <Text style={s.body} numberOfLines={3}>{n.body}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  markAll: { fontSize: 14, fontWeight: '700', color: SHADES.amberText },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white, justifyContent: 'center' },
  chipOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  chipText: { fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  chipTextOn: { color: SHADES.cream },
  list: { paddingTop: 4 },
  listCenter: { flexGrow: 1, justifyContent: 'center' },
  section: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  card: { marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: SHADES.white },
  rowUnread: { backgroundColor: SHADES.amberPale },
  sep: { borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15.5, fontWeight: '700', color: SHADES.carbon, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  time: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: SHADES.amber },
  body: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  deleteAction: { width: 96, backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteText: { fontSize: 12.5, fontWeight: '700', color: SHADES.cream },
  hint: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', marginTop: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginTop: 16 },
  emptySub: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 4 },
});
