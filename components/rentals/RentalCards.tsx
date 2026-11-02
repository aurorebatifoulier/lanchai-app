import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { RENTALS_COPY as c } from '@/constants/rentalsCopy';
import { UI } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { QRThumb } from '@/components/QRThumb';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import { addBookingToCalendar } from '@/lib/bookingCalendar';
import { displayOrderId } from '@/utils/rentalDocs';
import { getReview, type RentalDoc } from '@/lib/firestore';
import { initConversation, sendMessage } from '@/lib/chat';
import { auth } from '@/lib/auth';
import { vteDay, vteTime } from '@/functions/src/shared/dates';
import {
  type RentalEntry, daysUntil, daysLate, shortRange, lak, orderTotal, distinctCount,
  upcomingMoneyLine, pastMoneyLine, pastStatus, isCancelledLike,
} from '@/lib/rentalsList';

// "My rentals" cards (validated mockup) — one card per order. Single item → tap opens
// the rental; several items → the order sheet (onOpenOrder).

const when = (ms: number) => `${vteDay(ms)} · ${vteTime(ms)}`;
const pickupMs = (r: RentalDoc) => r.pickupAt.toMillis();
const returnMs = (r: RentalDoc) => r.returnAt.toMillis();

// ── Thumbnails ───────────────────────────────────────────────────────────────

