import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';

export default function PickupLocationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const shop   = useShopInfo();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <View style={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={s.helper}>Pick up and return your rentals here.</Text>

        <View style={s.card}>
          <View style={s.cardIcon}>
            <Feather name="map-pin" size={20} color={COLORS.carbon} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.shopName}>{shop.name}</Text>
            <Text style={s.shopAddress}>{shop.addressLine}</Text>
            <Text style={s.shopCity}>{shop.city}</Text>
            <Text style={s.shopHours}>{shop.hours}</Text>

            <TouchableOpacity
              style={s.directionsBtn}
              onPress={() => Linking.openURL(buildMapsUrl(shop))}
              activeOpacity={0.85}
            >
              <Feather name="map" size={14} color={COLORS.carbon} />
              <Text style={s.directionsBtnText}>Get directions</Text>
            </TouchableOpacity>
          </View>
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

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  helper: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg2,
    marginBottom: 20,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  shopName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  shopAddress: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
  },
  shopCity: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
  },
  shopHours: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 4,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    height: 36,
    paddingHorizontal: 14,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  directionsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});
