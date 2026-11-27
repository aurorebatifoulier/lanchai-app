import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, BackHandler,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Text, TextInput } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import StepProgress from '@/components/StepProgress';
import SignaturePad, { inkLength, toSignatureSvg, type Signature } from '@/components/SignaturePad';
import UnitsStepper from '@/components/UnitsStepper';
import {
  ConditionCard, emptyCondition, conditionReady, worstCondition, conditionPayload, type ConditionState,
} from '@/components/admin/ConditionCard';
import { UI, useScreenInsets } from '@/components/account/ui';
import { RATING_LABELS } from '@/components/ChecklistSummary';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { TYPE } from '@/constants/typography';
import { db, storage } from '@/lib/firebase';
import { adminIdentity } from '@/lib/adminAudit';
import { useAuth } from '@/contexts/AuthContext';
import type { RentalDoc } from '@/lib/firestore';
import { phaseOf, PHASE_LABELS } from '@/functions/src/shared/reservationMachine';
import {
  quoteReturn, submitReturnFlow, resultSentence, money, QuoteChangedError,
  type ReturnItem, type ReturnQuote, type OwnerAdjustment, type Settlement,
} from '@/lib/returnFlow';

// Admin → Return (staff AND owner, one item or a whole order): 3 steps —
//   1 · Condition: checklist + photos only (a part not Good needs ≥ 1 photo), no money;
//   2 · Settlement: the SERVER's figures (quoteReturn — shared returnCharges, deposit =
//       what was received at handover), in the deposit's currency only, one big result
//       box; owners may waive / lower fees here; staff can't change anything;
//   3 · Client confirms: summary + the client's signature, "Recorded by …" automatic →
//       submitReturn (recomputes the quote; `quote-changed` sends you back to step 2).
// Nothing is written before step 3. The back arrow goes to the previous step without
// losing anything; steps can't be skipped. /admin/return?ids=a,b

const STEPS = ['1 · Condition', '2 · Settlement', '3 · Client confirms'];
type ItemState = ConditionState;
const emptyItem = emptyCondition;
const itemReady = conditionReady;
const worstOf = worstCondition;

