import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import { getReservationsByOrderId, RentalDoc } from '@/lib/firestore';
import { QRThumb } from '@/components/QRThumb';
import { QRLightbox } from '@/components/QRLightbox';
import { useVatPercent, DEFAULT_VAT_PERCENT } from '@/lib/exchangeRate';
import { splitHtVat } from '@/utils/currency';
import { PICKUP_DELAY_MS } from '@/utils/availability';
import { BillingSummary } from '@/components/BillingSummary';
import WhatsAppButton from '@/components/WhatsAppButton';

// ── QR code string formats (documented here for the admin scanner) ─────────────
// Order-level QR (shown when there are 2+ items in an order):
//   "LANCHAI-ORDER:{orderId}"
// Per-item QR (one per reservation, always shown):
//   "LANCHAI-RES:{reservationId}"
// The scanner resolves orderId via `reservations` where `orderId == …`
// and resolves reservationId via direct doc read `reservations/{reservationId}`.

const QR_ORDER = 150; // hero order QR at top (grouped)
const QR_ITEM  = 72;  // per-item QRs on item cards + single-item hero

interface Lightbox { value: string; label: string }

export default function BookingConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const vatPercent = useVatPercent();

  const [reservations, setReservations] = useState<RentalDoc[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [lightbox,     setLightbox]     = useState<Lightbox | null>(null);

  const closeLightbox = () => setLightbox(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); setError(true); return; }
    getReservationsByOrderId(orderId)
      .then(res => {
        if (res.length === 0) setError(true);
        else setReservations(res);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orderId]);

  const totalRental  = reservations.reduce((s, r) => s + (r.subtotal ?? 0), 0);
  const totalDeposit = reservations.reduce((s, r) => s + (r.deposit  ?? 0), 0);
  const isSingle     = reservations.length === 1;
  const vatPct = vatPercent ?? DEFAULT_VAT_PERCENT;
  const { ht: vatHt, vat: vatAmount } = splitHtVat(totalRental, vatPct);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (error || !orderId) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.centered}>
          <Text style={s.errorText}>Could not load booking details.</Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/reservations')}>
            <Text style={s.errorLink}>View my rentals</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Hero QR (replaces check icon at top) ── */}
        {isSingle ? (
          // Single: neutral QR + product info; no separate item row below
          <View style={s.heroSection}>
            <QRThumb
              value={`LANCHAI-RES:${reservations[0].id}`}
              onPress={() => setLightbox({
                value: `LANCHAI-RES:${reservations[0].id}`,
                label: reservations[0].productName,
              })}
            />
            <Text style={s.heroProductName}>{reservations[0].productName}</Text>
            <View style={s.heroPeriodRow}>
              <Text style={s.heroPeriodLabel}>Pick-up</Text>
              <Text style={s.heroPickupText}>{reservations[0].pickupLabel}</Text>
            </View>
            <Text style={s.pickupDelayNote}>
              Ready within {PICKUP_DELAY_MS / 3_600_000}h of this confirmation
            </Text>
            <View style={s.heroPeriodRow}>
              <Text style={s.heroPeriodLabel}>Return</Text>
              <Text style={s.heroPickupText}>{reservations[0].returnLabel}</Text>
            </View>
          </View>
        ) : (
          // Grouped: amber-framed order QR (black QR on white, amber outer frame)
          <View style={s.heroSection}>
            <QRThumb
              value={`LANCHAI-ORDER:${orderId}`}
              size={QR_ORDER}
              variant="order"
              onPress={() => setLightbox({ value: `LANCHAI-ORDER:${orderId}`, label: 'Order QR' })}
            />
          </View>
        )}

        {/* ── Headline ── */}
        <Text style={s.title}>Booking confirmation</Text>
        <Text style={s.subtitle}>
          All set! Your items are waiting patiently and pretending not to be excited to see you.
        </Text>

        {/* ── Status chip ── */}
        <View style={s.statusChip}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>Pending payment at pick-up</Text>
        </View>

        {/* ── Per-item rows (grouped only — horizontal: text left, QR right) ── */}
        {!isSingle && reservations.map(res => (
          <View key={res.id} style={s.itemCard}>
            <View style={s.itemInfo}>
              <Text style={s.itemName} numberOfLines={2}>{res.productName}</Text>
              <View style={s.itemDateRow}>
                <Text style={s.itemDateLabel}>Pick-up</Text>
                <Text style={s.itemPickupText}>{res.pickupLabel}</Text>
              </View>
              <Text style={s.pickupDelayNote}>
                Ready within {PICKUP_DELAY_MS / 3_600_000}h of this confirmation
              </Text>
              <View style={s.itemDateRow}>
                <Text style={s.itemDateLabel}>Return</Text>
                <Text style={s.itemPickupText}>{res.returnLabel}</Text>
              </View>
            </View>
            <QRThumb
              value={`LANCHAI-RES:${res.id}`}
              onPress={() =>
                setLightbox({ value: `LANCHAI-RES:${res.id}`, label: res.productName })
              }
            />
          </View>
        ))}

        {/* ── Totals reminder ── */}
        <View style={s.totalsCard}>
          <BillingSummary
            subtotalHt={vatHt}
            vatAmount={vatAmount}
            vatPct={vatPct}
            total={totalRental}
            totalLabel="Total to pay at pick-up"
            deposit={totalDeposit}
            depositLabel="Deposit (refundable)"
          />
        </View>

        {/* ── Actions ── */}
        <WhatsAppButton
          title="Questions about your booking?"
          message={isSingle
            ? `Hi LANCHAI, I have a question about my booking (reservation ID: ${reservations[0].id}).`
            : `Hi LANCHAI, I have a question about my booking (order ID: ${orderId}; reservation IDs: ${reservations.map(r => r.id).join(', ')}).`}
        />

        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => router.replace('/(tabs)/reservations')}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>View my rentals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.75}
        >
          <Text style={s.secondaryBtnText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Lightbox overlay (absolutely positioned — no Modal, avoids Android SDK 54 issues) ── */}
      {lightbox && (
        <QRLightbox
          value={lightbox.value}
          label={lightbox.label}
          onClose={closeLightbox}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.fg3,
    textAlign: 'center',
  },
  errorLink: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },

  // Scroll content
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
    gap: 16,
  },

  // ── Hero section (top, replaces check icon) ──────────────────────────────
  heroSection: {
    alignItems: 'center',
    gap: 8,
  },

  // Single: neutral QR + product info
  heroProductName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginTop: 2,
  },
  heroPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroPeriodLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    width: 52,
    flexShrink: 0,
  },
  heroPickupText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  pickupDelayNote: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },

  // ── Headline ─────────────────────────────────────────────────────────────
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg3,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },

  // ── Status chip ───────────────────────────────────────────────────────────
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(244,180,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244,180,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C98F00',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A5500',
    letterSpacing: 0.2,
  },

  // ── Per-item cards (grouped only, horizontal layout) ─────────────────────
  itemCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  itemInfo: {
    flex: 1,
    gap: 5,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  itemDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  itemDateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    width: 52,
    flexShrink: 0,
  },
  itemPickupText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },

  // ── Totals reminder ───────────────────────────────────────────────────────
  totalsCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
  },
  // ── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    alignSelf: 'stretch',
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.fg3,
  },

});
