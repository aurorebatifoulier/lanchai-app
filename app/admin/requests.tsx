import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, useScreenInsets } from '@/components/account/ui';
import { CATEGORIES } from '@/lib/mockData';
import { vteWhen } from '@/lib/vteTime';
import {
  useItemRequests, setItemRequestStatus, ITEM_REQUEST_STATUSES,
  type ItemRequest, type ItemRequestStatus,
} from '@/lib/itemRequests';

// Admin → Item requests: every "Ask for an item" request, newest first, with its status
// (new / ordered / declined / added). Each change (except back to new) sends the renter
// ONE in-app message per status (onItemRequestUpdated) — "added" also an email, with the
// product chosen here.

type Filter = 'all' | ItemRequestStatus;
const FILTERS: Filter[] = ['all', ...ITEM_REQUEST_STATUSES];
const LABEL: Record<Filter, string> = { all: 'All', new: 'New', ordered: 'Ordered', declined: 'Declined', added: 'Added' };
const categoryName = (id: string | null) => (id ? CATEGORIES.find(c => c.id === id)?.name ?? id : null);

export default function ItemRequestsScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { items, error } = useItemRequests();
  const [filter, setFilter] = useState<Filter>('new');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, new: 0, ordered: 0, declined: 0, added: 0 };
    for (const r of items ?? []) { c.all++; c[r.status]++; }
    return c;
  }, [items]);
  const shown = (items ?? []).filter(r => filter === 'all' || r.status === filter);

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={{ flexShrink: 0 }}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Item requests</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} style={[UI.choice, filter === f && UI.choiceOn]} onPress={() => setFilter(f)} activeOpacity={0.8}>
              <Text style={[UI.choiceText, filter === f && UI.choiceTextOn]}>{LABEL[f]} · {counts[f]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[UI.screenContent, { paddingTop: 4, paddingBottom: screen.contentBottom, gap: 10 }]} keyboardShouldPersistTaps="handled">
        {error && <Text style={UI.errorText}>Couldn’t load the requests. Please try again later.</Text>}
        {items == null && !error && <ActivityIndicator color={SHADES.amber} style={{ marginTop: 24 }} />}
        {items != null && shown.length === 0 && (
          <Text style={[UI.body, { textAlign: 'center', marginTop: 24 }]}>No requests here.</Text>
        )}
        {shown.map(r => <RequestCard key={r.id} r={r} />)}
      </ScrollView>
    </View>
  );
}

function RequestCard({ r }: { r: ItemRequest }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | 'decline' | 'add'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const change = async (status: ItemRequestStatus, product?: { id: string; name: string }) => {
    setBusy(true); setErr(false);
    try { await setItemRequestStatus(r.id, status, product); setMode(null); } catch { setErr(true); }
    setBusy(false);
  };
  const cat = categoryName(r.category);
  const when = r.createdAt ? vteWhen(r.createdAt.toMillis()) : '';

  return (
    <View style={[UI.card, UI.cardPadded, { gap: 8 }]}>
      <View style={s.topRow}>
        <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>
          {r.renterName || 'Unknown renter'}
        </Text>
        <View style={[s.status, r.status === 'new' && s.statusNew]}>
          <Text style={s.statusText}>{LABEL[r.status]}</Text>
        </View>
      </View>
      <Text style={UI.body}>{r.text}</Text>
      <Text style={UI.subtitle}>
        {[cat, when, r.contact].filter(Boolean).join(' · ')}
      </Text>
      {r.status === 'added' && r.productName && (
        <Text style={UI.link} onPress={() => r.productId && router.push(`/product/${r.productId}` as never)}>Added: {r.productName} ›</Text>
      )}
      {r.renterId && (
        <Text style={UI.link} onPress={() => router.push(`/admin-chat/${r.renterId}` as never)}>Message the renter ›</Text>
      )}

      {mode === 'decline' ? (
        <ConfirmBox
          text="Decline this request? The renter gets a short “thanks for the idea” message."
          confirmLabel="Decline"
          destructive
          onCancel={() => setMode(null)}
          onConfirm={() => change('declined')}
          confirmDisabled={busy}
        />
      ) : mode === 'add' ? (
        <ProductPicker onCancel={() => setMode(null)} onPick={p => change('added', p)} busy={busy} initial={r.text} />
      ) : (
        <View style={s.actions}>
          {r.status !== 'ordered' && r.status !== 'added' && (
            <PressScale style={[UI.btnSecondary, UI.btnCard, s.action]} disabled={busy} onPress={() => change('ordered')}>
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Ordered</Text>
            </PressScale>
          )}
          {r.status !== 'added' && (
            <PressScale style={[UI.btnPrimary, UI.btnCard, s.action]} disabled={busy} onPress={() => setMode('add')}>
              <Text style={[UI.btnPrimaryText, UI.btnCardText]}>Added…</Text>
            </PressScale>
          )}
          {r.status !== 'declined' && r.status !== 'added' && (
            <PressScale style={[UI.btnSecondary, UI.btnCard, s.action]} disabled={busy} onPress={() => setMode('decline')}>
              <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Decline</Text>
            </PressScale>
          )}
        </View>
      )}
      {err && <Text style={UI.errorText}>Couldn’t update. Please try again.</Text>}
    </View>
  );
}

/** Pick the catalogue product that answers the request (any status — admin read). */
function ProductPicker({ onPick, onCancel, busy, initial }: {
  onPick: (p: { id: string; name: string }) => void; onCancel: () => void; busy: boolean; initial: string;
}) {
  const [all, setAll] = useState<{ id: string; name: string }[] | null>(null);
  const [q, setQ] = useState(initial.split(/\s+/).slice(0, 2).join(' '));
  useEffect(() => {
    getDocs(collection(db, 'products'))
      .then(snap => setAll(snap.docs.map(d => ({ id: d.id, name: String(d.get('name') ?? d.id) })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setAll([]));
  }, []);
  const needle = q.trim().toLowerCase();
  const matches = (all ?? []).filter(p => !needle || p.name.toLowerCase().includes(needle)).slice(0, 8);
  return (
    <View style={s.picker}>
      <Text style={UI.subtitle}>Which product answers this request? The renter is told it’s in the catalogue (in-app + email).</Text>
      <TextInput style={UI.input} value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={SHADES.carbonPlaceholder} autoCorrect={false} />
      {all == null ? <ActivityIndicator color={SHADES.amber} /> : matches.length === 0 ? (
        <Text style={UI.subtitle}>No product matches.</Text>
      ) : matches.map(p => (
        <TouchableOpacity key={p.id} style={s.pickRow} disabled={busy} onPress={() => onPick(p)} activeOpacity={0.75}>
          <Text style={[UI.body, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
          <Text style={UI.link}>Choose</Text>
        </TouchableOpacity>
      ))}
      <Text style={[UI.link, { alignSelf: 'flex-start' }]} onPress={onCancel}>Cancel</Text>
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
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: SHADES.carbonLight },
  statusNew: { backgroundColor: SHADES.amberLight },
  statusText: { fontSize: 12, fontWeight: '600', color: SHADES.carbon },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1 },
  picker: { gap: 8, marginTop: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
});
