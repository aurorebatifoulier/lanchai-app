import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { UI, useScreenInsets } from '@/components/account/ui';
import { clearHomeCache } from '@/lib/homeCache';
import { backfillProductThumbs, findProductsMissingThumbs, type ThumbBackfillItem } from '@/lib/productThumbs';

// Admin → Product thumbnails: one-off backfill of the 600 px copies (`thumbs`) for
// products saved before thumbnails existed. 1) "Check" = dry run (no writes): lists the
// products whose thumbnails are missing or out of line with their photos. 2) "Generate"
// processes them one by one on this phone (download → resize → upload → write `thumbs`);
// a failure is listed and skipped. Safe to run again: only what's still missing is done.
// New photos get their thumbnail when the product is saved (admin product form).
export default function ProductThumbsScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [items, setItems] = useState<ThumbBackfillItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setChecking(true); setError(null); setFailed([]); setDone(0);
    try { setItems(await findProductsMissingThumbs()); } catch { setError('Couldn’t read the products. Please try again.'); }
    setChecking(false);
  };

  const run = async () => {
    if (!items?.length) return;
    setRunning(true); setDone(0); setFailed([]);
    const bad: string[] = [];
    for (const it of items) {
      try { await backfillProductThumbs(it.id); } catch (err) {
        console.warn('[thumbs] backfill failed', it.id, err);
        bad.push(it.name);
      }
      setDone(n => n + 1);
    }
    setFailed(bad);
    clearHomeCache('products');
    setRunning(false);
    try { setItems(await findProductsMissingThumbs()); } catch {}
  };

  const photos = items?.reduce((n, i) => n + i.photos, 0) ?? 0;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Product thumbnails</Text>
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom, gap: 12 }]}>
        <Text style={UI.body}>
          Cards, rails, the bag and orders load a small 600 px copy of each photo. New photos get one when you save a product. Use this once for products saved before.
        </Text>
        <PressScale style={[UI.btnSecondary, (checking || running) && UI.btnDisabled]} disabled={checking || running} onPress={check}>
          {checking ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnSecondaryText}>Check (dry run)</Text>}
        </PressScale>
        {!!error && <Text style={UI.errorText}>{error}</Text>}
        {items && (
          <View style={[UI.card, UI.cardPadded, { gap: 8 }]}>
            <Text style={UI.title}>
              {items.length === 0 ? 'Every product has its thumbnails.' : `${items.length} product${items.length === 1 ? '' : 's'} · ${photos} photo${photos === 1 ? '' : 's'} to process`}
            </Text>
            {items.slice(0, 50).map(it => (
              <Text key={it.id} style={UI.subtitle}>{it.name} · {it.photos} photo{it.photos === 1 ? '' : 's'}</Text>
            ))}
            {items.length > 50 && <Text style={UI.subtitle}>+ {items.length - 50} more</Text>}
          </View>
        )}
        {!!items?.length && (
          <PressScale style={[UI.btnPrimary, running && UI.btnDisabled]} disabled={running} onPress={run}>
            {running
              ? <Text style={UI.btnPrimaryText}>Generating… {done} / {items.length}</Text>
              : <Text style={UI.btnPrimaryText}>Generate thumbnails</Text>}
          </PressScale>
        )}
        {failed.length > 0 && (
          <Text style={UI.errorText}>Not done (try again): {failed.join(', ')}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: SHADES.carbon },
});
