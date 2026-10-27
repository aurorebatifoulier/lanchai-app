import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle, ToggleRow, useScreenInsets } from '@/components/account/ui';
import { getProducts } from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import {
  getCollection, getAllCollections, createCollection, updateCollection, deleteCollection,
  COLLECTION_ICONS, COLLECTION_SHADES, COLLECTION_LIMITS,
  type CollectionIcon, type CollectionShade,
} from '@/lib/collections';

const SHADE_KEYS = Object.keys(COLLECTION_SHADES) as CollectionShade[];
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Admin → Collections → new / edit (?id=). Same flat-route pattern as product-form.tsx.
export default function CollectionFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const screen = useScreenInsets();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [icon, setIcon] = useState<CollectionIcon>(COLLECTION_ICONS[0]);
  const [shade, setShade] = useState<CollectionShade>('amberLight');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [activeFrom, setActiveFrom] = useState<Date | null>(null);
  const [activeTo, setActiveTo] = useState<Date | null>(null);
  const [published, setPublished] = useState(false);
  const [order, setOrder] = useState(0);

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    Promise.all([
      getProducts().catch(() => [] as Product[]),
      id ? getCollection(id) : Promise.resolve(null),
      id ? Promise.resolve([]) : getAllCollections().catch(() => []),
    ]).then(([prods, col, all]) => {
      setProducts([...prods].sort((a, b) => a.name.localeCompare(b.name)));
      if (col) {
        setTitle(col.title); setSubtitle(col.subtitle); setIcon(col.icon); setShade(col.shade);
        setProductIds(col.productIds); setPublished(col.published); setOrder(col.order);
        setActiveFrom(col.activeFrom?.toDate() ?? null); setActiveTo(col.activeTo?.toDate() ?? null);
      } else {
        setOrder(all.length); // new collections go last
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const selected = useMemo(() => new Set(productIds), [productIds]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);
  const toggleProduct = (pid: string) =>
    setProductIds(prev => (prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]));

  const titleOk = title.trim().length > 0 && title.trim().length <= COLLECTION_LIMITS.title;
  const subtitleOk = subtitle.trim().length <= COLLECTION_LIMITS.subtitle;
  const datesOk = !activeFrom || !activeTo || activeFrom.getTime() <= activeTo.getTime();
  const canSave = titleOk && subtitleOk && datesOk && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const data = {
      title: title.trim(), subtitle: subtitle.trim(), icon, shade, productIds, order, published,
      activeFrom: activeFrom ? Timestamp.fromDate(activeFrom) : null,
      activeTo: activeTo ? Timestamp.fromDate(activeTo) : null,
    };
    try {
      if (id) await updateCollection(id, data);
      else await createCollection(data);
      router.replace('/admin/collections' as never);
    } catch {
      setError("Couldn't save the collection. Please try again.");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await deleteCollection(id);
      router.replace('/admin/collections' as never);
    } catch {
      setError("Couldn't delete the collection.");
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const shadeColors = COLLECTION_SHADES[shade];

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{id ? 'Edit collection' : 'New collection'}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Preview */}
          <View style={[UI.card, s.preview]}>
            <View style={[s.circle, { backgroundColor: shadeColors.bg }]}>
              <MaterialCommunityIcons name={icon} size={22} color={shadeColors.fg} />
            </View>
            <Text style={s.previewTitle} numberOfLines={2}>{title.trim() || 'Title'}</Text>
            <Text style={UI.subtitle} numberOfLines={3}>{subtitle.trim() || 'One witty line.'}</Text>
          </View>

          <SectionTitle>Text</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <Text style={UI.fieldLabel}>Title</Text>
            <TextInput style={UI.input} value={title} onChangeText={setTitle} placeholder="Weekend by the river" placeholderTextColor={SHADES.carbonFaint} maxLength={COLLECTION_LIMITS.title} />
            <Text style={[UI.fieldLabel, { marginTop: 16 }]}>One-line subtitle</Text>
            <TextInput style={UI.input} value={subtitle} onChangeText={setSubtitle} placeholder="Tent, cooler, speaker." placeholderTextColor={SHADES.carbonFaint} maxLength={COLLECTION_LIMITS.subtitle} />
            <Text style={[UI.small, { marginTop: 6 }]}>{subtitle.length}/{COLLECTION_LIMITS.subtitle}</Text>
          </View>

          <SectionTitle>Icon and colour</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <View style={s.iconGrid}>
              {COLLECTION_ICONS.map(name => (
                <TouchableOpacity key={name} onPress={() => setIcon(name)} style={[s.iconCell, icon === name && s.iconCellOn]} activeOpacity={0.75}>
                  <MaterialCommunityIcons name={name} size={22} color={SHADES.carbon} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.shadeRow}>
              {SHADE_KEYS.map(k => (
                <TouchableOpacity key={k} onPress={() => setShade(k)} activeOpacity={0.75} style={[s.swatchRing, shade === k && s.swatchRingOn]}>
                  <View style={[s.swatch, { backgroundColor: COLLECTION_SHADES[k].bg }]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <SectionTitle>Products · {productIds.length} selected</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <TextInput style={UI.input} value={search} onChangeText={setSearch} placeholder="Search products" placeholderTextColor={SHADES.carbonFaint} autoCorrect={false} />
            <View style={{ marginTop: 8 }}>
              {filtered.map(p => {
                const on = selected.has(p.id);
                return (
                  <TouchableOpacity key={p.id} style={s.productRow} onPress={() => toggleProduct(p.id)} activeOpacity={0.7}>
                    <View style={[s.check, on && s.checkOn]}>
                      {on && <Feather name="check" size={14} color={SHADES.carbon} />}
                    </View>
                    <Text style={[UI.title, { flex: 1, fontWeight: on ? '700' : '500' }]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
              {filtered.length === 0 && <Text style={[UI.body, { marginTop: 8 }]}>No product matches.</Text>}
            </View>
          </View>

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
            <ToggleRow
              title="Published"
              sub="Shown on Home when in its dates and with at least one visible product."
              value={published}
              onValueChange={setPublished}
            />
          </View>

          {error && <Text style={[UI.errorText, { marginTop: 14 }]}>{error}</Text>}

          <TouchableOpacity style={[UI.btnPrimary, { marginTop: 20 }, !canSave && UI.btnDisabled]} onPress={save} disabled={!canSave} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Save collection</Text>}
          </TouchableOpacity>

          {id && (
            confirmDelete ? (
              <View style={{ marginTop: 12 }}>
                <ConfirmBox
                  text="Delete this collection? Products are not affected."
                  confirmLabel="Delete"
                  destructive
                  onCancel={() => setConfirmDelete(false)}
                  onConfirm={remove}
                  confirmDisabled={saving}
                />
              </View>
            ) : (
              <TouchableOpacity style={[UI.btnDestructive, { marginTop: 12 }]} onPress={() => setConfirmDelete(true)} activeOpacity={0.8}>
                <Text style={UI.dangerText}>Delete collection</Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      )}

      <AdminDateTimePicker
        visible={picker !== null}
        dateOnly
        title={picker === 'from' ? 'Active from' : 'Active until'}
        initialValue={picker === 'from' ? activeFrom : activeTo}
        onClose={() => setPicker(null)}
        onConfirm={d => {
          if (picker === 'from') setActiveFrom(d); else setActiveTo(d);
          setPicker(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  preview: { width: 180, padding: 16, marginTop: 16 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, lineHeight: 20 },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: SHADES.carbonLight },
  iconCellOn: { backgroundColor: SHADES.amber },
  shadeRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  swatchRing: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchRingOn: { borderColor: SHADES.carbon },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 0.5, borderColor: SHADES.border },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbonFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: SHADES.amber, borderColor: SHADES.amber },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { flex: 1, justifyContent: 'center' },
});
