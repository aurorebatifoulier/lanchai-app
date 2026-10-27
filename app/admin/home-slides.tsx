import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle, StatusChip, useScreenInsets } from '@/components/account/ui';
import { HERO_BUILT_IN } from '@/components/home/builtInSlides';
import { WHY_RENT_SLIDES } from '@/components/WhyRentSection';
import { isCollectionActive } from '@/lib/collections';
import {
  getAllSlides, createSlide, updateSlide, deleteSlide, saveSlideOrder,
  type HomeSlide, type HomeSlideInput, type SlideLink, type SlidePlacement,
} from '@/lib/homeSlides';

const PLACEMENTS: { key: SlidePlacement; label: string; sub: string }[] = [
  { key: 'hero', label: 'Hero carousel', sub: 'Top of the Home.' },
  { key: 'banner', label: 'Banner', sub: 'Between New arrivals and Rent again.' },
];

/** The built-in slides as unpublished drafts without photos ("Create example drafts"). */
function exampleDrafts(): HomeSlideInput[] {
  const base = { imagePath: null, imageUrl: null, activeFrom: null, activeTo: null, published: false };
  const linkFor = (route: string): SlideLink =>
    route.startsWith('/category/') ? { kind: 'category', id: route.slice('/category/'.length) } : { kind: 'explore' };
  return [
    ...HERO_BUILT_IN.map((h, i) => ({
      ...base, placement: 'hero' as const, order: i,
      title: h.title.replace(/\n/g, ' '), subtitle: h.subtitle, ctaLabel: h.cta, link: linkFor(h.route),
    })),
    ...WHY_RENT_SLIDES.map((w, i) => ({
      ...base, placement: 'banner' as const, order: i,
      title: w.title, subtitle: w.description, ctaLabel: '', link: { kind: 'none' as const },
    })),
  ];
}

// Admin → Home slides: the hero carousel and the mid-page banner. Per placement: order
// (↑/↓), published toggle, delete (inline confirm), edit. No published slide for a
// placement → the Home shows its built-in slides.
export default function AdminHomeSlidesScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getAllSlides()
      .then(list => { setSlides(list); setError(null); })
      .catch(() => setError("Couldn't load slides."))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); } catch { setError(msg); }
    finally { setBusy(false); load(); }
  };

  const move = (list: HomeSlide[], i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= list.length || busy) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    run(() => saveSlideOrder(next.map(x => x.id)), "Couldn't save the order.");
  };

  const seed = () => run(async () => {
    for (const d of exampleDrafts()) await createSlide(d);
  }, "Couldn't create the example drafts.");

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Home slides</Text>
      </View>

      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom }]}>
        <Text style={UI.body}>
          Published slides in their dates replace the built-in ones. Landscape photos, about 1080 × 480.
        </Text>
        <TouchableOpacity style={[UI.btnPrimary, { marginTop: 16 }]} onPress={() => router.push('/admin/home-slide-form' as never)} activeOpacity={0.85}>
          <Feather name="plus" size={18} color={SHADES.carbon} />
          <Text style={UI.btnPrimaryText}>New slide</Text>
        </TouchableOpacity>
        {error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginTop: 32 }} />
        ) : (
          <>
            {slides.length === 0 && (
              <View style={[UI.card, UI.cardPadded, { marginTop: 16, gap: 12 }]}>
                <Text style={UI.title}>No slides yet</Text>
                <Text style={UI.body}>Start from the current built-in slides as drafts (no photos) and edit them.</Text>
                <TouchableOpacity style={[UI.btnSecondary, busy && UI.btnDisabled]} onPress={seed} disabled={busy} activeOpacity={0.8}>
                  <Text style={UI.btnSecondaryText}>Create example drafts</Text>
                </TouchableOpacity>
              </View>
            )}
            {PLACEMENTS.map(pl => {
              const list = slides.filter(x => x.placement === pl.key);
              return (
                <View key={pl.key}>
                  <SectionTitle>{pl.label}</SectionTitle>
                  <Text style={[UI.small, { marginTop: -6, marginBottom: 10 }]}>{pl.sub}</Text>
                  {list.length === 0 ? (
                    <Text style={UI.body}>No slide — the built-in ones are shown.</Text>
                  ) : list.map((x, i) => (
                    <View key={x.id} style={[UI.card, s.item]}>
                      <View style={s.itemRow}>
                        <TouchableOpacity
                          style={s.itemMain}
                          onPress={() => router.push({ pathname: '/admin/home-slide-form', params: { id: x.id } } as never)}
                          activeOpacity={0.75}
                        >
                          <View style={s.thumb}>
                            {x.imageUrl
                              ? <Image source={{ uri: x.imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                              : <Feather name="image" size={18} color={SHADES.carbonFaint} />}
                          </View>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={UI.title} numberOfLines={1}>{x.title || 'Photo only'}</Text>
                            <View style={{ flexDirection: 'row' }}>
                              <StatusChip
                                label={!x.published ? 'Draft' : isCollectionActive(x) ? 'Published' : 'Out of dates'}
                                tone={x.published && isCollectionActive(x) ? 'amber' : 'grey'}
                              />
                            </View>
                          </View>
                        </TouchableOpacity>
                        <View style={s.arrows}>
                          <TouchableOpacity onPress={() => move(list, i, -1)} disabled={i === 0 || busy} hitSlop={6} style={(i === 0 || busy) && UI.btnDisabled}>
                            <Feather name="chevron-up" size={20} color={SHADES.carbon} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => move(list, i, 1)} disabled={i === list.length - 1 || busy} hitSlop={6} style={(i === list.length - 1 || busy) && UI.btnDisabled}>
                            <Feather name="chevron-down" size={20} color={SHADES.carbon} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={s.actions}>
                        <Text style={[UI.small, { flex: 1 }]}>Published</Text>
                        <Switch
                          value={x.published}
                          disabled={busy}
                          onValueChange={v => run(() => updateSlide(x.id, { published: v }), "Couldn't update the slide.")}
                          trackColor={{ false: SHADES.border, true: SHADES.amber }}
                          thumbColor={SHADES.white}
                        />
                        <TouchableOpacity onPress={() => setConfirmDelete(x.id)} hitSlop={8} style={{ marginLeft: 14 }}>
                          <Text style={UI.dangerText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                      {confirmDelete === x.id && (
                        <View style={{ marginTop: 10 }}>
                          <ConfirmBox
                            text="Delete this slide and its photo?"
                            confirmLabel="Delete"
                            destructive
                            onCancel={() => setConfirmDelete(null)}
                            onConfirm={() => { setConfirmDelete(null); run(() => deleteSlide(x), "Couldn't delete the slide."); }}
                            confirmDisabled={busy}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  item: { padding: 12, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 32, borderRadius: 8, backgroundColor: SHADES.carbonLight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  arrows: { gap: 6, paddingLeft: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: SHADES.border },
});
