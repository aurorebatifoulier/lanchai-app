import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { RENTALS_COPY as c } from '@/constants/rentalsCopy';
import { UI, CategoryBadge } from '@/components/account/ui';
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

/**
 * Product photo — tries each candidate (current product photos, then the one frozen at
 * booking) and moves on when one fails to load; none left → the category badge (neutral
 * badge for an unknown / deleted product). Never an empty grey square.
 */
export function RentalThumb({ rental, size = 56 }: { rental: RentalDoc; size?: number }) {
  const candidates = rental.productImageCandidates ?? (rental.productImage ? [rental.productImage] : []);
  const [failed, setFailed] = useState(0);
  const sig = candidates.join('|');
  useEffect(() => { setFailed(0); }, [sig]); // new photos after a reload → start again
  const uri = candidates[failed];
  if (!uri) {
    return <View style={{ width: size, height: size }}><CategoryBadge cat={rental.productCategory ?? ''} size={size} /></View>;
  }
  return (
    <View style={[s.thumb, { width: size, height: size, borderRadius: size >= 52 ? 14 : 12 }]}>
      <Image
        key={uri}
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={200}
        onError={() => setFailed(n => n + 1)}
      />
    </View>
  );
}
const Thumb = RentalThumb;

/** One photo, or up to 3 stacked (offset) for an order. */
export function Thumbs({ items }: { items: RentalDoc[] }) {
  if (items.length === 1) return <Thumb rental={items[0]} />;
  const shown = items.slice(0, 3);
  return (
    <View style={s.stack}>
      {shown.map((r, i) => (
        <View key={r.id} style={[s.stackItem, { left: i * 8, top: i * 5, zIndex: 3 - i }]}>
          <Thumb rental={r} size={46} />
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
  const lnc = displayOrderId(first); // LNC-… or null — never the raw Firestore id
  const qr = single || !entry.orderId ? `LANCHAI-RES:${first.id}` : `LANCHAI-ORDER:${entry.orderId}`;
  const qrLabel = single ? first.productName : lnc ? c.orderLabel(lnc) : c.items(items.length);

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
        <PressScale style={s.heroBtn} onPress={() => addBookingToCalendar(lnc ?? entry.orderId ?? first.id, items, shop)}>
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

// ── Pick-up time passed, not handed over ──────────────────────────────────────

/**
 * Pick-ups whose time passed in the last 48h without a hand-over — ONE collapsible card
 * under the hero (collapsed by default). Older ones move to Past (lib/rentalsList).
 */
export function MissedPickupsCard({ entries }: { entries: RentalEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <View style={[UI.card, s.card]}>
      <PressScale style={s.missedHead} onPress={() => setOpen(o => !o)}>
        <View style={s.missedIcon}><Feather name="clock" size={16} color={SHADES.amberDeep} /></View>
        <Text style={[s.name, { flex: 1 }]}>{c.missedCount(entries.length)}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={SHADES.carbonMuted} />
      </PressScale>
      {open && entries.map(e => {
        const ms = Math.min(...e.items.map(pickupMs));
        return (
          <View key={e.key} style={s.missedLine}>
            <View style={s.row}>
              <Thumbs items={e.items} />
              <View style={s.body}>
                <CardHead items={e.items} chip={c.missedChip} />
                <Text style={s.lateText}>{c.missedText(when(ms))}</Text>
              </View>
            </View>
            <PressScale
              style={[UI.btnSecondary, s.extendBtn]}
              onPress={() => router.push({ pathname: '/chat', params: { rentalId: e.items[0].id } } as never)}
            >
              <Feather name="message-circle" size={15} color={SHADES.carbon} />
              <Text style={UI.btnSecondaryText}>{c.messageUs}</Text>
            </PressScale>
          </View>
        );
      })}
    </View>
  );
}

// ── Active ───────────────────────────────────────────────────────────────────

// "I'm on my way" sent this app session, per card (entry.key = the order, or the single
// rental) — the button then stays "sent" on THAT card only.
const onMyWaySent = new Set<string>();

export function ActiveCard({ entry, onOpenOrder }: { entry: RentalEntry; onOpenOrder: (e: RentalEntry) => void }) {
  const router = useRouter();
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const now = Date.now();
  const lateItems = items.filter(r => returnMs(r) < now);
  const late = lateItems.length > 0;
  const due = Math.min(...items.map(returnMs));
  const key = entry.key;
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

/** The renter's rating per RETURNED reservation: number, null = not reviewed, undefined = loading. */
export function useMyRatings(rentals: RentalDoc[]): Map<string, number | null | undefined> {
  const returned = rentals.filter(r => r.status === 'returned');
  const keyOf = (r: RentalDoc) => `${r.productId}/${r.id}`;
  const sig = returned.map(keyOf).join('|');
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const missing = returned.filter(r => !reviewCache.has(keyOf(r)));
    Promise.all(missing.map(r => getReview(r.productId, r.id)
      .then(doc => { reviewCache.set(keyOf(r), typeof doc?.rating === 'number' ? doc.rating : null); })
      .catch(() => {})))
      .then(() => { if (alive && missing.length > 0) bump(n => n + 1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return new Map(returned.map(r => [r.id, reviewCache.get(keyOf(r))]));
}

/** "Rent again" + "Review · +N pts" (until reviewed) — single past cards and the order sheet. */
export function PastItemActions({ rental, rating, reviewPoints, onNavigate }: {
  rental: RentalDoc;
  rating: number | null | undefined;
  reviewPoints: number | null;
  /** Called before navigating (the order sheet closes itself). */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const go = (to: Parameters<typeof router.push>[0]) => { onNavigate?.(); router.push(to); };
  return (
    <View style={s.btnRow}>
      <PressScale style={[UI.btnPrimary, s.btn]} onPress={() => go(`/product/${rental.productId}`)}>
        <Text style={UI.btnPrimaryText}>{c.rentAgain}</Text>
      </PressScale>
      {rental.status === 'returned' && rating === null && (
        <PressScale
          style={[UI.btnSecondary, s.btn]}
          onPress={() => go({ pathname: '/review/[productId]', params: { productId: rental.productId, reservationId: rental.id } } as never)}
        >
          <Feather name="star" size={15} color={SHADES.carbon} />
          <Text style={UI.btnSecondaryText}>{c.review(reviewPoints)}</Text>
        </PressScale>
      )}
    </View>
  );
}

/** "★ You rated it n". */
export function RatedLine({ rating }: { rating: number }) {
  return (
    <View style={s.ratedRow}>
      <Feather name="star" size={14} color={SHADES.amberText} />
      <Text style={s.rated}>{c.youRated(rating)}</Text>
    </View>
  );
}

/** After the review screen: forget the cached "not reviewed yet" answers. */
export function clearReviewCache() { reviewCache.clear(); }

export function PastCard({ entry, onOpenOrder, reviewPoints }: {
  entry: RentalEntry;
  onOpenOrder: (e: RentalEntry) => void;
  /** Review reward points (null = loyalty excluded → plain "Review"). */
  reviewPoints: number | null;
}) {
  const open = useOpen(entry, onOpenOrder);
  const { items } = entry;
  const first = items[0];
  const single = items.length === 1;
  const cancelled = isCancelledLike(first);
  const ratings = useMyRatings(cancelled ? [] : items);
  const rating = ratings.get(first.id);
  const canReview = [...ratings.values()].some(v => v === null);
  const range = shortRange(Math.min(...items.map(pickupMs)), Math.max(...items.map(returnMs)));
  const days = Math.max(...items.map(r => r.durationDays ?? 0));

  return (
    <PressScale style={[UI.card, s.card, cancelled && s.muted60]} onPress={open}>
      <View style={s.row}>
        <Thumbs items={items} />
        <View style={s.body}>
          <CardHead items={items} status={pastStatus(first)} />
          <Text style={s.line} numberOfLines={1}>{cancelled ? `${range} · ${pastMoneyLine(items)}` : `${range} · ${c.day(days)}`}</Text>
          {/* Payment / settlement line ALWAYS, then the rating once reviewed. */}
          {!cancelled && <Text style={s.muted} numberOfLines={2}>{pastMoneyLine(items)}</Text>}
          {!cancelled && single && rating != null && <RatedLine rating={rating} />}
          {!cancelled && !single && canReview && <Text style={s.tapHint}>{c.tapToReview}</Text>}
        </View>
      </View>
      {!cancelled && single && <PastItemActions rental={first} rating={rating} reviewPoints={reviewPoints} />}
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
  stack: { width: 62, height: 56 },
  stackItem: { position: 'absolute', borderRadius: 15, borderWidth: 1.5, borderColor: SHADES.white },

  card: { padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: SHADES.carbon, lineHeight: 20 },
  status: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  chipAmber: { backgroundColor: SHADES.amberLight },
  chipGrey: { backgroundColor: SHADES.carbonLight },
  chipLate: { backgroundColor: SHADES.carbon },
  chipText: { fontSize: 12, fontWeight: '700' },
  chipTextAmber: { color: SHADES.amberDeep },
  chipTextGrey: { color: SHADES.carbon },
  chipTextLate: { color: SHADES.amber },
  line: { fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 18 },
  muted: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2, lineHeight: 18 },
  muted60: { opacity: 0.6 },
  ratedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rated: { fontSize: 13, fontWeight: '600', color: SHADES.amberDeep },
  tapHint: { fontSize: 12, fontWeight: '600', color: SHADES.amberText, marginTop: 4 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 44, paddingHorizontal: 8 },
  extendBtn: { marginTop: 12, height: 40 },

  missedHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  missedIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center' },
  missedLine: { borderTopWidth: 0.5, borderTopColor: SHADES.border, marginTop: 14, paddingTop: 14 },
  lateCard: { borderLeftWidth: 4, borderLeftColor: SHADES.amberText },
  lateText: { fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 18 },

  hero: { backgroundColor: SHADES.carbon, borderRadius: 18, padding: 16, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroLabel: { fontSize: 13, fontWeight: '700', color: SHADES.amber },
  heroWhen: { fontSize: 17, fontWeight: '800', color: SHADES.white, marginTop: 3, letterSpacing: -0.2 },
  heroSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 3, lineHeight: 18 },
  heroBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: SHADES.carbonSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  heroBtnText: { fontSize: 15, fontWeight: '600', color: SHADES.white },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 15, fontWeight: '700', color: SHADES.carbon, textAlign: 'center', lineHeight: 21 },
  emptyBtn: { marginTop: 20, alignSelf: 'stretch' },
});
