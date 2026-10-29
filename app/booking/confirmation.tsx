import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { BOOKING_COPY } from '@/constants/bookingCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import DrawnCheck from '@/components/DrawnCheck';
import { QRThumb } from '@/components/QRThumb';
import { QRLightbox } from '@/components/QRLightbox';
import { getReservationsByOrderId, type RentalDoc } from '@/lib/firestore';
import { useShopInfo, buildMapsUrl, buildWhatsappUrl } from '@/lib/shop';
import { addBookingToCalendar } from '@/lib/bookingCalendar';
import { displayOrderId } from '@/utils/rentalDocs';
import { orderDiscountOf } from '@/functions/src/shared/promo';

// Booking confirmation (validated mockup) — shared by the single booking and the bag
// checkout. Check + "It's booked!" + order number; carbon card with the QR (order QR for
// several items, then one compact card per item); Add to calendar (same events as the
// email) + Directions; What to bring (ID only while the first ID check is pending,
// rental AFTER coupon, deposit, payment methods from config/shop); WhatsApp line.
//
// QR formats (admin scanner): "LANCHAI-ORDER:{orderId}" (orders of 2+ items) and
// "LANCHAI-RES:{reservationId}" (one per reservation).

const n = (v: number) => Math.round(v).toLocaleString('en-US');

