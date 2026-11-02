import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import { AUTH_COPY } from '@/constants/authCopy';
import { UI, Row, RowGroup, SectionTitle, IconCircle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import LanchaiMark from '@/components/LanchaiMark';
import { useShopInfo, buildWhatsappUrl, normalizeWhatsappNumber, isValidWhatsappNumber } from '@/lib/shop';

const g = AUTH_COPY.guest;
const CONTACT_EMAIL = 'contact@lanchai.la';

/** Sign in / Create account buttons — guest Account and My rentals tabs. */
export function GuestAuthButtons() {
  const router = useRouter();
  return (
    <View style={s.btns}>
      <PressScale style={[UI.btnPrimary, { flex: 1 }]} onPress={() => router.push('/login')}>
        <Text style={UI.btnPrimaryText}>{g.signIn}</Text>
      </PressScale>
      <PressScale style={[UI.btnSecondary, { flex: 1 }]} onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } } as never)}>
        <Text style={UI.btnSecondaryText}>{g.createAccount}</Text>
      </PressScale>
    </View>
  );
}

// Account tab for a guest (anonymous session): who they are, how to sign in, and the
// public links (FAQ, contact, legal). No chat until signed in.
export function GuestAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shop = useShopInfo();
  const wa = normalizeWhatsappNumber(shop.whatsappNumber ?? '');
  const waUrl = isValidWhatsappNumber(wa) ? buildWhatsappUrl(wa, 'Hi LANCHAI!') : null;

  return (
    <ScrollView style={s.root} contentContainerStyle={[UI.screenContent, { paddingTop: insets.top + 20, paddingBottom: 32 }]}>
      <View style={[UI.card, UI.cardPadded, s.hero]}>
        <IconCircle icon={{ name: 'user' }} tone="amber" size={52} />
        <Text style={s.title}>{g.accountTitle}</Text>
        <Text style={[UI.body, s.center]}>{g.accountSub}</Text>
        <GuestAuthButtons />
      </View>

      <SectionTitle>{g.help}</SectionTitle>
      <RowGroup>
        <Row icon={{ name: 'help-circle' }} title={g.faq} sub={g.faqSub} onPress={() => router.push('/profile/faq')} />
        {waUrl && (
          <Row icon={{ set: 'mci', name: 'whatsapp' }} tone="amber" title={g.whatsapp} sub={g.whatsappSub}
            onPress={() => Linking.openURL(waUrl).catch(() => {})} />
        )}
        <Row icon={{ name: 'mail' }} title={g.email} sub={CONTACT_EMAIL}
          onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {})} />
      </RowGroup>

      <SectionTitle>{g.legal}</SectionTitle>
      <RowGroup>
        <Row icon={{ name: 'file-text' }} title={g.terms} onPress={() => router.push('/legal/terms')} />
        <Row icon={{ name: 'shield' }} title={g.privacy} onPress={() => router.push('/legal/privacy')} />
        <Row icon={{ name: 'rotate-ccw' }} title={g.cancellation} onPress={() => router.push('/legal/cancellation')} />
      </RowGroup>

      <View style={s.footer}>
        <LanchaiMark size={18} color={SHADES.carbonFaint} hexColor={SHADES.carbonFaint} />
      </View>
    </ScrollView>
  );
}

/** My rentals tab for a guest. */
export function GuestRentals() {
  return (
    <View style={[UI.card, UI.cardPadded, s.hero, { marginTop: 8 }]}>
      <IconCircle icon={{ name: 'package' }} tone="amber" size={52} />
      <Text style={s.title}>{AUTH_COPY.guest.rentalsTitle}</Text>
      <Text style={[UI.body, s.center]}>{AUTH_COPY.guest.rentalsSub}</Text>
      <GuestAuthButtons />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  hero: { alignItems: 'center', gap: 8 },
  title: { ...TYPE.sectionTitle, color: SHADES.carbon, textAlign: 'center', marginTop: 6 },
  center: { textAlign: 'center' },
  btns: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 10 },
  footer: { alignItems: 'center', marginTop: 28 },
});
