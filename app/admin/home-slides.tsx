import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Text } from '@/components/AppText';
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
import PressScale from '@/components/PressScale';
import { HOME_BANNERS, type HomeBanner } from '@/constants/homeBanners';
import { mergeHeroList, visibleHeroItems, EMPTY_HERO_STATE, type HeroEntry, type HeroState } from '@/lib/heroItems';
import { getHeroState, saveHeroOrder, setBuiltInPublished } from '@/lib/homeHero';

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

// Admin → Home slides: the hero carousel and the mid-page banner. Hero = your slides AND
// the built-in banners (constants/homeBanners.ts, "Built-in" badge: publish toggle + ↑/↓
// only — no edit, no delete; state in config/homeHero) in ONE order (lib/heroItems.ts);
// nothing published → the Home shows every built-in banner. Banner: order (↑/↓), published
// toggle, delete (inline confirm), edit; no published slide → its built-in slides.
// `embedded`: the "Home slides" tab of Admin → App content (app/admin/app-content.tsx).
export default function AdminHomeSlidesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const screen = useScreenInsets();
  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [heroState, setHeroState] = useState<HeroState>(EMPTY_HERO_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAllSlides(), getHeroState()])
      .then(([list, hero]) => { setSlides(list); setHeroState(hero); setError(null); })
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

  // Hero: slides + built-in banners, one shared order (the whole list rewritten).
  const heroList = mergeHeroList(slides, heroState, HOME_BANNERS);
  const heroFallback = visibleHeroItems(heroList, { isActive: isCollectionActive }).fallback;
  const moveHero = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= heroList.length || busy) return;
    const next = [...heroList];
    [next[i], next[j]] = [next[j], next[i]];
    run(() => saveHeroOrder(next), "Couldn't save the order.");
  };
  const toggleHero = (e: HeroEntry<HomeBanner>, v: boolean) => run(
    () => (e.kind === 'slide' ? updateSlide(e.slide.id, { published: v }) : setBuiltInPublished(e.banner.id, v)),
    "Couldn't update the slide.",
  );

  const seed = () => run(async () => {
    for (const d of exampleDrafts()) await createSlide(d);
  }, "Couldn't create the example drafts.");

  return (
    <View style={[s.root, !embedded && screen.root]}>
      <StatusBar style="dark" />
      {!embedded && (
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Home slides</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom }]}>
        <Text style={UI.body}>
          Hero: your slides and the built-in banners, in one order. Banner: published slides in their dates replace the built-in ones. Landscape photos, 16:9 — about 1600 × 900.
        </Text>
        <PressScale style={[UI.btnPrimary, { marginTop: 16 }]} onPress={() => router.push('/admin/home-slide-form' as never)} activeOpacity={0.85}>
          <Feather name="plus" size={18} color={SHADES.carbon} />
          <Text style={UI.btnPrimaryText}>New slide</Text>
        </PressScale>
        {error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginTop: 32 }} />
        ) : (
          <>
            {slides.length === 0 && (
              <View style={[UI.card, UI.cardPadded, { marginTop: 16, gap: 12 }]}>
                <Text style={UI.title}>No slides yet</Text>
                <Text style={UI.body}>Start from the current built-in slides as drafts (no photos) and edit them.</Text>
                <PressScale style={[UI.btnSecondary, busy && UI.btnDisabled]} onPress={seed} disabled={busy} activeOpacity={0.8}>
                  <Text style={UI.btnSecondaryText}>Create example drafts</Text>
                </PressScale>
              </View>
            )}
            {PLACEMENTS.map(pl => {
              if (pl.key === 'hero') {
                return (
                  <View key={pl.key}>
                    <SectionTitle>{pl.label}</SectionTitle>
                    <Text style={[UI.small, { marginTop: -6, marginBottom: 10 }]}>{pl.sub}</Text>
                    {heroFallback && (
                      <View style={[UI.card, UI.cardPadded, { marginBottom: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
                        <Feather name="info" size={16} color={SHADES.carbonMuted} />
                        <Text style={[UI.small, { flex: 1 }]}>
                          Nothing published right now — the Home shows all {HOME_BANNERS.length} built-in banners.
                        </Text>
                      </View>
                    )}
                    {heroList.map((e, i) => (
                      <View key={e.key} style={[UI.card, s.item]}>
                        <View style={s.itemRow}>
                          <TouchableOpacity
                            style={s.itemMain}
                            disabled={e.kind === 'builtIn'}
                            onPress={() => e.kind === 'slide' && router.push({ pathname: '/admin/home-slide-form', params: { id: e.slide.id } } as never)}
                            activeOpacity={0.75}
                          >
                            <View style={s.thumb}>
                              {e.kind === 'builtIn'
                                ? <Image source={e.banner.image} style={StyleSheet.absoluteFillObject} contentFit="cover" contentPosition={e.banner.focalPoint} />
                                : e.slide.imageUrl
                                  ? <Image source={{ uri: e.slide.imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                  : <Feather name="image" size={18} color={SHADES.carbonFaint} />}
                            </View>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text style={UI.title} numberOfLines={1}>
                                {e.kind === 'builtIn' ? e.banner.title : e.slide.title || 'Photo only'}
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {e.kind === 'builtIn' && <StatusChip label="Built-in" tone="grey" />}
                                <StatusChip
                                  label={!e.published ? 'Draft' : e.kind === 'builtIn' || isCollectionActive(e.slide) ? 'Published' : 'Out of dates'}
                                  tone={e.published && (e.kind === 'builtIn' || isCollectionActive(e.slide)) ? 'amber' : 'grey'}
                                />
                              </View>
                            </View>
                          </TouchableOpacity>
                          <View style={s.arrows}>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Move up" onPress={() => moveHero(i, -1)} disabled={i === 0 || busy} hitSlop={6} style={(i === 0 || busy) && UI.btnDisabled}>
                              <Feather name="chevron-up" size={20} color={SHADES.carbon} />
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Move down" onPress={() => moveHero(i, 1)} disabled={i === heroList.length - 1 || busy} hitSlop={6} style={(i === heroList.length - 1 || busy) && UI.btnDisabled}>
                              <Feather name="chevron-down" size={20} color={SHADES.carbon} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={s.actions}>
                          <Text style={[UI.small, { flex: 1 }]}>Published</Text>
                          <Switch
                            value={e.published}
                            disabled={busy}
                            onValueChange={v => toggleHero(e, v)}
                            trackColor={{ false: SHADES.border, true: SHADES.amber }}
                            thumbColor={SHADES.white}
                          />
                          {e.kind === 'slide' && (
                            <TouchableOpacity onPress={() => setConfirmDelete(e.slide.id)} hitSlop={8} style={{ marginLeft: 14 }}>
                              <Text style={UI.dangerText}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {e.kind === 'slide' && confirmDelete === e.slide.id && (
                          <View style={{ marginTop: 10 }}>
                            <ConfirmBox
                              text="Delete this slide and its photo?"
                              confirmLabel="Delete"
                              destructive
                              onCancel={() => setConfirmDelete(null)}
                              onConfirm={() => { setConfirmDelete(null); run(() => deleteSlide(e.slide), "Couldn't delete the slide."); }}
                              confirmDisabled={busy}
                            />
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                );
              }
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
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Move up" onPress={() => move(list, i, -1)} disabled={i === 0 || busy} hitSlop={6} style={(i === 0 || busy) && UI.btnDisabled}>
                            <Feather name="chevron-up" size={20} color={SHADES.carbon} />
                          </TouchableOpacity>
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Move down" onPress={() => move(list, i, 1)} disabled={i === list.length - 1 || busy} hitSlop={6} style={(i === list.length - 1 || busy) && UI.btnDisabled}>
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
