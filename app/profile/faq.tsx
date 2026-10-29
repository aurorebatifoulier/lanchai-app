import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle, useScreenInsets } from '@/components/account/ui';
import { useShopInfo, openHoursText } from '@/lib/shop';
import WhatsAppButton from '@/components/WhatsAppButton';

// ── FAQ content ───────────────────────────────────────────────────────────────

type FaqItem =
  | { q: string; a: string;       icon: string }
  | { q: string; dynamic: true;   icon: string };

const PICKUP_IDX = 4;

const ITEMS: FaqItem[] = [
  {
    icon: 'shield',
    q: 'How does the deposit work?',
    a: "A refundable security deposit is required for every rental. The amount depends on the item's value and your account type, and applies per unit (2 chairs = 2 deposits). It's shown before you confirm. It's separate from your rental fee, collected in store when you pick up the item, and refunded on the spot when you return it, right after a quick inspection (about 10 minutes).",
  },
  {
    icon: 'credit-card',
    q: 'How do I pay?',
    a: "Nothing to pay online and no advance — you pay the rental fee in store at pick-up, in cash (LAK, USD or THB), by Lao bank transfer or by QR payment. Prices are in Lao Kip (LAK); USD and THB are accepted at the day's exchange rate. The deposit is paid at pick-up too, and refunded on the spot when you return the item.",
  },
  {
    icon: 'clock',
    q: 'How is the rental duration counted?',
    a: 'One rental day is 24 hours, counted from your pick-up time to your return time — not by calendar dates. For example, picking up Friday at 10:00 and returning Saturday at 10:00 is 1 day (24h). Longer rentals cost less per day.',
  },
  {
    icon: 'file-text',
    q: 'What do I need to rent?',
    a: "A valid passport or ID card, plus your name, phone and email. You can add a photo of your ID in the app (Account → ID & residency), or show it at the shop on your first pick-up — we check it there. You'll sign the rental agreement at pick-up, and we note the item's condition together with photos.",
  },
  {
    icon: 'map-pin',
    q: 'Where do I pick up and return?',
    dynamic: true,
  },
  {
    icon: 'x-circle',
    q: 'Can I cancel my reservation?',
    a: "Yes, for free, at any time before pick-up — nothing is charged before pick-up. If you can't come, please cancel in the app (My rentals) so someone else can rent the item.",
  },
  {
    icon: 'calendar',
    q: "What if I can't make it to my pick-up?",
    a: "Please cancel in the app, or message us. If you don't come and haven't cancelled, the booking is released and nothing is charged, but new bookings are paused until you contact us.",
  },
  {
    icon: 'alert-circle',
    q: 'What happens if I return late?',
    a: "The 24h clock starts at your confirmed pick-up time, so please return on time. A late return can add rental days: up to 24h late adds 1 day, 24–48h adds 1.5 days, and 48–72h adds 2 days. After 72 hours it's treated as a non-return: the deposit may be kept and our contract procedure applies. New bookings are paused until any late return is settled. Our team can reduce or waive late fees.",
  },
  {
    icon: 'alert-triangle',
    q: 'What if the item is damaged or lost?',
    a: "Minor reversible marks (light scratches, normal wear) are free. If an item is damaged, we charge a share of its replacement value depending on the damage, explained to you at return — the full replacement value if the item is unusable or lost. If you rented several units, only the units concerned are charged. Charges are deducted from your deposit, and our team can reduce or waive them.",
  },
  {
    icon: 'user',
    q: 'What do account types mean?',
    a: "Your account type (Tourist, Resident, or Business) can affect your deposit — residents pay a lower one. Live in Laos? Ask for resident status in Account → ID & residency; we check your documents and confirm it.",
  },
  {
    icon: 'gift',
    q: 'How does inviting a friend work?',
    a: "Share your invite code (Account → Loyalty, or Invite a friend). Your friend enters it when signing up, or before their first booking. When their first rental is returned, you both get bonus points. Codes can't be used on your own account, and business accounts aren't part of the programme.",
  },
  {
    icon: 'cloud',
    q: 'What about events beyond your control?',
    a: "In case of force majeure (natural disasters, major power outages, administrative or political/health disruptions), rentals may be suspended. Days already used aren't refunded, and we'll arrange a postponement when possible.",
  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FaqScreen() {
  const screen = useScreenInsets();
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
      return `Pick-up and return both happen at our shop: ${shop.name}, ${shop.addressLine}, ${shop.city}. ${openHoursText(shop.hours)}.`;
    }
    return item.a;
  }

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>FAQ</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: screen.contentBottom }]}
      >
        <Text style={s.subtitle}>Everything to know before you rent.</Text>

        {ITEMS.map((item, idx) => {
          const open = openSet.has(idx);
          return (
            <View key={idx} style={[UI.card, s.card]} accessible={false}>
              <TouchableOpacity
                style={s.cardHeader}
                onPress={() => toggle(idx)}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <IconCircle icon={{ name: item.icon as never }} />

                {/* Question */}
                <Text style={s.question}>{item.q}</Text>

                {/* Chevron */}
                <Feather
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={open ? SHADES.carbon : SHADES.carbonFaint}
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

        <WhatsAppButton
          title="Didn't find your answer?"
          message="Hi LANCHAI, I couldn't find the answer to my question in the FAQ."
          style={s.whatsapp}
          variant="row"
        />
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

  // Scroll content (My Account design — components/account/ui.tsx)
  content: { paddingHorizontal: 16, paddingTop: 20 },
  subtitle: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 14, marginLeft: 2 },
  card: { marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  question: { flex: 1, fontSize: 15, fontWeight: '700', color: SHADES.carbon, lineHeight: 20 },
  chevron: { flexShrink: 0 },
  // Answer: cream inset inside the white card.
  answerBox: { backgroundColor: SHADES.cream, borderRadius: 12, marginHorizontal: 12, marginBottom: 12, padding: 13 },
  whatsapp: { marginTop: 16 },
  answerText: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 21 },
});