function Thumb({ rental, size = 64 }: { rental: RentalDoc; size?: number }) {
  return (
    <View style={[s.thumb, { width: size, height: size }]}>
      {rental.productImage
        ? <Image source={{ uri: rental.productImage }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        : <Feather name="package" size={Math.round(size * 0.4)} color={SHADES.carbonFaint} />}
    </View>
  );
}

/** One photo, or up to 3 stacked (offset) for an order. */
export function Thumbs({ items }: { items: RentalDoc[] }) {
  if (items.length === 1) return <Thumb rental={items[0]} />;
  const shown = items.slice(0, 3);
  return (
    <View style={s.stack}>
      {shown.map((r, i) => (
        <View key={r.id} style={[s.stackItem, { left: i * 9, top: i * 6, zIndex: 3 - i }]}>
          <Thumb rental={r} size={52} />
        </View>
      ))}
    </View>
  );
}

const titleOf = (items: RentalDoc[]) => (items.length === 1 ? items[0].productName : c.items(items.length));

function CardHead({ items, chip, chipTone = 'grey', status }: {
  items: RentalDoc[]; chip?: string; chipTone?: 'amber' | 'grey' | 'late'; status?: string;
}) {
  return (
    <View style={s.headRow}>
      <Text style={s.name} numberOfLines={1}>{titleOf(items)}</Text>
      {chip ? (
        <View style={[s.chip, chipTone === 'amber' ? s.chipAmber : chipTone === 'late' ? s.chipLate : s.chipGrey]}>
          <Text style={[s.chipText, chipTone === 'amber' ? s.chipTextAmber : chipTone === 'late' ? s.chipTextLate : s.chipTextGrey]}>{chip}</Text>
        </View>
      ) : status ? <Text style={s.status}>{status}</Text> : null}
    </View>
  );
}

function useOpen(entry: RentalEntry, onOpenOrder: (e: RentalEntry) => void) {
  const router = useRouter();
  return () => {
    if (entry.items.length === 1) router.push(`/rentals/${entry.items[0].id}`);
    else onOpenOrder(entry);
  };
}

// ── Next pick-up (carbon) ─────────────────────────────────────────────────────

export function NextPickupHero({ entry, onOpenQR, onOpenOrder }: {
  entry: RentalEntry;
  onOpenQR: (value: string, label: string) => void;
  onOpenOrder: (e: RentalEntry) => void;
}) {
  const shop = useShopInfo();
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const single = items.length === 1;
  const first = items[0];
  const ms = Math.min(...items.map(pickupMs));
  const n = daysUntil(ms);
  const whenText = n <= 0 ? c.today : n === 1 ? c.tomorrow : c.inDays(n);
  const orderLabel = displayOrderId(first) ?? entry.orderId ?? first.id;
  const qr = single || !entry.orderId ? `LANCHAI-RES:${first.id}` : `LANCHAI-ORDER:${entry.orderId}`;
  const qrLabel = single ? first.productName : c.orderLabel(orderLabel);

  return (
    <PressScale style={s.hero} onPress={open}>
      <View style={s.heroTop}>
        <QRThumb value={qr} size={64} onPress={() => onOpenQR(qr, qrLabel)} />
        <View style={{ flex: 1 }}>
          <Text style={s.heroLabel}>{c.nextPickup(whenText)}</Text>
          <Text style={s.heroWhen}>{when(ms)}</Text>
          <Text style={s.heroSub} numberOfLines={2}>{`${titleOf(items)} · ${c.toPay(lak(orderTotal(items)))}`}</Text>
        </View>
      </View>
      <View style={s.heroBtns}>
        <PressScale style={s.heroBtn} onPress={() => Linking.openURL(buildMapsUrl(shop)).catch(() => {})}>
          <Feather name="map-pin" size={15} color={SHADES.amber} />
          <Text style={s.heroBtnText}>{c.directions}</Text>
        </PressScale>
        <PressScale style={s.heroBtn} onPress={() => addBookingToCalendar(orderLabel, items, shop)}>
          <Feather name="calendar" size={15} color={SHADES.amber} />
          <Text style={s.heroBtnText}>{c.addToCalendar}</Text>
        </PressScale>
      </View>
    </PressScale>
  );
}

// ── Upcoming ─────────────────────────────────────────────────────────────────

export function UpcomingCard({ entry, onOpenOrder }: { entry: RentalEntry; onOpenOrder: (e: RentalEntry) => void }) {
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const ms = Math.min(...items.map(pickupMs));
  const pickups = distinctCount(items, pickupMs);
  const r = items[0];
  const dates = pickups > 1
    ? c.pickups(pickups)
    : distinctCount(items, returnMs) > 1
      ? `${when(ms)} · ${c.returns(distinctCount(items, returnMs))}`
      : `${when(ms)} → ${when(returnMs(r))}`;
  return (
    <PressScale style={[UI.card, s.card]} onPress={open}>
      <View style={s.row}>
        <Thumbs items={items} />
        <View style={s.body}>
          <CardHead items={items} chip={c.inDaysChip(daysUntil(ms))} chipTone="amber" />
          <Text style={s.line} numberOfLines={2}>{dates}</Text>
          <Text style={s.muted} numberOfLines={1}>{upcomingMoneyLine(items)}</Text>
        </View>
      </View>
    </PressScale>
  );
}

// ── Active ───────────────────────────────────────────────────────────────────

// "I'm on my way" sent this app session (per rental) — the button then stays "sent".
const onMyWaySent = new Set<string>();

export function ActiveCard({ entry, onOpenOrder }: { entry: RentalEntry; onOpenOrder: (e: RentalEntry) => void }) {
  const router = useRouter();
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const now = Date.now();
  const lateItems = items.filter(r => returnMs(r) < now);
  const late = lateItems.length > 0;
  const due = Math.min(...items.map(returnMs));
  const key = items[0].id;
  const [sent, setSent] = useState(onMyWaySent.has(key));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const chatAbout = { pathname: '/chat', params: { rentalId: items[0].id } };

  const onMyWay = async () => {
    const user = auth.currentUser;
    if (!user || sending || sent) return;
    setSending(true); setError(false);
    const r = lateItems[0] ?? items[0];
    const name = items.length === 1 ? r.productName : items.map(i => i.productName).join(', ');
    try {
      await initConversation(user.uid, user.displayName || user.email || 'Renter').catch(() => {});
      await sendMessage(user.uid, c.onMyWayMessage(name), null, null, {
        about: { kind: 'rental', id: r.id, name: r.productName },
        onMyWay: true,
      });
      onMyWaySent.add(key);
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  if (late) {
    const lateMs = Math.min(...lateItems.map(returnMs));
    return (
      <PressScale style={[UI.card, s.card, s.lateCard]} onPress={open}>
        <View style={s.row}>
          <Thumbs items={items} />
          <View style={s.body}>
            <CardHead items={items} chip={c.lateChip(daysLate(lateMs, now))} chipTone="late" />
            <Text style={s.lateText}>{c.lateText(vteDay(lateMs))}</Text>
          </View>
        </View>
        <View style={s.btnRow}>
          <PressScale style={[UI.btnPrimary, s.btn, (sending || sent) && UI.btnDisabled]} onPress={onMyWay} disabled={sending || sent}>
            <Text style={UI.btnPrimaryText}>{sent ? c.onMyWaySent : c.onMyWay}</Text>
          </PressScale>
          <PressScale style={[UI.btnSecondary, s.btn]} onPress={() => router.push(chatAbout as never)}>
            <Text style={UI.btnSecondaryText}>{c.messageUs}</Text>
          </PressScale>
        </View>
        {error && <Text style={[UI.errorText, { marginTop: 8 }]}>{c.onMyWayError}</Text>}
      </PressScale>
    );
  }

  const returns = distinctCount(items, returnMs);
  return (
    <PressScale style={[UI.card, s.card]} onPress={open}>
      <View style={s.row}>
        <Thumbs items={items} />
        <View style={s.body}>
          <CardHead items={items} chip={c.dueChip(daysUntil(due))} />
          <Text style={s.line} numberOfLines={1}>{returns > 1 ? `${c.returnLine(when(due))} · ${c.returns(returns)}` : c.returnLine(when(due))}</Text>
        </View>
      </View>
      <PressScale
        style={[UI.btnSecondary, s.extendBtn]}
        onPress={() => router.push({ pathname: '/chat', params: { rentalId: items[0].id, ask: c.extendQuestion } } as never)}
      >
        <Feather name="clock" size={15} color={SHADES.carbon} />
        <Text style={UI.btnSecondaryText}>{c.extend}</Text>
      </PressScale>
    </PressScale>
  );
}

// ── Past ─────────────────────────────────────────────────────────────────────

// Review lookups (direct getDoc — never collectionGroup), cached for the app session.
const reviewCache = new Map<string, number | null>();

function useMyRating(r: RentalDoc, enabled: boolean): number | null | undefined {
  const key = `${r.productId}/${r.id}`;
  const [rating, setRating] = useState<number | null | undefined>(reviewCache.get(key));
  useEffect(() => {
    if (!enabled || reviewCache.has(key)) return;
    let alive = true;
    getReview(r.productId, r.id)
      .then(doc => {
        const v = typeof doc?.rating === 'number' ? doc.rating : null;
        reviewCache.set(key, v);
        if (alive) setRating(v);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled, key, r.productId, r.id]);
  return rating;
}

/** After the review screen: forget the cached "not reviewed yet" answers. */
export function clearReviewCache() { reviewCache.clear(); }

export function PastCard({ entry, onOpenOrder, reviewPoints }: {
  entry: RentalEntry;
  onOpenOrder: (e: RentalEntry) => void;
  /** Review reward points (null = loyalty excluded → plain "Review"). */
  reviewPoints: number | null;
}) {
  const router = useRouter();
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const first = items[0];
  const single = items.length === 1;
  const cancelled = isCancelledLike(first);
  const returned = first.status === 'returned';
  const rating = useMyRating(first, single && returned);
  const range = shortRange(Math.min(...items.map(pickupMs)), Math.max(...items.map(returnMs)));
  const days = Math.max(...items.map(r => r.durationDays ?? 0));

  return (
    <PressScale style={[UI.card, s.card, cancelled && s.muted60]} onPress={open}>
      <View style={s.row}>
        <Thumbs items={items} />
        <View style={s.body}>
          <CardHead items={items} status={pastStatus(first)} />
          <Text style={s.line} numberOfLines={1}>{cancelled ? `${range} · ${pastMoneyLine(items)}` : `${range} · ${c.day(days)}`}</Text>
          {!cancelled && single && rating != null ? (
            <View style={s.ratedRow}>
              <Feather name="star" size={14} color={SHADES.amberText} />
              <Text style={s.rated}>{c.youRated(rating)}</Text>
            </View>
          ) : !cancelled ? (
            <Text style={s.muted} numberOfLines={2}>{pastMoneyLine(items)}</Text>
          ) : null}
        </View>
      </View>
      {!cancelled && single && (
        <View style={s.btnRow}>
          <PressScale style={[UI.btnPrimary, s.btn]} onPress={() => router.push(`/product/${first.productId}`)}>
            <Text style={UI.btnPrimaryText}>{c.rentAgain}</Text>
          </PressScale>
          {returned && rating === null && (
            <PressScale
              style={[UI.btnSecondary, s.btn]}
              onPress={() => router.push({ pathname: '/review/[productId]', params: { productId: first.productId, reservationId: first.id } } as never)}
            >
              <Feather name="star" size={15} color={SHADES.carbon} />
              <Text style={UI.btnSecondaryText}>{c.review(reviewPoints)}</Text>
            </PressScale>
          )}
        </View>
      )}
    </PressScale>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function RentalsEmpty({ text, onExplore }: { text: string; onExplore?: () => void }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Feather name="package" size={26} color={SHADES.amberDeep} /></View>
      <Text style={s.emptyText}>{text}</Text>
      {onExplore && (
        <PressScale style={[UI.btnPrimary, s.emptyBtn]} onPress={onExplore}>
          <Text style={UI.btnPrimaryText}>{c.empty.cta}</Text>
        </PressScale>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  thumb: { borderRadius: 14, backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stack: { width: 70, height: 64 },
  stackItem: { position: 'absolute', borderRadius: 15, borderWidth: 1.5, borderColor: SHADES.white },

  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 14 },
  body: { flex: 1, minWidth: 0 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: SHADES.carbon, letterSpacing: -0.1 },
  status: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  chipAmber: { backgroundColor: SHADES.amberLight },
  chipGrey: { backgroundColor: SHADES.carbonLight },
  chipLate: { backgroundColor: SHADES.carbon },
  chipText: { fontSize: 12, fontWeight: '700' },
  chipTextAmber: { color: SHADES.amberDeep },
  chipTextGrey: { color: SHADES.carbon },
  chipTextLate: { color: SHADES.amber },
  line: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },
  muted: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2, lineHeight: 18 },
  muted60: { opacity: 0.6 },
  ratedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rated: { fontSize: 13, fontWeight: '600', color: SHADES.amberDeep },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 46, paddingHorizontal: 8 },
  extendBtn: { marginTop: 14, height: 42 },

  lateCard: { borderLeftWidth: 4, borderLeftColor: SHADES.amberText },
  lateText: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },

  hero: { backgroundColor: SHADES.carbon, borderRadius: 18, padding: 16, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroLabel: { fontSize: 13, fontWeight: '700', color: SHADES.amber },
  heroWhen: { fontSize: 19, fontWeight: '800', color: SHADES.white, marginTop: 3, letterSpacing: -0.2 },
  heroSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 3, lineHeight: 18 },
  heroBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: SHADES.carbonSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  heroBtnText: { fontSize: 14, fontWeight: '700', color: SHADES.white },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { marginTop: 20, alignSelf: 'stretch' },
});
