import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, IconCircle, useScreenInsets } from '@/components/account/ui';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import PressScale from '@/components/PressScale';

export default function PickupLocationScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const shop   = useShopInfo();

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <View style={[UI.screenContent, { paddingBottom: screen.contentBottom }]}>
        <SectionTitle style={{ marginTop: 16 }}>Our shop</SectionTitle>
        <View style={[UI.card, UI.cardPadded]}>
          <View style={s.top}>
            <IconCircle icon={{ name: 'map-pin' }} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={UI.title}>{shop.name}</Text>
              <Text style={UI.subtitle}>{shop.addressLine}</Text>
              <Text style={UI.subtitle}>{shop.city}</Text>
            </View>
          </View>
          <View style={UI.divider} />
          <View style={s.hours}>
            <Feather name="clock" size={14} color={SHADES.carbonMuted} />
            <Text style={[UI.body, { flex: 1 }]}>{shop.hours}</Text>
          </View>
          <Text style={[UI.small, { marginTop: 6 }]}>Pick up and return your rentals here.</Text>

          <PressScale
            style={[UI.btnPrimary, { marginTop: 16 }]}
            onPress={() => Linking.openURL(buildMapsUrl(shop))}
            activeOpacity={0.85}
          >
            <Feather name="map" size={16} color={SHADES.carbon} />
            <Text style={UI.btnPrimaryText}>Get directions</Text>
          </PressScale>
        </View>
      </View>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Pick-up location</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

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

  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hours: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
