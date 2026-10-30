import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { PROMO_COPY } from '@/constants/promoCopy';
import { UI } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import { adminGrantPromo, listPromoCodes, type PromoDoc } from '@/lib/promoCodes';
import { endOfDayMs } from '@/components/admin/PromoGrantPanel';
import { promoStatus, promoValueText } from '@/functions/src/shared/promo';

// Renter block (admin reservation detail) → "Give a code": pick an active / scheduled
// code (not the automatic referral one), optional personal expiry → adminGrantPromo.

const c = PROMO_COPY.admin;
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function GiveCodeBox({ renterId, onClose }: { renterId: string; onClose: () => void }) {
  const [codes, setCodes] = useState<PromoDoc[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    listPromoCodes()
      .then(all => setCodes(all.filter(p => !p.system && ['active', 'scheduled'].includes(promoStatus(p, now)))
        .sort((a, b) => a.code.localeCompare(b.code))))
      .catch(() => setCodes([]));
  }, []);

  const give = async () => {
    if (!code) return;
    setBusy(true); setError(null);
    try {
      const r = await adminGrantPromo(code, [renterId], expiry ? endOfDayMs(expiry) : null);
      setMessage(c.giveDone(r.granted, r.skipped));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={UI.title}>{c.giveCodeTitle}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}><Feather name="x" size={18} color={SHADES.carbonMuted} /></TouchableOpacity>
      </View>
      {codes == null ? <ActivityIndicator color={SHADES.amber} /> : codes.length === 0 ? (
        <Text style={UI.body}>{c.giveCodeNone}</Text>
      ) : (
        <>
          <Text style={UI.small}>{c.giveCodePick}</Text>
          <View style={s.chips}>
            {codes.map(p => {
              const on = code === p.code;
              return (
                <TouchableOpacity key={p.code} style={[s.chip, on && s.chipOn]} onPress={() => setCode(p.code)} activeOpacity={0.8}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{`${p.code} · ${promoValueText(p.type, p.value)}`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.expiryRow}>
            <Text style={[UI.small, { flex: 1 }]}>{c.giveExpiry}</Text>
            <TouchableOpacity onPress={() => setPicker(true)} hitSlop={8}>
              <Text style={UI.link}>{expiry ? fmtDay(expiry) : c.giveNoExpiry}</Text>
            </TouchableOpacity>
          </View>
          <PressScale style={[UI.btnPrimary, (!code || busy) && UI.btnDisabled]} onPress={give} disabled={!code || busy}>
            {busy ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.giveButton(1)}</Text>}
          </PressScale>
        </>
      )}
      {!!message && <Text style={UI.small}>{message}</Text>}
      {!!error && <Text style={UI.errorText}>{error}</Text>}
      <AdminDateTimePicker
        visible={picker} dateOnly minDaysAhead={1} title={c.giveExpiry} initialValue={expiry}
        onClose={() => setPicker(false)} onConfirm={d => { setExpiry(d); setPicker(false); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { marginTop: 10, gap: 10, padding: 12, borderRadius: 14, borderWidth: 0.5, borderColor: SHADES.border, backgroundColor: SHADES.white },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: SHADES.border, justifyContent: 'center', backgroundColor: SHADES.white },
  chipOn: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  chipText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  chipTextOn: { color: SHADES.cream },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