export default function AdminReturnScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { adminRole } = useAuth();
  const owner = adminRole === 'owner';
  const params = useLocalSearchParams<{ ids?: string }>();
  const ids = useMemo(() => (params.ids ?? '').split(',').filter(Boolean), [params.ids]);

  const [docs, setDocs] = useState<Record<string, RentalDoc>>({});
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [quote, setQuote] = useState<ReturnQuote | null>(null);
  const [adjust, setAdjust] = useState<Record<string, OwnerAdjustment>>({});
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // LIVE reservations — the state machine guard (another phone / a stale screen).
  useEffect(() => {
    const unsubs = ids.map(id => onSnapshot(doc(db, 'reservations', id), snap => {
      if (snap.exists()) setDocs(prev => ({ ...prev, [id]: { id, ...snap.data() } as RentalDoc }));
    }));
    setItems(prev => Object.fromEntries(ids.map(id => [id, prev[id] ?? emptyItem()])));
    setOpenItem(ids[0] ?? null);
    return () => unsubs.forEach(u => u());
  }, [ids]);
  useEffect(() => { adminIdentity().then(setMe).catch(() => {}); }, []);

  const goBack = useCallback(() => {
    if (done) { router.replace(ids.length === 1 ? `/admin/reservations/${ids[0]}` : '/admin/reservations'); return true; }
    if (step > 0) { setStep(step - 1); setError(null); return true; }
    router.back();
    return true;
  }, [step, done, ids, router]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]));

  const loaded = ids.length > 0 && ids.every(id => docs[id]);
  const blocked = loaded && !done && !busy && ids.some(id => phaseOf(docs[id]) !== 'out');
  const allReady = ids.length > 0 && ids.every(id => items[id] && itemReady(items[id]));

  const payload = (photoUrls?: Record<string, string[]>): ReturnItem[] => ids.map(id => ({
    reservationId: id,
    ...conditionPayload(items[id], photoUrls?.[id] ?? []),
    chargeUnits: items[id].units,
  }));

  const loadQuote = useCallback(async (adj: Record<string, OwnerAdjustment>) => {
    setBusy(true); setError(null);
    try {
      const q = await quoteReturn(payload(), adj);
      setQuote(q);
      return q;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ids]);

  const toSettlement = async () => {
    if (!allReady) return;
    if (await loadQuote(adjust)) setStep(1);
  };

  const confirm = async () => {
    if (!quote || !settlement || !signature) return;
    setBusy(true); setError(null);
    try {
      // Photos are uploaded only now (nothing is written before the client confirms).
      const urls: Record<string, string[]> = {};
      for (const id of ids) {
        urls[id] = [];
        for (let i = 0; i < items[id].photos.length; i++) {
          const c = await manipulateAsync(items[id].photos[i], [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
          const blob: Blob = await (await fetch(c.uri)).blob();
          const r = storageRef(storage, `reservations/${id}/return/${Date.now()}_${i}.jpg`);
          await uploadBytes(r, blob, { contentType: 'image/jpeg' });
          urls[id].push(await getDownloadURL(r));
        }
      }
      const q = await submitReturnFlow({
        items: payload(urls), adjustments: owner ? adjust : {}, settlement, quote,
        clientSignatureSvg: toSignatureSvg(signature),
      });
      setDone(resultSentence(q, settlement));
    } catch (e) {
      if (e instanceof QuoteChangedError) {
        if (e.quote) setQuote(e.quote);
        setSettlement(null);
        setStep(1);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  // Header like every stack screen: back left, centered "Return" + the item(s) as a
  // truncated subtitle (never under the back button).
  const subtitle = ids.length > 1 ? `${ids.length} items` : docs[ids[0]]?.productName ?? '';
  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.fixed}>
        <View style={s.header}>
          <View style={s.titleBlock} pointerEvents="none">
            <Text style={s.title} numberOfLines={1}>Return</Text>
            {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <BackButton onPress={goBack} />
        </View>
        {!done && <StepProgress steps={STEPS} current={step} />}
      </View>

      {!loaded ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /> : done ? (
        <View style={s.center}>
          <Feather name="check-circle" size={48} color={COLORS.success} />
          <Text style={s.doneText}>{done}</Text>
          <TouchableOpacity style={[UI.btnPrimary, s.wide]} activeOpacity={0.85}
            onPress={() => router.replace(ids.length === 1 ? `/admin/reservations/${ids[0]}` : '/admin/reservations')}>
            <Text style={UI.btnPrimaryText}>{ids.length === 1 ? 'Back to the booking' : 'Back to rentals'}</Text>
          </TouchableOpacity>
        </View>
      ) : blocked ? (
        <View style={s.center}>
          <Feather name="lock" size={32} color={COLORS.fg3} />
          <Text style={s.doneText}>
            {`Nothing to do here — ${ids.length > 1 ? 'an item' : 'this booking'} is now “${PHASE_LABELS[phaseOf(docs[ids.find(id => phaseOf(docs[id]) !== 'out')!])!]}”.`}
          </Text>
          <TouchableOpacity style={[UI.btnPrimary, s.wide]} activeOpacity={0.85}
            onPress={() => router.replace(ids.length === 1 ? `/admin/reservations/${ids[0]}` : '/admin/reservations')}>
            <Text style={UI.btnPrimaryText}>Open the booking</Text>
          </TouchableOpacity>
        </View>
      ) : step === 0 ? (
        <ConditionStep
          ids={ids} docs={docs} items={items} openItem={openItem} setOpenItem={setOpenItem}
          setItem={(id, next) => { setItems(prev => ({ ...prev, [id]: next })); setQuote(null); }}
          ready={allReady} busy={busy} error={error} onNext={toSettlement} bottom={screen.contentBottom}
        />
      ) : step === 1 && quote ? (
        <SettlementStep
          quote={quote} owner={owner} adjust={adjust} busy={busy} error={error} bottom={screen.contentBottom}
          onAdjust={async next => { setAdjust(next); await loadQuote(next); }}
          onChoose={sel => { setSettlement(sel); setError(null); setStep(2); }}
        />
      ) : quote && settlement ? (
        <ConfirmStep
          quote={quote} settlement={settlement} items={items} ids={ids} me={me}
          signature={signature} setSignature={setSignature} busy={busy} error={error}
          onConfirm={confirm}
        />
      ) : null}
    </View>
  );
}

// ── Step 1 · Condition ───────────────────────────────────────────────────────────
function ConditionStep({ ids, docs, items, openItem, setOpenItem, setItem, ready, busy, error, onNext, bottom }: {
  ids: string[]; docs: Record<string, RentalDoc>; items: Record<string, ItemState>;
  openItem: string | null; setOpenItem: (id: string | null) => void;
  setItem: (id: string, next: ItemState) => void;
  ready: boolean; busy: boolean; error: string | null; onNext: () => void; bottom: number;
}) {
  return (
    <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
      {ids.map((id, n) => {
        const it = items[id];
        const r = docs[id];
        if (!it || !r) return null;
        const worst = worstOf(it);
        return (
          <ConditionCard key={id} title={`${r.productName}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`}
            index={n} count={ids.length} open={openItem === id || ids.length === 1}
            onToggle={() => setOpenItem(openItem === id ? null : id)}
            state={it} onChange={next => setItem(id, next)} reference={r.handoverChecklist?.categories ?? null}
            referencePhotos={r.handoverChecklist?.photos ?? []}
            referenceAccessories={r.handoverChecklist?.accessories}
            extra={(worst === 'damaged' || worst === 'unusable') && r.quantity > 1 ? (
              <UnitsStepper label={worst === 'unusable' ? 'Units unusable' : 'Units damaged'}
                value={it.units} max={r.quantity} onChange={n2 => setItem(id, { ...it, units: n2 })} />
            ) : null} />
        );
      })}
      {!!error && <Text style={UI.errorText}>{error}</Text>}
      <TouchableOpacity disabled={!ready || busy} style={[UI.btnPrimary, s.cta, (!ready || busy) && UI.btnDisabled]}
        onPress={onNext} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Next · Settlement</Text>}
      </TouchableOpacity>
      {!ready && <Text style={[UI.small, { textAlign: 'center' }]}>Rate every part{ids.length > 1 ? ' of every item' : ''} first.</Text>}
    </ScrollView>
  );
}

// ── Step 2 · Settlement ──────────────────────────────────────────────────────────
function SettlementStep({ quote: q, owner, adjust, busy, error, onAdjust, onChoose, bottom }: {
  quote: ReturnQuote; owner: boolean; adjust: Record<string, OwnerAdjustment>; busy: boolean; error: string | null;
  onAdjust: (next: Record<string, OwnerAdjustment>) => void; onChoose: (s: Settlement) => void; bottom: number;
}) {
  const cur = q.currency;
  const [damageInput, setDamageInput] = useState<Record<string, string>>({});
  const lak = (v: number | null) => (cur !== 'LAK' && v != null ? `≈ ${v.toLocaleString('en-US')} LAK` : null);
  // One label line, the amount alone in large type, ≈ LAK in small (non-LAK deposits).
  const box = q.result === 'refund'
    ? { bg: '#E7F4EC', border: COLORS.success, label: 'Give back to the client', amount: money(q.refund, cur), sub: lak(q.refundLak) }
    : q.result === 'collect'
      ? { bg: '#FDECEA', border: COLORS.danger, label: 'Client pays', amount: money(q.collect, cur), sub: lak(q.collectLak) }
      : { bg: '#FFF6DB', border: SHADES.amber, label: 'Keep the deposit · owner reviews', amount: money(q.depositHeld, cur), sub: null };
  const setAdj = (id: string, patch: OwnerAdjustment) => onAdjust({ ...adjust, [id]: { ...adjust[id], ...patch } });
  return (
    <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
      <View style={[UI.card, UI.cardPadded, s.card]}>
        <Text style={UI.title}>{`Settlement · in ${cur} (paid in ${cur})`}</Text>
        {q.lines.map(l => (
          <View key={l.reservationId} style={s.lineBlock}>
            {q.lines.length > 1 && <Text style={s.lineItem}>{`${l.productName}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`}</Text>}
            <Row label="Deposit received" value={money(l.depositHeld, cur)} />
            <Row label={l.lateSuggested != null ? `Late fee · ${l.lateDays} day${l.lateDays === 1 ? '' : 's'}` : 'Late fee'}
              value={l.lateWaived ? 'Waived' : l.late != null ? `− ${money(l.late, cur)}` : 'None'} />
            <Row label={l.damagePercent != null ? `Damage · ${RATING_LABELS[l.condition]}` : 'Damage'}
              value={l.damageWaived ? 'Waived' : l.damage != null ? `− ${money(l.damage, cur)}` : l.damagePercent != null ? 'Owner decides' : 'None'} />
            {owner && (l.lateSuggested != null || l.damagePercent != null) && (
              <View style={s.ownerBox}>
                {l.lateSuggested != null && (
                  <TouchableOpacity style={[UI.choice, l.lateWaived && UI.choiceOn]} disabled={busy}
                    onPress={() => setAdj(l.reservationId, { waiveLate: !l.lateWaived })}>
                    <Text style={[UI.choiceText, l.lateWaived && UI.choiceTextOn]}>{l.lateWaived ? 'Late fee waived · undo' : 'Waive late fee'}</Text>
                  </TouchableOpacity>
                )}
                {l.damagePercent != null && (
                  <>
                    <TouchableOpacity style={[UI.choice, l.damageWaived && UI.choiceOn]} disabled={busy}
                      onPress={() => setAdj(l.reservationId, { waiveDamage: !l.damageWaived })}>
                      <Text style={[UI.choiceText, l.damageWaived && UI.choiceTextOn]}>{l.damageWaived ? 'Damage waived · undo' : 'Waive damage'}</Text>
                    </TouchableOpacity>
                    {!l.damageWaived && (
                      <View style={s.row}>
                        <TextInput style={[UI.input, s.flex]} keyboardType="number-pad" value={damageInput[l.reservationId] ?? ''}
                          placeholder={l.damageSuggested != null ? `Damage ≤ ${l.damageSuggested} ${cur}` : `Damage in ${cur}`}
                          placeholderTextColor={SHADES.carbonPlaceholder}
                          onChangeText={t => setDamageInput(prev => ({ ...prev, [l.reservationId]: t }))} />
                        <TouchableOpacity style={[UI.btnSecondary, UI.btnCard]} disabled={busy}
                          onPress={() => {
                            const v = Math.ceil(Number((damageInput[l.reservationId] ?? '').replace(/[\s,]/g, '')));
                            if (Number.isFinite(v) && v > 0) setAdj(l.reservationId, { damageAmount: v });
                          }}>
                          <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Set</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        ))}
        <View style={s.divider} />
        <Row label="Result" value={q.result === 'refund' ? money(q.refund, cur)
          : q.result === 'collect' ? money(q.collect, cur) : money(q.depositHeld, cur)} bold />
      </View>

      <View style={[s.resultBox, { backgroundColor: box.bg, borderColor: box.border }]}>
        <Text style={s.resultLabel}>{box.label}</Text>
        <Text style={s.resultAmount}>{box.amount}</Text>
        {!!box.sub && <Text style={UI.small}>{box.sub}</Text>}
      </View>
      <View style={s.lockRow}>
        <Feather name="lock" size={13} color={COLORS.fg3} />
        <Text style={UI.small}>Fees follow the shop rules. Only an owner can change them.</Text>
      </View>

      {!!error && <Text style={UI.errorText}>{error}</Text>}
      {busy ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 16 }} /> : (
        <>
          <TouchableOpacity style={[UI.btnPrimary, s.cta]} activeOpacity={0.85}
            onPress={() => onChoose(q.result === 'refund' ? 'refund' : q.result === 'collect' ? 'collected' : 'review')}>
            <Text style={UI.btnPrimaryText}>
              {q.result === 'refund' ? `I gave back ${money(q.refund, cur)}` : q.result === 'collect' ? `I collected ${money(q.collect, cur)}` : 'Keep deposit for review'}
            </Text>
          </TouchableOpacity>
          {q.result === 'collect' && (
            <TouchableOpacity onPress={() => onChoose('open')} style={s.link} accessibilityRole="button">
              <Text style={UI.link}>Client can’t pay now — leave the balance open</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.rowLine}>
      <Text style={[s.rowLabel, bold && s.bold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.bold]}>{value}</Text>
    </View>
  );
}

// ── Step 3 · Client confirms ─────────────────────────────────────────────────────
function ConfirmStep({ quote: q, settlement, items, ids, me, signature, setSignature, busy, error, onConfirm }: {
  quote: ReturnQuote; settlement: Settlement; items: Record<string, ItemState>; ids: string[];
  me: { name: string; role: string } | null; signature: Signature | null; setSignature: (s: Signature) => void;
  busy: boolean; error: string | null; onConfirm: () => void;
}) {
  const cur = q.currency;
  const signed = !!signature && inkLength(signature.strokes) > 40;
  const outcome = settlement === 'refund' ? `You get back ${money(q.refund, cur)}.`
    : settlement === 'collected' ? `You paid ${money(q.collect, cur)} on top of the deposit.`
    : settlement === 'open' ? `${money(q.collect, cur)} is still to pay.`
    : 'The deposit is kept until our team reviews the damage.';
  return (
    <View style={s.confirmRoot}>
      <ScrollView style={s.summaryScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        <View style={s.handRow}>
          <Feather name="smartphone" size={16} color={SHADES.amberText} />
          <Text style={UI.title}>Hand the phone to the client</Text>
        </View>
        <View style={[UI.card, UI.cardPadded, { gap: 6 }]}>
          {q.lines.map((l, i) => (
            <View key={l.reservationId} style={{ gap: 2 }}>
              <Text style={s.lineItem}>{`${l.productName}${l.quantity > 1 ? ` × ${l.quantity}` : ''} · ${RATING_LABELS[worstOf(items[ids[i]])]}`}</Text>
              {l.late != null && <Text style={UI.small}>{`Late fee (${l.lateDays} day${l.lateDays === 1 ? '' : 's'}): ${money(l.late, cur)}`}</Text>}
              {l.lateWaived && <Text style={UI.small}>Late fee waived by our team</Text>}
              {l.damage != null && <Text style={UI.small}>{`Damage: ${money(l.damage, cur)}`}</Text>}
              {l.damageWaived && <Text style={UI.small}>Damage charge waived by our team</Text>}
            </View>
          ))}
          <Text style={s.outcome}>{outcome}</Text>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Text style={s.catLabel}>Client signature</Text>
        <View style={s.padWrap}><SignaturePad height={160} onChange={setSignature} /></View>
        {!!me && <Text style={UI.small}>{`Recorded by ${me.name} (${me.role === 'owner' ? 'Owner' : 'Staff'})`}</Text>}
        {!!error && <Text style={UI.errorText}>{error}</Text>}
        <TouchableOpacity disabled={!signed || busy} style={[UI.btnPrimary, (!signed || busy) && UI.btnDisabled]}
          onPress={onConfirm} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Confirm return</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  fixed: { flexShrink: 0, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, minHeight: 64 },
  titleBlock: { position: 'absolute', left: 76, right: 76, alignItems: 'center' },
  title: { ...TYPE.sectionTitle, color: SHADES.carbon },
  subtitle: { ...TYPE.secondary, color: SHADES.carbonMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  doneText: { ...TYPE.sectionTitle, color: SHADES.carbon, textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  card: { gap: 10, marginTop: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cat: { gap: 6 },
  catLabel: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white },
  chipText: { ...TYPE.tab, color: SHADES.carbon },
  note: { height: 44 },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(30,30,30,0.7)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  cta: { marginTop: 16 },
  lineBlock: { gap: 4 },
  lineItem: { ...TYPE.cardTitle, color: SHADES.carbon },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { ...TYPE.body, color: SHADES.carbonMuted, flex: 1 },
  rowValue: { ...TYPE.body, fontWeight: '600', color: SHADES.carbon },
  bold: { fontWeight: '700', color: SHADES.carbon },
  divider: { height: 1, backgroundColor: COLORS.softGray200 },
  ownerBox: { gap: 8, paddingVertical: 4 },
  resultBox: { marginTop: 14, borderRadius: 18, borderWidth: 1.5, padding: 18, gap: 4 },
  resultLabel: { ...TYPE.secondary, fontWeight: '600', color: SHADES.carbon },
  resultAmount: { ...TYPE.display, color: SHADES.carbon },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  link: { alignSelf: 'center', paddingVertical: 12 },
  confirmRoot: { flex: 1, gap: 8, paddingBottom: 16 },
  summaryScroll: { flexGrow: 0, maxHeight: 260 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  outcome: { ...TYPE.cardTitle, color: SHADES.carbon, marginTop: 4 },
  padWrap: { borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, overflow: 'hidden' },
});