export default function BookingConfirmationScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const shop = useShopInfo();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [reservations, setReservations] = useState<RentalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState<{ value: string; label: string } | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); setError(true); return; }
    getReservationsByOrderId(orderId)
      .then(res => { if (res.length === 0) setError(true); else setReservations(res); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orderId]);

  const c = BOOKING_COPY;
  if (loading) {
    return <View style={[s.root, screen.root, s.center]}><StatusBar style="dark" /><ActivityIndicator color={SHADES.amber} /></View>;
  }
  if (error || !orderId) {
    return (
      <View style={[s.root, screen.root, s.center]}>
        <StatusBar style="dark" />
        <Text style={UI.body}>{c.loadError}</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/reservations')} style={{ marginTop: 12 }}>
          <Text style={UI.link}>{c.viewRentals}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const single = reservations.length === 1;
  const first = reservations[0];
  // Different dates across items: the carbon card shows the EARLIEST pick-up + how many
  // pick-ups (or returns) there are; each item card below keeps its own dates.
  const earliest = reservations.reduce((a, r) => (r.pickupAt.toMillis() < a.pickupAt.toMillis() ? r : a), first);
  const pickupCount = new Set(reservations.map(r => r.pickupAt.toMillis())).size;
  const returnCount = new Set(reservations.map(r => r.returnAt.toMillis())).size;
  // FIX: the amount AFTER coupon (frozen `total`), not the pre-coupon subtotal.
  const rental = reservations.reduce((sum, r) => sum + (r.total ?? r.subtotal ?? 0), 0);
  const deposit = reservations.reduce((sum, r) => sum + (r.deposit ?? 0), 0);
  // Loyalty coupon or promo code — the rental above is already after it.
  const disc = orderDiscountOf(reservations);
  const idPending = reservations.some(r => r.firstRentalIdCheck === true);
  const orderLabel = displayOrderId(first) ?? orderId;
  const qrValue = single ? `LANCHAI-RES:${first.id}` : `LANCHAI-ORDER:${orderId}`;
  const whatsapp = shop.whatsappNumber
    ? buildWhatsappUrl(shop.whatsappNumber, `Hi LANCHAI, I have a question about my booking (order ${orderLabel}).`)
    : null;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 24, paddingBottom: screen.contentBottom }]} showsVerticalScrollIndicator={false}>
        {/* 1 · Check, headline, order number */}
        <View style={s.hero}>
          <DrawnCheck size={64} />
          <Text style={s.title}>{c.booked}</Text>
          <Text style={s.sub}>{c.waiting(single ? c.yourItem(first.productName) : c.yourItems)}</Text>
          {!!orderLabel && <Text style={s.order}>{c.order(orderLabel)}</Text>}
        </View>

        {/* 2 · Carbon card: QR + pick-up / return */}
        <View style={s.carbon}>
          <QRThumb value={qrValue} size={82} onPress={() => setLightbox({ value: qrValue, label: single ? first.productName : c.order(orderLabel) })} />
          <View style={{ flex: 1 }}>
            <View style={s.pickHead}>
              <Text style={s.pickLabel}>{c.pickup}</Text>
              {pickupCount > 1 && <Text style={s.countChip}>{c.pickupsCount(pickupCount)}</Text>}
            </View>
            <Text style={s.pickWhen}>{earliest.pickupLabel}</Text>
            <Text style={s.returnLine}>
              {pickupCount > 1 ? c.seeEachItem
                : returnCount > 1 ? `${c.returnsCount(returnCount)} · ${c.seeEachItem}`
                : c.returnOn(earliest.returnLabel)}
            </Text>
            <Text style={s.tapHint}>{c.tapQr}</Text>
          </View>
        </View>
        {!single && (
          <View style={{ gap: 8, marginTop: 10 }}>
            {reservations.map(r => (
              <View key={r.id} style={[UI.card, s.item]}>
                <View style={{ flex: 1 }}>
                  <Text style={UI.title} numberOfLines={1}>{r.productName}</Text>
                  <Text style={UI.subtitle} numberOfLines={1}>{r.pickupLabel}</Text>
                  <Text style={UI.subtitle} numberOfLines={1}>{c.returnArrow(r.returnLabel)}</Text>
                </View>
                <QRThumb value={`LANCHAI-RES:${r.id}`} size={44} onPress={() => setLightbox({ value: `LANCHAI-RES:${r.id}`, label: r.productName })} />
              </View>
            ))}
          </View>
        )}

        {/* 3 · Add to calendar + Directions */}
        <View style={s.actions}>
          <PressScale style={[UI.card, s.action]} onPress={() => addBookingToCalendar(orderLabel, reservations, shop)}>
            <Feather name="calendar" size={16} color={SHADES.amberDeep} />
            <Text style={s.actionText}>{c.addToCalendar}</Text>
          </PressScale>
          <PressScale style={[UI.card, s.action]} onPress={() => Linking.openURL(buildMapsUrl(shop))}>
            <Feather name="map-pin" size={16} color={SHADES.amberDeep} />
            <Text style={s.actionText}>{c.directions}</Text>
          </PressScale>
        </View>

        {/* 4 · What to bring */}
        <Text style={[UI.sectionTitle]}>{c.whatToBring}</Text>
        <View style={[UI.card, { paddingHorizontal: 16 }]}>
          {idPending && (
            <View style={s.bring}>
              <Text style={s.bringLabel}>{c.yourId}</Text>
              <Text style={s.bringMuted}>{c.idChecked}</Text>
            </View>
          )}
          <View style={[s.bring, idPending && s.sep]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bringLabel}>{c.rental}</Text>
              {disc && <Text style={s.bringMuted}>{c.discountIncluded(disc.label, n(disc.amount))}</Text>}
            </View>
            <Text style={s.bringValue}>{`${n(rental)} LAK`}</Text>
          </View>
          <View style={[s.bring, s.sep]}>
            <Text style={s.bringLabel}>{c.deposit}</Text>
            <Text style={s.bringValue}>{`${n(deposit)} LAK`}</Text>
          </View>
        </View>
        {!!shop.paymentMethods && <Text style={[UI.small, { marginTop: 8 }]}>{`${shop.paymentMethods}.`}</Text>}

        {/* 5 · WhatsApp line */}
        {whatsapp && (
          <Text style={s.questions}>
            {c.questions}
            <Text style={s.waLink} onPress={() => Linking.openURL(whatsapp)}>{c.whatsapp}</Text>
          </Text>
        )}

        {/* 7 · Actions */}
        <PressScale style={[UI.btnPrimary, { marginTop: 20 }]} onPress={() => router.replace('/(tabs)/reservations')}>
          <Text style={UI.btnPrimaryText}>{c.viewRentals}</Text>
        </PressScale>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={s.homeLink} hitSlop={8}>
          <Text style={s.homeText}>{c.backHome}</Text>
        </TouchableOpacity>
      </ScrollView>

      {lightbox && <QRLightbox value={lightbox.value} label={lightbox.label} onClose={() => setLightbox(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: SHADES.carbon, marginTop: 8 },
  sub: { fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 21, paddingHorizontal: 12 },
  order: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonMuted },
  carbon: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: SHADES.carbon, borderRadius: 18, padding: 16 },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickLabel: { fontSize: 13, fontWeight: '700', color: SHADES.amber },
  countChip: {
    fontSize: 11.5, fontWeight: '700', color: SHADES.carbon, backgroundColor: SHADES.amber,
    borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden',
  },
  pickWhen: { fontSize: 18, fontWeight: '800', color: SHADES.white, marginTop: 2 },
  returnLine: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 3 },
  tapHint: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50 },
  actionText: { fontSize: 15, fontWeight: '600', color: SHADES.carbon },
  bring: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  sep: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  bringLabel: { fontSize: 15, fontWeight: '500', color: SHADES.carbon },
  bringValue: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  bringMuted: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted },
  questions: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', marginTop: 18 },
  waLink: { color: SHADES.amberText, fontWeight: '700' },
  homeLink: { alignSelf: 'center', marginTop: 14, paddingVertical: 6 },
  homeText: { fontSize: 15, fontWeight: '600', color: SHADES.carbonMuted },
});
