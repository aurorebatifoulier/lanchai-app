import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { COLLECTION_SEEDS } from '@/constants/homeCopy';
import BackButton from '@/components/BackButton';
import { UI, StatusChip, useScreenInsets } from '@/components/account/ui';
import {
  getAllCollections, createCollection, saveCollectionOrder, shadeOf, isCollectionActive,
  type CollectionDoc, type CollectionIcon, type CollectionShade,
} from '@/lib/collections';
import PressScale from '@/components/PressScale';

const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function windowText(c: CollectionDoc): string | null {
  if (!c.activeFrom && !c.activeTo) return null;
  const from = c.activeFrom ? fmtDay(c.activeFrom.toDate()) : '…';
  const to = c.activeTo ? fmtDay(c.activeTo.toDate()) : '…';
  return `${from} → ${to}`;
}

// Admin → Collections: the Home "Got plans?" cards. Order (↑/↓), draft/published,
// optional seasonal window. "Create example drafts" seeds 4 unpublished examples.
export default function AdminCollectionsScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [items, setItems] = useState<CollectionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getAllCollections()
      .then(list => { setItems(list); setError(null); })
      .catch(() => setError("Couldn't load collections."))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const move = async (index: number, delta: -1 | 1) => {
    const j = index + delta;
    if (j < 0 || j >= items.length || busy) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    setBusy(true);
    try { await saveCollectionOrder(next.map(c => c.id)); }
    catch { setError("Couldn't save the order."); load(); }
    finally { setBusy(false); }
  };

  const seed = async () => {
    setBusy(true);
    try {
      for (const [i, sd] of COLLECTION_SEEDS.entries()) {
        await createCollection({
          title: sd.title, subtitle: sd.subtitle,
          icon: sd.icon as CollectionIcon, shade: sd.shade as CollectionShade,
          productIds: [], activeFrom: null, activeTo: null, order: i, published: false,
        });
      }
      load();
    } catch {
      setError("Couldn't create the example drafts.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Collections</Text>
      </View>

      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom }]}>
        <Text style={UI.body}>Shown on Home under &quot;Got plans?&quot; when published, in their dates, and with at least one visible product.</Text>

        <PressScale style={[UI.btnPrimary, s.newBtn]} onPress={() => router.push('/admin/collection-form' as never)} activeOpacity={0.85}>
          <Feather name="plus" size={18} color={SHADES.carbon} />
          <Text style={UI.btnPrimaryText}>New collection</Text>
        </PressScale>

        {error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginTop: 32 }} />
        ) : items.length === 0 ? (
          <View style={[UI.card, UI.cardPadded, { marginTop: 16, gap: 12 }]}>
            <Text style={UI.title}>No collections yet</Text>
            <Text style={UI.body}>Start from 4 example drafts (no products, unpublished) and edit them.</Text>
            <PressScale style={[UI.btnSecondary, busy && UI.btnDisabled]} onPress={seed} disabled={busy} activeOpacity={0.8}>
              <Text style={UI.btnSecondaryText}>Create example drafts</Text>
            </PressScale>
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 10 }}>
            {items.map((c, i) => {
              const shade = shadeOf(c);
              const win = windowText(c);
              const live = c.published && isCollectionActive(c);
              return (
                <View key={c.id} style={[UI.card, s.item]}>
                  <TouchableOpacity
                    style={s.itemMain}
                    onPress={() => router.push({ pathname: '/admin/collection-form', params: { id: c.id } } as never)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.circle, { backgroundColor: shade.bg }]}>
                      <MaterialCommunityIcons name={c.icon} size={20} color={shade.fg} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={UI.title} numberOfLines={1}>{c.title}</Text>
                      <Text style={UI.small} numberOfLines={1}>
                        {c.productIds.length} product{c.productIds.length === 1 ? '' : 's'}{win ? ` · ${win}` : ''}
                      </Text>
                      <View style={{ flexDirection: 'row' }}>
                        <StatusChip label={!c.published ? 'Draft' : live ? 'Published' : 'Out of dates'} tone={!c.published ? 'grey' : live ? 'amber' : 'grey'} />
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={s.arrows}>
                    <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0 || busy} hitSlop={6} style={(i === 0 || busy) && UI.btnDisabled}>
                      <Feather name="chevron-up" size={20} color={SHADES.carbon} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => move(i, 1)} disabled={i === items.length - 1 || busy} hitSlop={6} style={(i === items.length - 1 || busy) && UI.btnDisabled}>
                      <Feather name="chevron-down" size={20} color={SHADES.carbon} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  newBtn: { marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  arrows: { gap: 6, paddingLeft: 8 },
});
