import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { PACK_COPY as P } from '@/constants/packCopy';
import { UI, SectionTitle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import DateRangePicker from '@/components/DateRangePicker';
import { useRequireAccount } from '@/components/auth/GuestGate';
import { useAuth } from '@/contexts/AuthContext';
import { addToBag } from '@/lib/bag';
import { shadeOf, toPack, type CollectionDoc } from '@/lib/collections';
import { useExchangeRate } from '@/lib/exchangeRate';
import { useLoyaltyConfig, depositPercentFor } from '@/lib/loyalty';
import type { Product } from '@/lib/mockData';
import { getEffectiveRate, billableDaysFromDates, depositForLine, fmtReservationLabel } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { fetchOccupancy, effectiveStock } from '@/utils/availability';
import { freeForWindow } from '@/lib/exploreWindows';
import { productThumb } from '@/utils/productImage';
import { packDiscount } from '@/functions/src/shared/packs';

// A bookable pack (collection with isPack): hero, its items with quantity and price, the
// total and the pack price (rental only — the deposit is the plain sum of the items'
// deposits), then "Book this pack" → dates → each item's availability for those exact
// times (booking rule, freeForWindow) → every item added to the bag with the same dates
// and quantities. An item not free → clearly marked; the renter may add the rest at
// their normal price. The discount itself is decided at checkout / by createReservations.

type Win = { pickupAt: Date; returnAt: Date };
const n = (v: number) => Math.round(v).toLocaleString('en-US');
const SIDE = 16;

export default function PackScreen({ pack, products, profile }: {
  pack: CollectionDoc;
  /** The pack's products, in pack order (renter-visible). */
  products: Product[];
  profile: { customerType?: string; loyaltyTier?: string | null } | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const requireAccount = useRequireAccount();
  const exchangeRate = useExchangeRate();
  const loyaltyConfig = useLoyaltyConfig();
  const depositPct = depositPercentFor(profile?.customerType as never, profile?.loyaltyTier as never, loyaltyConfig);
  const pct = toPack(pack).discountPct;
  const shade = shadeOf(pack);
  // Hero: the content width (16px margins, like the cards below), 1.9:1, cover.
  const { width: screenW } = useWindowDimensions();
  const heroW = screenW - SIDE * 2;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [win, setWin] = useState<Win | null>(null);
  const [free, setFree] = useState<Record<string, number> | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => pack.items.flatMap(it => {
    const p = products.find(x => x.id === it.productId);
    if (!p) return [];
    const days = win ? billableDaysFromDates(win.pickupAt, win.returnAt) : 1;
    const rate = getEffectiveRate(p, days);
    const perDay = rate != null && exchangeRate != null ? toLak(rate, exchangeRate) : null;
    return [{
      product: p, qty: it.qty, perDay,
      subtotal: perDay != null ? perDay * days * it.qty : null,
      deposit: exchangeRate != null ? depositForLine(p.deposit, exchangeRate, depositPct, it.qty).deposit : null,
    }];
  }), [pack.items, products, win, exchangeRate, depositPct]);

  const priced = rows.every(r => r.subtotal != null);
  const total = rows.reduce((s, r) => s + (r.subtotal ?? 0), 0);
  // Same shared rule as the server: the whole pack on one window.
  const packTotal = useMemo(() => {
    if (!priced) return null;
    const at = win ?? { pickupAt: new Date(0), returnAt: new Date(86_400_000) };
    const r = packDiscount({ ...toPack(pack), activeFromMs: null, activeToMs: null, published: true }, rows.map(x => ({
      productId: x.product.id, pickupAtMs: at.pickupAt.getTime(), returnAtMs: at.returnAt.getTime(),
      quantity: x.qty, subtotal: x.subtotal ?? 0,
    })), Date.now());
    return r.ok ? total - r.total : total;
  }, [priced, win, pack, rows, total]);

  // Calendar: a day is free for the pack only if EVERY item has its full quantity free.
  const calendarItems = useMemo(() => rows.map(r => ({
    productId: r.product.id, qty: r.qty,
    totalStock: r.product.available === false ? 0 : effectiveStock(r.product),
  })), [rows]);

  const pickDates = () => requireAccount({ action: 'book', itemName: pack.title, run: () => setPickerOpen(true) });

  const onDates = async (pickupAt: Date, returnAt: Date) => {
    setPickerOpen(false);
    setError(null);
    const w = { pickupAt, returnAt };
    setWin(w);
    setFree(null);
    const entries = await Promise.all(rows.map(async r => {
      const occ = await fetchOccupancy(r.product.id).catch(() => undefined);
      return [r.product.id, occ === undefined ? 0 : freeForWindow(r.product, occ, w)] as const;
    }));
    setFree(Object.fromEntries(entries));
  };

  const availableRows = free ? rows.filter(r => (free[r.product.id] ?? 0) >= r.qty) : [];
  const allFree = !!free && availableRows.length === rows.length;
  const missingCount = free ? rows.length - availableRows.length : 0;
  // What will really be added: every item (pack price) — or, when one isn't free, the
  // available ones only at their normal price, with their own deposit.
  const shown = free && !allFree ? availableRows : rows;
  const shownTotal = shown.reduce((s, r) => s + (r.subtotal ?? 0), 0);
  const deposit = shown.every(r => r.deposit != null) ? shown.reduce((s, r) => s + (r.deposit ?? 0), 0) : null;
  const showPackPrice = packTotal != null && packTotal < total && (!free || allFree);

  const add = async (list: typeof rows) => {
    if (!user || !win || adding || list.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      for (const r of list) await addToBag(user.uid, r.product, win, r.qty);
      router.push('/bag');
    } catch {
      setError(P.addError);
    } finally {
      setAdding(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero, { width: heroW, height: Math.round(heroW / 1.9) }]}>
        {pack.imageUrl
          ? <Image source={{ uri: pack.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" accessible={false} />
          : <View style={[StyleSheet.absoluteFill, s.heroIcon, { backgroundColor: shade.bg }]}>
              <MaterialCommunityIcons name={pack.icon} size={44} color={shade.fg} />
            </View>}
        <View style={s.chip}><Text style={s.chipText}>{P.chip(pct)}</Text></View>
      </View>
      <Text style={s.title}>{pack.title}</Text>
      {!!pack.subtitle && <Text style={[UI.body, { marginTop: 4 }]}>{pack.subtitle}</Text>}

      <SectionTitle>{P.items}</SectionTitle>
      <View style={[UI.card, s.list]}>
        {rows.map((r, i) => {
          const thumb = productThumb(r.product);
          const f = free?.[r.product.id];
          const ok = f === undefined ? null : f >= r.qty;
          return (
            <TouchableOpacity key={r.product.id} style={[s.row, i > 0 && s.rowSep]} onPress={() => router.push(`/product/${r.product.id}`)} activeOpacity={0.7}>
              <View style={s.thumb}>
                {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Feather name="box" size={18} color={SHADES.carbonMuted} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={UI.title} numberOfLines={2}>{r.product.name}</Text>
                <Text style={UI.small}>
                  {`${P.qty(r.qty)} · ${r.perDay != null ? P.perDay(n(r.perDay)) : '—'}`}
                </Text>
                {ok != null && (
                  <Text style={[s.avail, { color: ok ? SHADES.carbonMuted : SHADES.amberText }]}>{ok ? P.free : P.notFree}</Text>
                )}
              </View>
              {ok === false && <Feather name="x-circle" size={18} color={SHADES.amberText} accessibilityLabel={P.notFree} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionTitle>{win ? P.forDates : P.total}</SectionTitle>
      <View style={[UI.card, UI.cardPadded, { gap: 8 }]}>
        {win && <Text style={UI.small}>{`${fmtReservationLabel(win.pickupAt)} → ${fmtReservationLabel(win.returnAt)}`}</Text>}
        {free && !allFree && shown.length > 0 && (
          <Text style={UI.small}>{P.addingOnly(shown.length, rows.length)}</Text>
        )}
        <View style={s.line}>
          <Text style={UI.body}>{win ? P.total : P.totalPerDay}</Text>
          <Text style={[UI.body, showPackPrice && s.struck]}>{priced ? `${n(shownTotal)} LAK` : '—'}</Text>
        </View>
        {free && !allFree && (
          <Text style={[UI.small, { color: SHADES.amberText }]}>{P.noPackPrice(missingCount)}</Text>
        )}
        {showPackPrice && (
          <View style={s.line}>
            <Text style={UI.title}>{win ? P.packPrice(pct) : P.packPricePerDay(pct)}</Text>
            <Text style={UI.title}>{`${n(packTotal!)} LAK`}</Text>
          </View>
        )}
        <View style={s.line}>
          <Text style={UI.body}>{P.deposit}</Text>
          <Text style={UI.body}>{deposit != null ? `${n(deposit)} LAK` : '—'}</Text>
        </View>
        <Text style={UI.small}>{P.depositNote}</Text>
      </View>

      {!win && <Text style={[UI.small, { marginTop: 12 }]}>{P.how}</Text>}
      {win && !free && (
        <View style={s.checking}><ActivityIndicator color={SHADES.amber} /><Text style={UI.small}>{P.checking}</Text></View>
      )}
      {free && !allFree && (
        <Text style={[UI.small, { marginTop: 12 }]}>{availableRows.length > 0 ? P.someMissing : P.noneFree}</Text>
      )}
      {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}

      <View style={{ marginTop: 16, gap: 10 }}>
        {!win || !free ? (
          <PressScale style={[UI.btnPrimary, (!priced || !!win) && UI.btnDisabled]} onPress={pickDates} disabled={!priced || !!win} activeOpacity={0.85}>
            <Text style={UI.btnPrimaryText}>{P.book}</Text>
          </PressScale>
        ) : allFree ? (
          <PressScale style={[UI.btnPrimary, adding && UI.btnDisabled]} onPress={() => add(rows)} disabled={adding} activeOpacity={0.85}>
            <Text style={UI.btnPrimaryText}>{P.addPack}</Text>
          </PressScale>
        ) : availableRows.length > 0 ? (
          <PressScale style={[UI.btnPrimary, adding && UI.btnDisabled]} onPress={() => add(availableRows)} disabled={adding} activeOpacity={0.85}>
            <Text style={UI.btnPrimaryText}>{P.addSome(availableRows.length)}</Text>
          </PressScale>
        ) : null}
        {win && (
          <PressScale style={UI.btnSecondary} onPress={pickDates} activeOpacity={0.85}>
            <Text style={UI.btnSecondaryText}>{P.changeDates}</Text>
          </PressScale>
        )}
      </View>

      <DateRangePicker
        visible={pickerOpen}
        productId=""
        packItems={calendarItems}
        totalStock={0}
        initialPickupAt={win?.pickupAt ?? null}
        initialReturnAt={win?.returnAt ?? null}
        onClose={() => setPickerOpen(false)}
        onConfirm={onDates}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  hero: { alignSelf: 'center', borderRadius: 20, overflow: 'hidden', backgroundColor: SHADES.carbonLight, marginBottom: 14 },
  heroIcon: { alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', top: 12, left: 12, backgroundColor: SHADES.amber, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '700', color: SHADES.carbon },
  title: { fontSize: 24, fontWeight: '700', color: SHADES.carbon, letterSpacing: -0.4 },
  list: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowSep: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  thumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center' },
  avail: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  struck: { textDecorationLine: 'line-through' },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
});
