import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

// ── Dark theme palette ──────────────────────────────────────────────────────
const BG     = '#000000';
const CARD   = '#111111';
const CARD2  = '#181818';
const BORDER = '#2A2A2A';
const YELLOW = '#F4B400';
const WHITE  = '#FFFFFF';
const GRAY   = 'rgba(255,255,255,0.5)';

const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `${dow[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function BookingConfirmationScreen() {
  const {
    bookingId,
    productName,
    startDate,
    endDate,
    quantity,
    totalPrice,
  } = useLocalSearchParams<{
    bookingId: string;
    productName: string;
    startDate: string;
    endDate: string;
    quantity: string;
    totalPrice: string;
  }>();
  const router = useRouter();

  const qty = Number(quantity ?? 1);
  const price = Number(totalPrice ?? 0);

  const rows = [
    { label: 'Booking ID',  value: bookingId ?? '—',             mono: true  },
    { label: 'Item',        value: productName ?? '—'                         },
    { label: 'Pick-up',     value: startDate ? fmtDate(startDate) : '—'      },
    { label: 'Return',      value: endDate ? fmtDate(endDate) : '—'           },
    { label: 'Quantity',    value: `${qty} unit${qty !== 1 ? 's' : ''}`       },
    { label: 'Total paid',  value: price > 0 ? `${price}K LAK` : '—'         },
  ];

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Tick ── */}
        <View style={s.tickWrap}>
          <View style={s.tick}>
            <Feather name="check" size={40} color={BG} />
          </View>
          <View style={s.tickRing} />
        </View>

        {/* ── Headline ── */}
        <Text style={s.headline}>
          You're{' '}
          <Text style={s.headlineAccent}>booked.</Text>
        </Text>
        <Text style={s.sub}>
          We'll send you a confirmation text.{'\n'}
          Bring your booking ID to pick up.
        </Text>

        {/* ── Booking card ── */}
        <View style={s.card}>
          {rows.map((row, i) => (
            <View
              key={i}
              style={[s.row, i === rows.length - 1 && s.rowLast]}
            >
              <Text style={s.rowLabel}>{row.label}</Text>
              <Text
                style={[
                  s.rowValue,
                  row.mono && s.rowMono,
                  row.label === 'Total paid' && s.rowValueAccent,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Pick-up info ── */}
        <View style={s.pickupCard}>
          <View style={s.pickupIcon}>
            <Feather name="map-pin" size={16} color={YELLOW} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.pickupTitle}>LANCHAI · Setthathirath shop</Text>
            <Text style={s.pickupSub}>Vientiane · Mon–Sat 9am–7pm</Text>
            <Text style={s.pickupSub}>Ready in 90 sec. Bring your booking ID.</Text>
          </View>
        </View>

        {/* ── CTAs ── */}
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => router.replace('/(tabs)/reservations')}
          activeOpacity={0.85}
        >
          <Text style={s.btnPrimaryText}>View my reservations</Text>
          <Feather name="arrow-right" size={16} color={BG} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.btnSecondary}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.8}
        >
          <Text style={s.btnSecondaryText}>Back to home</Text>
        </TouchableOpacity>

        {/* tagline */}
        <Text style={s.tagline}>Rent. Return. Repeat.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 32 : 48,
    paddingBottom: 40,
  },

  // Tick
  tickWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  tick: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  tickRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: 'rgba(244,180,0,0.25)',
  },

  // Headline
  headline: {
    fontSize: 38,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 10,
  },
  headlineAccent: {
    color: YELLOW,
  },
  sub: {
    fontSize: 14,
    fontWeight: '400',
    color: GRAY,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 32,
  },

  // Booking card
  card: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.1,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowMono: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    letterSpacing: 0.5,
    color: YELLOW,
  },
  rowValueAccent: {
    color: YELLOW,
    fontSize: 15,
    fontWeight: '800',
  },

  // Pick-up card
  pickupCard: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 28,
  },
  pickupIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  pickupSub: {
    fontSize: 12,
    fontWeight: '400',
    color: GRAY,
    lineHeight: 17,
  },

  // Buttons
  btnPrimary: {
    width: '100%',
    height: 54,
    backgroundColor: YELLOW,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: BG,
    letterSpacing: -0.2,
  },
  btnSecondary: {
    width: '100%',
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: GRAY,
  },

  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.15)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
