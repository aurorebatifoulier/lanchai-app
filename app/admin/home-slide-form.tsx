import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import { UI, SectionTitle, ToggleRow, useScreenInsets } from '@/components/account/ui';
import { CATEGORIES, type Product } from '@/lib/mockData';
import { getProducts } from '@/lib/firestore';
import { getAllCollections, type CollectionDoc } from '@/lib/collections';
import {
  getSlide, getAllSlides, newSlideId, createSlideWithId, updateSlide, uploadSlidePhoto, deleteSlidePhoto,
  SLIDE_LIMITS, type SlideLink, type SlidePlacement,
} from '@/lib/homeSlides';
import PressScale from '@/components/PressScale';

type LinkKind = SlideLink['kind'];
const LINK_KINDS: { key: LinkKind; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'category', label: 'Category' },
  { key: 'collection', label: 'Collection' },
  { key: 'product', label: 'Product' },
  { key: 'explore', label: 'Explore' },
];
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Admin → Home slides → new / edit (?id=). Photo from the gallery with a landscape crop
// (9:4, about 1080 × 480), compressed like product photos and uploaded on Save.
export default function HomeSlideFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const screen = useScreenInsets();

  const [placement, setPlacement] = useState<SlidePlacement>('hero');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [linkKind, setLinkKind] = useState<LinkKind>('none');
  const [linkId, setLinkId] = useState('');
  const [exploreQ, setExploreQ] = useState('');
  const [exploreMax, setExploreMax] = useState('');
  const [activeFrom, setActiveFrom] = useState<Date | null>(null);
  const [activeTo, setActiveTo] = useState<Date | null>(null);
  const [published, setPublished] = useState(false);
  const [order, setOrder] = useState(0);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<CollectionDoc[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    Promise.all([
      getProducts().catch(() => [] as Product[]),
      getAllCollections().catch(() => [] as CollectionDoc[]),
      id ? getSlide(id).catch(() => null) : Promise.resolve(null),
      id ? Promise.resolve([]) : getAllSlides().catch(() => []),
    ]).then(([prods, cols, slide, all]) => {
      setProducts([...prods].sort((a, b) => a.name.localeCompare(b.name)));
      setCollections(cols);
      if (slide) {
        setPlacement(slide.placement); setTitle(slide.title); setSubtitle(slide.subtitle); setCtaLabel(slide.ctaLabel);
        setLinkKind(slide.link.kind);
        if (slide.link.kind === 'category' || slide.link.kind === 'collection' || slide.link.kind === 'product') setLinkId(slide.link.id);
        if (slide.link.kind === 'explore') { setExploreQ(slide.link.q ?? ''); setExploreMax(slide.link.maxPrice ? String(slide.link.maxPrice) : ''); }
        setActiveFrom(slide.activeFrom?.toDate() ?? null); setActiveTo(slide.activeTo?.toDate() ?? null);
        setPublished(slide.published); setOrder(slide.order);
        setImagePath(slide.imagePath); setImageUrl(slide.imageUrl);
      } else {
        setOrder(all.length); // new slides go last
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { setError('Allow photo access to add a picture.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 4],
      quality: 1,
    });
    if (!res.canceled && res.assets[0]) { setLocalUri(res.assets[0].uri); setError(null); }
  };

  const link: SlideLink | null = useMemo(() => {
    switch (linkKind) {
      case 'none': return { kind: 'none' };
      case 'category': case 'collection': case 'product': return linkId ? { kind: linkKind, id: linkId } : null;
      case 'explore': {
        const max = Number(exploreMax.replace(/[\s,]/g, ''));
        return {
          kind: 'explore',
          ...(exploreQ.trim() ? { q: exploreQ.trim() } : {}),
          ...(exploreMax.trim() && Number.isFinite(max) && max > 0 ? { maxPrice: Math.round(max) } : {}),
        };
      }
    }
  }, [linkKind, linkId, exploreQ, exploreMax]);

  const datesOk = !activeFrom || !activeTo || activeFrom.getTime() <= activeTo.getTime();
  const canSave = !saving && !!link && datesOk
    && title.trim().length <= SLIDE_LIMITS.title && subtitle.trim().length <= SLIDE_LIMITS.subtitle
    && ctaLabel.trim().length <= SLIDE_LIMITS.cta;

  const save = async () => {
    if (!canSave || !link) return;
    setSaving(true);
    setError(null);
    try {
      const slideId = id ?? newSlideId();
      let photo = { imagePath, imageUrl };
      if (localUri) {
        photo = await uploadSlidePhoto(slideId, localUri);
        if (imagePath) await deleteSlidePhoto(imagePath); // the replaced photo
      }
      const data = {
        placement, title: title.trim(), subtitle: subtitle.trim(), ctaLabel: ctaLabel.trim(), link,
        activeFrom: activeFrom ? Timestamp.fromDate(activeFrom) : null,
        activeTo: activeTo ? Timestamp.fromDate(activeTo) : null,
        order, published, ...photo,
      };
      if (id) await updateSlide(id, data);
      else await createSlideWithId(slideId, data);
      router.replace('/admin/home-slides' as never);
    } catch {
      setError("Couldn't save the slide. Please try again.");
      setSaving(false);
    }
  };

  const shownPhoto = localUri ?? imageUrl;
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? products.filter(p => p.name.toLowerCase().includes(q)) : products).slice(0, 30);
  }, [products, search]);

  const choice = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <TouchableOpacity key={key ?? label} style={[UI.choice, on && UI.choiceOn]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[UI.choiceText, on && UI.choiceTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{id ? 'Edit slide' : 'New slide'}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          <SectionTitle>Placement</SectionTitle>
          <View style={s.chips}>
            {choice(placement === 'hero', 'Hero carousel', () => setPlacement('hero'))}
            {choice(placement === 'banner', 'Banner', () => setPlacement('banner'))}
          </View>

          <SectionTitle>Photo</SectionTitle>
          <TouchableOpacity style={s.photo} onPress={pickPhoto} activeOpacity={0.8}>
            {shownPhoto
              ? <Image source={{ uri: shownPhoto }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Feather name="image" size={24} color={SHADES.carbonMuted} />
                  <Text style={UI.small}>Choose a photo</Text>
                </View>
              )}
          </TouchableOpacity>
          <Text style={[UI.small, { marginTop: 6 }]}>Landscape, about 1080 × 480 — the picker crops to this shape.</Text>

          <SectionTitle>Text (optional)</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <Text style={UI.fieldLabel}>Title</Text>
            <TextInput style={UI.input} value={title} onChangeText={setTitle} maxLength={SLIDE_LIMITS.title} placeholder="Why buy it when you can rent it?" placeholderTextColor={SHADES.carbonFaint} />
            <Text style={[UI.fieldLabel, { marginTop: 14 }]}>Subtitle</Text>
            <TextInput style={UI.input} value={subtitle} onChangeText={setSubtitle} maxLength={SLIDE_LIMITS.subtitle} placeholder="Everything you need. Only when you need it." placeholderTextColor={SHADES.carbonFaint} />
            <Text style={[UI.fieldLabel, { marginTop: 14 }]}>Button label</Text>
            <TextInput style={UI.input} value={ctaLabel} onChangeText={setCtaLabel} maxLength={SLIDE_LIMITS.cta} placeholder="Explore now" placeholderTextColor={SHADES.carbonFaint} />
            <Text style={[UI.small, { marginTop: 6 }]}>The button shows only with a label and a link.</Text>
          </View>

          <SectionTitle>Link</SectionTitle>
          <View style={s.chips}>
            {LINK_KINDS.map(k => choice(linkKind === k.key, k.label, () => { setLinkKind(k.key); setLinkId(''); }, k.key))}
          </View>
          {linkKind === 'category' && (
            <View style={[s.chips, { marginTop: 10 }]}>
              {CATEGORIES.filter(c => c.id !== 'all').map(c => choice(linkId === c.id, c.name, () => setLinkId(c.id), c.id))}
            </View>
          )}
          {linkKind === 'collection' && (
            <View style={[UI.card, s.list]}>
              {collections.length === 0 && <Text style={UI.body}>No collection yet.</Text>}
              {collections.map(c => (
                <TouchableOpacity key={c.id} style={s.listRow} onPress={() => setLinkId(c.id)}>
                  <Feather name={linkId === c.id ? 'check-circle' : 'circle'} size={18} color={linkId === c.id ? SHADES.amber : SHADES.carbonFaint} />
                  <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>{c.title}{c.published ? '' : ' (draft)'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {linkKind === 'product' && (
            <View style={[UI.card, s.list]}>
              <TextInput style={UI.input} value={search} onChangeText={setSearch} placeholder="Search products" placeholderTextColor={SHADES.carbonFaint} />
              {filteredProducts.map(p => (
                <TouchableOpacity key={p.id} style={s.listRow} onPress={() => setLinkId(p.id)}>
                  <Feather name={linkId === p.id ? 'check-circle' : 'circle'} size={18} color={linkId === p.id ? SHADES.amber : SHADES.carbonFaint} />
                  <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {linkKind === 'explore' && (
            <View style={[UI.card, UI.cardPadded, { marginTop: 10 }]}>
              <Text style={UI.fieldLabel}>Search text (optional)</Text>
              <TextInput style={UI.input} value={exploreQ} onChangeText={setExploreQ} placeholder="tent" placeholderTextColor={SHADES.carbonFaint} />
              <Text style={[UI.fieldLabel, { marginTop: 14 }]}>Max price, LAK per day (optional)</Text>
              <TextInput style={UI.input} value={exploreMax} onChangeText={setExploreMax} keyboardType="number-pad" placeholder="100000" placeholderTextColor={SHADES.carbonFaint} />
            </View>
          )}
          {!link && <Text style={[UI.errorText, { marginTop: 8 }]}>Choose where the slide leads.</Text>}

          <SectionTitle>Dates (optional)</SectionTitle>
          <View style={[UI.card, UI.cardPadded, { gap: 12 }]}>
            {(['from', 'to'] as const).map(which => {
              const value = which === 'from' ? activeFrom : activeTo;
              return (
                <View key={which} style={s.dateRow}>
                  <Text style={[UI.title, { width: 90 }]}>{which === 'from' ? 'Active from' : 'Active until'}</Text>
                  <TouchableOpacity style={[UI.input, s.dateBtn]} onPress={() => setPicker(which)} activeOpacity={0.75}>
                    <Text style={value ? UI.title : UI.body}>{value ? fmtDay(value) : 'Always'}</Text>
                  </TouchableOpacity>
                  {value && (
                    <TouchableOpacity onPress={() => (which === 'from' ? setActiveFrom(null) : setActiveTo(null))} hitSlop={8}>
                      <Feather name="x" size={18} color={SHADES.carbonMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {!datesOk && <Text style={UI.errorText}>The end date must be on or after the start date.</Text>}
          </View>

          <SectionTitle>Visibility</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <ToggleRow title="Published" sub="Shown on the Home in its dates." value={published} onValueChange={setPublished} />
          </View>

          {error && <Text style={[UI.errorText, { marginTop: 14 }]}>{error}</Text>}
          <PressScale style={[UI.btnPrimary, { marginTop: 20 }, !canSave && UI.btnDisabled]} onPress={save} disabled={!canSave} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Save slide</Text>}
          </PressScale>
        </ScrollView>
      )}

      <AdminDateTimePicker
        visible={picker !== null}
        dateOnly
        title={picker === 'from' ? 'Active from' : 'Active until'}
        initialValue={picker === 'from' ? activeFrom : activeTo}
        onClose={() => setPicker(null)}
        onConfirm={d => { if (picker === 'from') setActiveFrom(d); else setActiveTo(d); setPicker(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: {
    aspectRatio: 9 / 4, borderRadius: 18, overflow: 'hidden', backgroundColor: SHADES.carbonLight,
    borderWidth: 0.5, borderColor: SHADES.border, alignItems: 'center', justifyContent: 'center',
  },
  list: { marginTop: 10, padding: 12, gap: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { flex: 1, justifyContent: 'center' },
});
