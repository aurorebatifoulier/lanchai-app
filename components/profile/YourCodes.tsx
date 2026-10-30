import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { SHADES } from '@/constants/brandShades';
import { PROMO_COPY } from '@/constants/promoCopy';
import { UI, SectionTitle, StatusChip } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { useMyGrants, savePromoCode, type PromoGrant } from '@/lib/promoCodes';
import { TIER_LABELS } from '@/lib/loyalty';
import { couponPercentFor } from '@/functions/src/shared/pricing';

// Loyalty → "Your codes": unused loyalty coupons + the promo wallet (promoGrants —
// display copy written by the server), with expiry and status, and "Add a code"
// (savePromoCode). Used / expired codes disappear 30 days later.

const w = PROMO_COPY.wallet;
const HIDE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

type Status = 'ready' | 'used' | 'expired';
function statusOf(g: PromoGrant, now: number): Status {
  if (g.used) return 'used';
  if (g.expiresAt?.toMillis && g.expiresAt.toMillis() <= now) return 'expired';
  return 'ready';
}

export function YourCodes({ coupons, config }: {
  coupons: { tier: string; percent: number; used: boolean }[];
  config: { couponPercentByTier?: Record<string, number> } | null;
}) {
  const grants = useMyGrants();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const now = Date.now();

  const shown = (grants ?? [])
    .map(g => ({ g, status: statusOf(g, now) }))
    .filter(({ g, status }) => {
      if (status === 'ready') return true;
      const at = status === 'used' ? g.usedAt?.toMillis?.() : g.expiresAt?.toMillis?.();
      return !at || now - at < HIDE_AFTER_MS;
    })
    .sort((a, b) => (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1)
      || (a.g.expiresAt?.toMillis?.() ?? Infinity) - (b.g.expiresAt?.toMillis?.() ?? Infinity));
  const readyCoupons = coupons.filter(c => !c.used && couponPercentFor(c.tier, config) > 0);

  const add = async () => {
    if (code.trim().length < 4 || busy) return;
    setBusy(true); setMessage(null);
    const r = await savePromoCode(code);
    setBusy(false);
    if (r.ok) { setMessage({ text: r.alreadySaved ? w.already : w.added, error: false }); setCode(''); }
    else setMessage({ text: r.message, error: true });
  };

  return (
    <View>
      <SectionTitle>{w.title}</SectionTitle>
      <View style={[UI.card, s.card]}>
        {grants == null ? <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 12 }} /> : (
          <>
            {readyCoupons.map((c, i) => (
              <Line key={`c${i}`}
                title={w.couponLine(TIER_LABELS[c.tier as keyof typeof TIER_LABELS] ?? c.tier, couponPercentFor(c.tier, config))}
                sub={w.couponConditions}
                when={w.noExpiry}
                status="ready" first={i === 0} />
            ))}
            {shown.map(({ g, status }, i) => (
              <Line key={g.code}
                title={`${g.code} · ${g.valueText ?? ''}`}
                sub={g.conditions ?? ''}
                when={g.expiresAt?.toMillis ? w.expires(fmtDay(g.expiresAt.toMillis() - 1)) : w.noExpiry}
                status={status} first={readyCoupons.length === 0 && i === 0} />
            ))}
            {readyCoupons.length === 0 && shown.length === 0 && <Text style={[UI.body, { paddingVertical: 6 }]}>{w.empty}</Text>}
          </>
        )}
        <View style={s.addRow}>
          <TextInput
            style={[UI.input, s.input]}
            value={code}
            onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
            placeholder={w.addPlaceholder}
            placeholderTextColor={SHADES.carbonFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={add}
          />
          <PressScale style={[UI.btnSecondary, s.addBtn, (code.length < 4 || busy) && UI.btnDisabled]} onPress={add} disabled={code.length < 4 || busy}>
            {busy ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnSecondaryText}>{w.addButton}</Text>}
          </PressScale>
        </View>
        {message && <Text style={message.error ? UI.errorText : UI.small}>{message.text}</Text>}
        <Text style={UI.small}>{w.oneDiscount}</Text>
      </View>
    </View>
  );
}

function Line({ title, sub, when, status, first }: { title: string; sub: string; when: string; status: Status; first: boolean }) {
  return (
    <View style={[s.line, !first && s.sep, status !== 'ready' && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={UI.title} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={UI.small} numberOfLines={1}>{sub}</Text>}
        <Text style={UI.small}>{when}</Text>
      </View>
      <StatusChip label={w.status[status]} tone={status === 'ready' ? 'amber' : 'grey'} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sep: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: { flex: 1, letterSpacing: 1, fontWeight: '700' },
  addBtn: { paddingHorizontal: 16, minWidth: 72 },
});
