import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { PROMO_COPY } from '@/constants/promoCopy';
import BackButton from '@/components/BackButton';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import { ConfirmBox } from '@/components/ConfirmBox';
import PressScale from '@/components/PressScale';
import { UI, SectionTitle, ToggleRow, StatusChip, useScreenInsets } from '@/components/account/ui';
import { getProducts } from '@/lib/firestore';
import { CATEGORIES, type Product } from '@/lib/mockData';
import {
  createPromoCode, deletePromoCode, getPromoCode, setPromoActive, updatePromoCode, type PromoDoc,
} from '@/lib/promoCodes';
import { PROMO_CODE_RE, normalizePromoCode, promoStatus, type PromoType } from '@/functions/src/shared/promo';

// Admin → Promo codes → new / edit (?code=). The code is the document id (unique) and
// can't change after creation; usage counters are server-only. Deactivate any time;
// delete only while unused (firestore.rules).

const c = PROMO_COPY.admin;
const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIsoDay = (s: string | null | undefined) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const intOrNull = (t: string) => { const n = parseInt(t.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
const CATS = CATEGORIES.filter(x => x.id !== 'all');

export default function PromoCodeFormScreen() {
  const { code: editCode } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const screen = useScreenInsets();

  const [existing, setExisting] = useState<PromoDoc | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PromoType>('percent');
  const [value, setValue] = useState('');
  const [minRental, setMinRental] = useState('');
  const [validFrom, setValidFrom] = useState<Date | null>(null);
  const [validTo, setValidTo] = useState<Date | null>(null);
  const [maxUses, setMaxUses] = useState('');
  const [perRenter, setPerRenter] = useState('1');
  const [firstRentalOnly, setFirstRentalOnly] = useState(false);
  const [businessAllowed, setBusinessAllowed] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null);

  useEffect(() => {
    Promise.all([
      getProducts().catch(() => [] as Product[]),
      editCode ? getPromoCode(editCode).catch(() => null) : Promise.resolve(null),
    ]).then(([prods, p]) => {
      setProducts([...prods].sort((a, b) => a.name.localeCompare(b.name)));
      if (p) {
        setExisting(p);
        setCode(p.code); setDescription(p.description ?? ''); setType(p.type); setValue(String(p.value));
        setMinRental(p.minRentalLak ? String(p.minRentalLak) : '');
        setValidFrom(fromIsoDay(p.validFrom)); setValidTo(fromIsoDay(p.validTo));
        setMaxUses(p.maxUses ? String(p.maxUses) : ''); setPerRenter(String(p.maxUsesPerRenter ?? 1));
        setFirstRentalOnly(!!p.firstRentalOnly); setBusinessAllowed(!!p.businessAllowed);
        setCategoryIds(p.scope?.categoryIds ?? []); setProductIds(p.scope?.productIds ?? []);
      }
    }).finally(() => setLoading(false));
  }, [editCode]);

  const selected = useMemo(() => new Set(productIds), [productIds]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const normalized = normalizePromoCode(code);
  const valueNum = intOrNull(value);
  const codeOk = PROMO_CODE_RE.test(normalized);
  const valueOk = valueNum != null && (type === 'fixed' || valueNum <= 100);
  const datesOk = !validFrom || !validTo || validFrom.getTime() <= validTo.getTime();
  const canSave = codeOk && valueOk && datesOk && !saving;
  const used = (existing?.usedCount ?? 0) > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const input = {
      description: description.trim(),
      type, value: valueNum!,
      minRentalLak: intOrNull(minRental),
      validFrom: validFrom ? toIsoDay(validFrom) : null,
      validTo: validTo ? toIsoDay(validTo) : null,
      maxUses: intOrNull(maxUses),
      maxUsesPerRenter: intOrNull(perRenter) ?? 1,
      firstRentalOnly, businessAllowed,
      scope: { categoryIds, productIds },
    };
    try {
      if (existing) await updatePromoCode(existing.code, input);
      else await createPromoCode({ ...input, code: normalized, active: true });
      router.replace('/admin/promo-codes' as never);
    } catch (e) {
      setError((e as Error)?.message === 'exists' ? c.errors.exists : c.errors.save);
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await setPromoActive(existing.code, !existing.active);
      setExisting({ ...existing, active: !existing.active });
    } catch { setError(c.errors.save); }
    setSaving(false);
    setConfirm(null);
  };

  const remove = async () => {
    if (!existing || used) return;
    setSaving(true);
    try {
      await deletePromoCode(existing.code);
      router.replace('/admin/promo-codes' as never);
    } catch { setError(c.errors.save); setSaving(false); setConfirm(null); }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{existing ? c.edit : c.new}</Text>
        {existing && <View style={{ marginLeft: 'auto' }}><StatusChip label={c.status[promoStatus(existing, Date.now())]} tone="grey" /></View>}
      </View>

      {loading ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          <SectionTitle>{c.fields.code}</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <TextInput
              style={[UI.input, s.codeInput, !!existing && s.readOnly]}
              value={existing ? existing.code : code}
              onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
              editable={!existing}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="SUMMER10"
              placeholderTextColor={SHADES.carbonFaint}
            />
            <Text style={[UI.small, { marginTop: 6 }]}>{c.fields.codeHint}</Text>
            {!existing && code.length > 0 && !codeOk && <Text style={UI.errorText}>{c.errors.code}</Text>}
            <Text style={[UI.fieldLabel, { marginTop: 16 }]}>{c.fields.description}</Text>
            <TextInput style={UI.input} value={description} onChangeText={setDescription} placeholder="Partner café, Nov 2026" placeholderTextColor={SHADES.carbonFaint} maxLength={120} />
          </View>

          <SectionTitle>{c.fields.value}</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <View style={s.chips}>
              {(['percent', 'fixed'] as PromoType[]).map(t => (
                <TouchableOpacity key={t} style={[s.chip, type === t && s.chipOn]} onPress={() => setType(t)} activeOpacity={0.8}>
                  <Text style={[s.chipText, type === t && s.chipTextOn]}>{c.type[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.valueRow}>
              <TextInput style={[UI.input, { flex: 1 }]} value={value} onChangeText={t => setValue(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={type === 'percent' ? '10' : '50000'} placeholderTextColor={SHADES.carbonFaint} />
              <Text style={s.unit}>{type === 'percent' ? '%' : 'LAK'}</Text>
            </View>
            {value.length > 0 && !valueOk && <Text style={UI.errorText}>{c.errors.value}</Text>}
            <Text style={[UI.fieldLabel, { marginTop: 16 }]}>{c.fields.minRental}</Text>
            <TextInput style={UI.input} value={minRental} onChangeText={t => setMinRental(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="—" placeholderTextColor={SHADES.carbonFaint} />
          </View>

          <SectionTitle>{c.fields.dates}</SectionTitle>
          <View style={[UI.card, UI.cardPadded, { gap: 12 }]}>
            {(['from', 'to'] as const).map(which => {
              const v = which === 'from' ? validFrom : validTo;
              return (
                <View key={which} style={s.dateRow}>
                  <Text style={[UI.title, { width: 60 }]}>{which === 'from' ? c.fields.from : c.fields.to}</Text>
                  <TouchableOpacity style={[UI.input, s.dateBtn]} onPress={() => setPicker(which)} activeOpacity={0.75}>
                    <Text style={v ? UI.title : UI.body}>{v ? fmtDay(v) : c.fields.always}</Text>
                  </TouchableOpacity>
                  {v && (
                    <TouchableOpacity onPress={() => (which === 'from' ? setValidFrom(null) : setValidTo(null))} hitSlop={8}>
                      <Feather name="x" size={18} color={SHADES.carbonMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {!datesOk && <Text style={UI.errorText}>{c.errors.dates}</Text>}
          </View>

          <SectionTitle>Limits</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <Text style={UI.fieldLabel}>{c.fields.maxUses}</Text>
            <TextInput style={UI.input} value={maxUses} onChangeText={t => setMaxUses(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="—" placeholderTextColor={SHADES.carbonFaint} />
            <Text style={[UI.fieldLabel, { marginTop: 16 }]}>{c.fields.perRenter}</Text>
            <TextInput style={UI.input} value={perRenter} onChangeText={t => setPerRenter(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={[UI.card, { marginTop: 10 }]}>
            <ToggleRow title={c.fields.firstRental} sub={c.fields.firstRentalSub} value={firstRentalOnly} onValueChange={setFirstRentalOnly} />
            <View style={s.sep} />
            <ToggleRow title={c.fields.business} sub={c.fields.businessSub} value={businessAllowed} onValueChange={setBusinessAllowed} />
          </View>

          <SectionTitle>{c.fields.scope}</SectionTitle>
          <View style={[UI.card, UI.cardPadded]}>
            <Text style={UI.small}>{c.fields.scopeSub}</Text>
            <Text style={[UI.fieldLabel, { marginTop: 12 }]}>{c.fields.categories}</Text>
            <View style={s.chips}>
              {CATS.map(cat => {
                const on = categoryIds.includes(cat.id);
                return (
                  <TouchableOpacity key={cat.id} style={[s.chip, on && s.chipOn]} onPress={() => toggle(categoryIds, setCategoryIds, cat.id)} activeOpacity={0.8}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[UI.fieldLabel, { marginTop: 16 }]}>{`${c.fields.products} · ${productIds.length}`}</Text>
            <TextInput style={UI.input} value={search} onChangeText={setSearch} placeholder={c.fields.search} placeholderTextColor={SHADES.carbonFaint} autoCorrect={false} />
            <View style={{ marginTop: 6 }}>
              {filtered.slice(0, 60).map(p => {
                const on = selected.has(p.id);
                return (
                  <TouchableOpacity key={p.id} style={s.productRow} onPress={() => toggle(productIds, setProductIds, p.id)} activeOpacity={0.7}>
                    <View style={[s.check, on && s.checkOn]}>{on && <Feather name="check" size={14} color={SHADES.carbon} />}</View>
                    <Text style={[UI.title, { flex: 1, fontWeight: on ? '700' : '500' }]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {!!error && <Text style={[UI.errorText, { marginTop: 14 }]}>{error}</Text>}

          <PressScale style={[UI.btnPrimary, { marginTop: 20 }, !canSave && UI.btnDisabled]} onPress={save} disabled={!canSave}>
            {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.save}</Text>}
          </PressScale>

          {existing && (
            <View style={{ marginTop: 12, gap: 10 }}>
              {confirm === 'deactivate' ? (
                <ConfirmBox text={c.deactivateAsk} confirmLabel={c.deactivate} onCancel={() => setConfirm(null)} onConfirm={toggleActive} confirmDisabled={saving} />
              ) : (
                <PressScale style={UI.btnSecondary} onPress={() => (existing.active ? setConfirm('deactivate') : toggleActive())} disabled={saving}>
                  <Text style={UI.btnSecondaryText}>{existing.active ? c.deactivate : c.reactivate}</Text>
                </PressScale>
              )}
              {used ? (
                <Text style={[UI.small, { textAlign: 'center' }]}>{c.usedNoDelete}</Text>
              ) : confirm === 'delete' ? (
                <ConfirmBox text={c.deleteAsk} confirmLabel="Delete" destructive onCancel={() => setConfirm(null)} onConfirm={remove} confirmDisabled={saving} />
              ) : (
                <TouchableOpacity style={UI.btnDestructive} onPress={() => setConfirm('delete')} activeOpacity={0.8}>
                  <Text style={UI.dangerText}>{c.delete}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <AdminDateTimePicker
        visible={picker !== null}
        dateOnly
        title={picker === 'from' ? c.fields.from : c.fields.to}
        initialValue={picker === 'from' ? validFrom : validTo}
        onClose={() => setPicker(null)}
        onConfirm={d => { if (picker === 'from') setValidFrom(d); else setValidTo(d); setPicker(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  codeInput: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  readOnly: { backgroundColor: SHADES.carbonLight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 10, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white, justifyContent: 'center' },
  chipOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  chipText: { fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  chipTextOn: { color: SHADES.cream },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  unit: { fontSize: 15, fontWeight: '700', color: SHADES.carbonMuted, width: 36 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { flex: 1, justifyContent: 'center' },
  sep: { height: 0.5, backgroundColor: SHADES.border, marginLeft: 14 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbonFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: SHADES.amber, borderColor: SHADES.amber },
});
