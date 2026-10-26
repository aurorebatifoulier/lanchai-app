import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/Colors';
import { auth } from '@/lib/auth';
import { useResidentPromo } from '@/lib/residency';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';

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
  // Validated mockup: white card, light amber circle with a home icon, two lines, ✕.
  return (
    <TouchableOpacity style={[s.card, style]} onPress={() => router.push('/profile/id-residency')} activeOpacity={0.85}>
      <View style={s.cardIcon}><Feather name="home" size={20} color={SHADES.amberDeep} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{ACCOUNT_COPY.promoTitle}</Text>
        <Text style={s.cardBody}>{ACCOUNT_COPY.promoSub(pct)}</Text>
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={12} accessibilityLabel="Dismiss">
        <Feather name="x" size={18} color={SHADES.carbonMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.amberTint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8,
  },
  hintText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.amberTintText, lineHeight: 17 },
  hintLink: { fontWeight: '800', textDecorationLine: 'underline' },
  card: { ...UI.card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: SHADES.carbon },
  cardBody: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
});
