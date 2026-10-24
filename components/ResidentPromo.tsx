import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/Colors';
import { auth } from '@/lib/auth';
import { useResidentPromo } from '@/lib/residency';

// Resident-status promo for tourists ("Live in Laos? Residents pay a X% lower deposit")
// — X from config/loyalty (residentDepositSavingPercent). Hidden for residents, business
// accounts and while a request is pending (useResidentPromo). Opens ID & residency; the
// booking screens stay mounted underneath, so the selection is kept on return.

/** Small amber line under the deposit (booking summary, bag checkout). */
export function ResidentPromoHint({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const pct = useResidentPromo();
  if (pct == null) return null;
  return (
    <TouchableOpacity style={[s.hint, style]} onPress={() => router.push('/profile/id-residency')} activeOpacity={0.75}>
      <Feather name="home" size={13} color={COLORS.amberTintText} />
      <Text style={s.hintText}>
        Live in Laos? Residents pay a {pct}% lower deposit — <Text style={s.hintLink}>Verify my status</Text>
      </Text>
    </TouchableOpacity>
  );
}

// Dismissal is remembered per user on this device (AsyncStorage) — no Firestore field,
// so the users allow-list stays unchanged. Reinstalling the app shows it again.
const dismissKey = (uid: string) => `residentPromoDismissed:${uid}`;

/** Dismissible card on My Account for unverified tourists. */
export function ResidentPromoCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const pct = useResidentPromo();
  const uid = auth.currentUser?.uid ?? null;
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(dismissKey(uid)).then(v => setDismissed(v === '1')).catch(() => setDismissed(false));
  }, [uid]);

  if (pct == null || !uid || dismissed !== false) return null;
  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(dismissKey(uid), '1').catch(() => {});
  };
  return (
    <View style={[s.card, style]}>
      <TouchableOpacity style={s.close} onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <Feather name="x" size={16} color={COLORS.fg3} />
      </TouchableOpacity>
      <Text style={s.cardTitle}>Live in Laos? Pay a {pct}% lower deposit</Text>
      <Text style={s.cardBody}>Verify your resident status once — your next bookings get the resident deposit.</Text>
      <TouchableOpacity style={s.cardBtn} onPress={() => router.push('/profile/id-residency')} activeOpacity={0.85}>
        <Text style={s.cardBtnText}>Verify my status</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.amberTint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8,
  },
  hintText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.amberTintText, lineHeight: 17 },
  hintLink: { fontWeight: '800', textDecorationLine: 'underline' },
  card: {
    backgroundColor: COLORS.amberTint, borderWidth: 1, borderColor: COLORS.amberTintBorder,
    borderRadius: 14, padding: 14, paddingRight: 36,
  },
  close: { position: 'absolute', top: 10, right: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  cardBody: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 18, marginTop: 4 },
  cardBtn: {
    alignSelf: 'flex-start', marginTop: 10, backgroundColor: COLORS.amber, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  cardBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.carbon },
});
