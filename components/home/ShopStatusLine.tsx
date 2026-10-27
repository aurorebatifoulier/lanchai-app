import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import { shopOpenState } from '@/functions/src/shared/shop';

// Small "Open now · until 21:00 · Khouvieng Road" + "Directions" line, live from
// config/shop (Vientiane time, re-evaluated every minute). Hidden if the hours can't be read.
export default function ShopStatusLine() {
  const shop = useShopInfo();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const state = shopOpenState(shop, now);
  if (!state) return null;
  const street = shop.addressLine.split(',').find(p => /[a-z]/i.test(p) && !/^\s*\d+\s*$/.test(p))?.trim()
    .replace(/^\d+\s+/, '') ?? '';
  const text = [HOME_COPY.shopStatus(state), street].filter(Boolean).join(' · ');

  return (
    <View style={s.row}>
      <View style={[s.dot, state.kind === 'open' ? s.dotOpen : s.dotClosed]} />
      <Text style={s.text} numberOfLines={1}>{text}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(buildMapsUrl(shop))} hitSlop={8} style={s.link} activeOpacity={0.7}>
        <Feather name="navigation" size={12} color={SHADES.amberText} />
        <Text style={[UI.link, s.linkText]}>{HOME_COPY.directions}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOpen: { backgroundColor: SHADES.amber },
  dotClosed: { backgroundColor: SHADES.carbonFaint },
  text: { flex: 1, fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 12.5 },
});
