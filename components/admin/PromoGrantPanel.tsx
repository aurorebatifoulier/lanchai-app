import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { PROMO_COPY } from '@/constants/promoCopy';
import { UI, SectionTitle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import {
  adminGrantPromo, adminRevokeGrant, listGrantsForCode, listRentersForPicker, type PromoGrant, type RenterPick,
} from '@/lib/promoCodes';

// Promo code form → "Assigned to": who has this code in their wallet (source, expiry,
// used), Remove (unused only), and "Give to renters" (search, multi-select, optional
// personal expiry) → adminGrantPromo (notification + email to each renter).

const c = PROMO_COPY.admin;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** Personal expiry = end of the chosen day (device time — the shop's, Vientiane). */
export const endOfDayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();

export function PromoGrantPanel({ code }: { code: string }) {
  const [grants, setGrants] = useState<PromoGrant[] | null>(null);
  const [renters, setRenters] = useState<RenterPick[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listGrantsForCode(code).then(setGrants).catch(() => setGrants([]));
  }, [code]);
  useEffect(() => { load(); listRentersForPicker().then(setRenters).catch(() => setRenters([])); }, [load]);

  const names = useMemo(() => new Map(renters.map(r => [r.uid, r.name])), [renters]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return renters.filter(r => r.name.toLowerCase().includes(q) || r.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 12);
  }, [renters, search]);

  const give = async () => {
    if (picked.length === 0) return;
    setBusy('give'); setError(null); setMessage(null);
    try {
      const r = await adminGrantPromo(code, picked, expiry ? endOfDayMs(expiry) : null);
      setMessage(c.giveDone(r.granted, r.skipped));
      setPicked([]); setSearch(''); setExpiry(null);
      load();
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  };

  const revoke = async (uid: string) => {
    setBusy(uid); setError(null);
    try { await adminRevokeGrant(code, uid); load(); } catch (e) { setError((e as Error).message); }
    setBusy(null);
  };

  return (
    <View>
      <SectionTitle>{`${c.assigned} · ${grants?.length ?? 0}`}</SectionTitle>
      <View style={[UI.card, UI.cardPadded, { gap: 2 }]}>
        {grants == null ? <ActivityIndicator color={SHADES.amber} /> : grants.length === 0 ? (
          <Text style={UI.body}>{c.assignedNone}</Text>
        ) : grants.map(g => (
          <View key={g.uid} style={s.grantRow}>
            <View style={{ flex: 1 }}>
              <Text style={UI.title} numberOfLines={1}>{names.get(g.uid) ?? g.uid}</Text>
              <Text style={UI.small}>
                {[c.grantSource[g.source], g.used ? c.grantUsed : null, g.expiresAt?.toMillis ? c.grantExpires(fmtDay(g.expiresAt.toMillis() - 1)) : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            {!g.used && (
              <TouchableOpacity onPress={() => revoke(g.uid)} disabled={!!busy} hitSlop={8}>
                {busy === g.uid ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.dangerText}>{c.removeGrant}</Text>}
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <SectionTitle>{c.give}</SectionTitle>
      <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
        <TextInput style={UI.input} value={search} onChangeText={setSearch} placeholder={c.giveSearch} placeholderTextColor={SHADES.carbonFaint} autoCorrect={false} />
        {matches.map(r => {
          const on = picked.includes(r.uid);
          return (
            <TouchableOpacity key={r.uid} style={s.pickRow} activeOpacity={0.7}
              onPress={() => setPicked(p => (on ? p.filter(x => x !== r.uid) : [...p, r.uid]))}>
              <View style={[s.check, on && s.checkOn]}>{on && <Feather name="check" size={14} color={SHADES.carbon} />}</View>
              <Text style={[UI.title, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
              {!!r.phone && <Text style={UI.small}>{r.phone}</Text>}
            </TouchableOpacity>
          );
        })}
        {picked.length > 0 && (
          <View style={s.chips}>
            {picked.map(uid => (
              <TouchableOpacity key={uid} style={s.chip} onPress={() => setPicked(p => p.filter(x => x !== uid))}>
                <Text style={s.chipText}>{names.get(uid) ?? uid}</Text>
                <Feather name="x" size={12} color={SHADES.cream} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={s.expiryRow}>
          <Text style={[UI.title, { flex: 1 }]}>{c.giveExpiry}</Text>
          <TouchableOpacity onPress={() => setPicker(true)} hitSlop={8}>
            <Text style={UI.link}>{expiry ? fmtDay(expiry.getTime()) : c.giveNoExpiry}</Text>
          </TouchableOpacity>
          {expiry && (
            <TouchableOpacity onPress={() => setExpiry(null)} hitSlop={8}><Feather name="x" size={16} color={SHADES.carbonMuted} /></TouchableOpacity>
          )}
        </View>
        <PressScale style={[UI.btnPrimary, (picked.length === 0 || !!busy) && UI.btnDisabled]} onPress={give} disabled={picked.length === 0 || !!busy}>
          {busy === 'give' ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.giveButton(picked.length)}</Text>}
        </PressScale>
        {!!message && <Text style={UI.small}>{message}</Text>}
        {!!error && <Text style={UI.errorText}>{error}</Text>}
      </View>

      <AdminDateTimePicker
        visible={picker}
        dateOnly
        minDaysAhead={1}
        title={c.giveExpiry}
        initialValue={expiry}
        onClose={() => setPicker(false)}
        onConfirm={d => { setExpiry(d); setPicker(false); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbonFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: SHADES.amber, borderColor: SHADES.amber },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SHADES.carbon, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12.5, fontWeight: '600', color: SHADES.cream },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
