import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useShopInfo } from '@/lib/shop';

// ── FAQ content ───────────────────────────────────────────────────────────────

type FaqItem =
  | { q: string; a: string;       icon: string }
  | { q: string; dynamic: true;   icon: string };

const PICKUP_IDX = 4;

const ITEMS: FaqItem[] = [
  {
    icon: 'shield',
    q: 'How does the deposit work?',
    a: "A refundable security deposit is required for every rental. The amount depends on the item's value and is shown at checkout. It's separate from your rental fee, collected in store when you pick up the item, and refunded within 48h after you return it, once we've checked its condition.",
  },
  {
    icon: 'credit-card',
    q: 'How do I pay?',
    a: "To reserve, you pay a 40% advance of the rental fee, and the remaining balance when you pick up the item. We accept cash, bank transfer, and QR payment. Prices are in Lao Kip (LAK); payment in USD or THB may be possible at the day's exchange rate. The security deposit is paid separately, in store at pick-up.",
  },
  {
    icon: 'clock',
    q: 'How is the rental duration counted?',
    a: 'One rental day is 24 hours, counted from your pick-up time to your return time — not by calendar dates. For example, picking up Friday at 10:00 and returning Saturday at 10:00 is 1 day (24h). Longer rentals cost less per day.',
  },
  {
    icon: 'file-text',
    q: 'What do I need to rent?',
    a: "A valid ID (passport, ID card, or driver's license), plus your name, phone, and email. You'll sign a short rental contract, and at pick-up we note the item's condition together with photos.",
  },
  {
    icon: 'map-pin',
    q: 'Where do I pick up and return?',
    dynamic: true,
  },
  {
    icon: 'x-circle',
    q: 'Can I cancel my reservation?',
    a: 'Yes. More than 48 hours before pick-up: full refund. Between 48 and 24 hours before pick-up: a non-transferable credit note (not a cash refund). Less than 24 hours before pick-up: no refund, and the advance payment is kept. For premium items, the advance payment is non-refundable whenever you cancel.',
  },
  {
    icon: 'alert-circle',
    q: 'What happens if I return late?',
    a: "The 24h clock starts at your confirmed pick-up time, so please return on time. A late return can add rental days: up to 24h late adds 1 day, 24–48h adds 1.5 days, and 48–72h adds 2 days. After 72 hours it's treated as a non-return: the deposit is kept and our contract procedure applies. New rentals are paused until any late return is settled.",
  },
  {
    icon: 'alert-triangle',
    q: 'What if the item is damaged or lost?',
    a: "Minor reversible marks (light scratches, normal wear) are free. Damage that partially limits use — a crack, a missing part, a blocked function — is charged at 50% of the item's value. Damage or loss that makes the item unusable is charged at its full value plus a 10% admin fee.",
  },
  {
    icon: 'user',
    q: 'What do account types mean?',
    a: "Your account type (Tourist, Resident, or Business) can affect your deposit. It's set by LANCHAI — contact us if you think yours should be updated.",
  },
  {
    icon: 'cloud',
    q: 'What about events beyond your control?',
    a: "In case of force majeure (natural disasters, major power outages, administrative or political/health disruptions), rentals may be suspended. Days already used aren't refunded, and we'll arrange a postponement when possible.",
  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FaqScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const shop   = useShopInfo();

  const [openSet, setOpenSet] = useState<ReadonlySet<number>>(new Set());

  function toggle(idx: number) {
    setOpenSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function resolveAnswer(idx: number): string {
    const item = ITEMS[idx];
    if ('dynamic' in item) {
      return `Pick-up and return both happen at our shop: ${shop.name}, ${shop.addressLine}, ${shop.city}. Open ${shop.hours}.`;
    }
    return item.a;
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>FAQ</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={s.subtitle}>Everything to know before you rent.</Text>

        {ITEMS.map((item, idx) => {
          const open = openSet.has(idx);
          return (
            <View key={idx} style={s.card} accessible={false}>
              <TouchableOpacity
                style={s.cardHeader}
                onPress={() => toggle(idx)}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <View style={[s.iconBox, open && s.iconBoxOpen]}>
                  <Feather name={item.icon as never} size={15} color={open ? '#854F0B' : COLORS.fg2} />
                </View>

                {/* Question */}
                <Text style={s.question}>{item.q}</Text>

                {/* Chevron */}
                <Feather
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={open ? COLORS.amber : COLORS.fg3}
                  style={s.chevron}
                />
              </TouchableOpacity>

              {open && (
                <View style={s.answerBox}>
                  <Text style={s.answerText}>{resolveAnswer(idx)}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
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

  // Scroll content
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    marginBottom: 16,
    marginLeft: 2,
  },

  // Card per item
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(30,30,30,0.15)',
    marginBottom: 10,
    overflow: 'hidden',
  },

  // Question row
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxOpen: {
    backgroundColor: '#FBE8C4',
  },
  question: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  chevron: {
    flexShrink: 0,
  },

  // Answer inset box
  answerBox: {
    backgroundColor: '#F4F1EA',
    borderRadius: 9,
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 0,
    padding: 13,
  },
  answerText: {
    fontSize: 13.5,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 21,
  },
});
