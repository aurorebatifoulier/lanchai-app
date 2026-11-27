import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, BackHandler, Switch } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Text } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import StepProgress from '@/components/StepProgress';
import { UI, CheckLine, useScreenInsets } from '@/components/account/ui';
import {
  ConditionCard, emptyCondition, conditionReady, worstCondition, conditionPayload, MIN_HANDOVER_PHOTOS, type ConditionState,
} from '@/components/admin/ConditionCard';
import { accessoriesFor } from '@/functions/src/shared/rentalAgreement';
import { useIdCheck, IdCheckSection } from '@/components/admin/IdCheckSection';
import { RenterNameBlock } from '@/components/admin/RenterNameBlock';
import { RefusePickupBox } from '@/components/admin/OwnerReview';
import { AgreementSection, type SignedAgreement } from '@/components/admin/AgreementSection';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { TYPE } from '@/constants/typography';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { earlyHandoverPrompt, type RentalDoc, type ChecklistData } from '@/lib/firestore';
import { ID_DOC_TYPES } from '@/lib/identity';
import { conditionLines, uploadAgreement, type HandoverInfo } from '@/lib/rentalAgreement';
import { quoteHandover, submitHandover, HandoverQuoteChangedError } from '@/lib/handover';
import { canDo, phaseOf, PHASE_LABELS } from '@/functions/src/shared/reservationMachine';
import { isBeforePickupDay, vteDay } from '@/functions/src/shared/dates';
import {
  PAY_CURRENCIES, PAY_METHODS, collectFor, fmtMoney, paymentPartLabel, rentalPaymentMethodKey,
  type HandoverQuote, type PayCurrency, type PayMethod, type PickupPayment,
} from '@/functions/src/shared/handoverQuote';

// Admin → Pick-up (staff AND owner, one item or a whole order): 4 steps —
//   1 · ID: the renter, the first-pick-up ID check (photo at the counter if none on file),
//       the phone number checked; "Refuse pick-up" is offered here;
//   2 · Condition: the checklist + photos, no amounts;
//   3 · Payment: the SERVER's figures (quoteHandover — rental + deposit frozen at booking),
//       currency + method chips (the deposit may be paid in another currency / method),
//       the rate used and its date, ONE "Collect from the client" box; nothing editable;
//   4 · Client signs: summary + the rental agreement → "Confirm pick-up" = submitHandover
//       (re-checks everything in ONE transaction; `quote-changed` → back to step 3).
// Nothing is written before step 4 (except a refused pick-up). The back arrow goes to the
// previous step without losing anything; steps can't be skipped. /admin/pickup?ids=a,b

// Short labels: 4 segments must fit a 360dp-wide phone (StepProgress also shrinks them).
const STEPS = ['ID', 'Condition', 'Payment', 'Signature'];
type Part = { currency: PayCurrency; method: PayMethod | null };

export default function AdminPickupScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { adminRole } = useAuth();
  const role = adminRole ?? 'staff';
  const params = useLocalSearchParams<{ ids?: string }>();
  const ids = useMemo(() => (params.ids ?? '').split(',').filter(Boolean), [params.ids]);

  const [docs, setDocs] = useState<Record<string, RentalDoc>>({});
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Record<string, ConditionState>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [quote, setQuote] = useState<HandoverQuote | null>(null);
  const [rentalPart, setRentalPart] = useState<Part>({ currency: 'LAK', method: null });
  const [depositPart, setDepositPart] = useState<Part>({ currency: 'LAK', method: null });
  const [split, setSplit] = useState(false);
  const [signed, setSigned] = useState<SignedAgreement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [doneLines, setDoneLines] = useState<string[]>([]);

  // LIVE reservations — the state machine guard (another phone / a stale screen).
  useEffect(() => {
    const unsubs = ids.map(id => onSnapshot(doc(db, 'reservations', id), snap => {
      if (snap.exists()) setDocs(prev => ({ ...prev, [id]: { id, ...snap.data() } as RentalDoc }));
    }));
    setItems(prev => Object.fromEntries(ids.map(id => [id, prev[id] ?? emptyCondition()])));
    setOpenItem(ids[0] ?? null);
    return () => unsubs.forEach(u => u());
  }, [ids]);

  // Accessories to hand over: the product's "What's included" × booked quantity (once per item).
  const loadedKey = ids.filter(id => docs[id]).join(',');
  useEffect(() => {
    for (const id of ids) {
      const r = docs[id];
      if (!r || items[id]?.accessories !== undefined) continue;
      getDoc(doc(db, 'products', r.productId))
        .then(p => setItems(prev => prev[id] && prev[id].accessories === undefined
          ? { ...prev, [id]: { ...prev[id], accessories: accessoriesFor(p.get('whatsIncluded'), r.quantity) } }
          : prev))
        .catch(() => setItems(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], accessories: null } } : prev)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const first = docs[ids[0]] as RentalDoc | undefined;
  const renterId = first?.renterId ?? null;
  const idCheck = useIdCheck(renterId);
  useEffect(() => {
    if (!renterId) return;
    getDoc(doc(db, 'users', renterId)).then(s => { if (s.get('phoneVerified') === true) setPhoneChecked(true); }).catch(() => {});
  }, [renterId]);

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
  const blockedId = loaded && !done && !busy ? ids.find(id => !canDo(docs[id], 'handover', role)) : undefined;
  const earlyDayMs = loaded ? ids.map(id => docs[id].pickupAt?.toMillis() ?? 0).find(ms => isBeforePickupDay(ms)) : undefined;
  const conditionOk = ids.length > 0 && ids.every(id => items[id] && items[id].accessories !== undefined && conditionReady(items[id], MIN_HANDOVER_PHOTOS));
  const pay: PickupPayment | null = rentalPart.method && (split ? depositPart.method : true)
    ? {
      rental: { currency: rentalPart.currency, method: rentalPart.method },
      deposit: split
        ? { currency: depositPart.currency, method: depositPart.method! }
        : { currency: rentalPart.currency, method: rentalPart.method },
    }
    : null;
  const due = quote && pay ? collectFor(quote, pay) : null;

  const toPayment = async () => {
    if (!conditionOk) return;
    setBusy(true); setError(null);
    try {
      setQuote(await quoteHandover(ids));
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // What the client signs for (the agreement): condition, deposit received, payment.
  const handoverInfo = useMemo((): HandoverInfo | null => {
    if (!quote || !pay) return null;
    const dep = quote.currencies[pay.deposit.currency];
    const rent = quote.currencies[pay.rental.currency];
    if (!dep || !rent) return null;
    return {
      items: Object.fromEntries(ids.map((id, i) => {
        const categories = conditionPayload(items[id], []).categories as ChecklistData['categories'];
        return [id, {
          condition: conditionLines(categories),
          photoCount: items[id].photos.length,
          depositReceived: { amount: dep.depositPerLine[i], currency: pay.deposit.currency },
          categories,
          accessories: items[id].accessories ?? null,
          photos: items[id].photos,
        }];
      })),
      paymentMethod: rentalPaymentMethodKey(pay.rental),
      paymentLabel: pay.rental.currency === 'LAK' ? paymentPartLabel(pay.rental)
        : `${paymentPartLabel(pay.rental)} (${fmtMoney(rent.rental, pay.rental.currency)})`,
      depositPaymentLabel: paymentPartLabel(pay.deposit),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, pay?.rental.currency, pay?.rental.method, pay?.deposit.currency, pay?.deposit.method, items, ids]);

  const confirm = async () => {
    if (!quote || !pay || !due || !signed) return;
    setBusy(true); setError(null);
    try {
      // Uploads happen only now (nothing is written before the client signs).
      const photoUrls: Record<string, string[]> = {};
      for (const id of ids) {
        photoUrls[id] = [];
        for (let i = 0; i < items[id].photos.length; i++) {
          const c = await manipulateAsync(items[id].photos[i], [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
          const blob: Blob = await (await fetch(c.uri)).blob();
          const r = storageRef(storage, `reservations/${id}/handover/${Date.now()}_${i}.jpg`);
          await uploadBytes(r, blob, { contentType: 'image/jpeg' });
          photoUrls[id].push(await getDownloadURL(r));
        }
      }
      const idPayload = await idCheck.payload();
      const agreement = await uploadAgreement({ data: signed.data, termsMarkdown: signed.terms, capture: signed.capture });
      const got = await submitHandover({
        items: ids.map(id => ({ reservationId: id, checklist: conditionPayload(items[id], photoUrls[id]) })),
        payment: pay, collect: due, idCheck: idPayload, phoneVerified: phoneChecked,
        agreement: { id: agreement.agreementId, method: agreement.method },
      });
      const c = got.collected;
      setDone(pay.rental.currency === pay.deposit.currency
        ? `Picked up — you collected ${fmtMoney(c.rental + c.deposit, pay.rental.currency)}.`
        : `Picked up — you collected ${fmtMoney(c.rental, pay.rental.currency)} and ${fmtMoney(c.deposit, pay.deposit.currency)}.`);
      const returns = [...new Set(ids.map(i => docs[i]?.returnLabel).filter((x): x is string => !!x))];
      setDoneLines([
        got.emailed && got.email ? `Agreement sent to ${got.email}` : 'Agreement saved — the email couldn’t be sent.',
        ...returns.map(l => `Return due ${l}`),
      ]);
    } catch (e) {
      if (e instanceof HandoverQuoteChangedError) {
        if (e.quote) setQuote(e.quote);
        setSigned(null); // the agreement showed the old amounts
        setStep(2);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const subtitle = ids.length > 1 ? `${ids.length} items` : first?.productName ?? '';
  const backToBooking = () => router.replace(ids.length === 1 ? `/admin/reservations/${ids[0]}` : '/admin/reservations');
  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.fixed}>
        <View style={s.header}>
          <View style={s.titleBlock} pointerEvents="none">
            <Text style={s.title} numberOfLines={1}>Pick-up</Text>
            {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <BackButton onPress={goBack} />
        </View>
        {!done && !blockedId && earlyDayMs == null && <StepProgress steps={STEPS} current={step} />}
      </View>

      {!loaded ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /> : done ? (
        <View style={s.center}>
          <Feather name="check-circle" size={48} color={COLORS.success} />
          <Text style={s.doneText}>{done}</Text>
          {doneLines.map(l => <Text key={l} style={s.doneLine}>{l}</Text>)}
          <TouchableOpacity style={[UI.btnPrimary, s.wide]} activeOpacity={0.85} onPress={backToBooking}>
            <Text style={UI.btnPrimaryText}>{ids.length === 1 ? 'Back to the booking' : 'Back to rentals'}</Text>
          </TouchableOpacity>
        </View>
      ) : blockedId || earlyDayMs != null ? (
        <View style={s.center}>
          <Feather name="lock" size={32} color={COLORS.fg3} />
          <Text style={s.doneText}>
            {blockedId
              ? `Nothing to do here — ${ids.length > 1 ? 'an item' : 'this booking'} is now “${PHASE_LABELS[phaseOf(docs[blockedId])!] ?? docs[blockedId].status}”.`
              : earlyHandoverPrompt(earlyDayMs!)}
          </Text>
          <TouchableOpacity style={[UI.btnPrimary, s.wide]} activeOpacity={0.85} onPress={backToBooking}>
            <Text style={UI.btnPrimaryText}>Open the booking</Text>
          </TouchableOpacity>
        </View>
      ) : step === 0 ? (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          {idCheck.loading ? <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 16 }} /> : (
            <>
              {!idCheck.needed && renterId && (
                <View style={[UI.card, UI.cardPadded, s.card]}>
                  <RenterNameBlock renterId={renterId} />
                  <CheckLine text="ID already checked in person" />
                </View>
              )}
              <View style={{ marginTop: 12 }}><IdCheckSection check={idCheck} /></View>
            </>
          )}
          <View style={[UI.card, UI.cardPadded, s.card, s.toggleRow]}>
            <Text style={[UI.body, s.flex]}>Phone number checked with the client</Text>
            <Switch value={phoneChecked} onValueChange={setPhoneChecked}
              trackColor={{ false: COLORS.softGray200, true: COLORS.amber }} thumbColor={COLORS.white} />
          </View>
          {!!error && <Text style={UI.errorText}>{error}</Text>}
          <TouchableOpacity disabled={!idCheck.ready || !phoneChecked} style={[UI.btnPrimary, s.cta, (!idCheck.ready || !phoneChecked) && UI.btnDisabled]}
            onPress={() => { setError(null); setStep(1); }} activeOpacity={0.85}>
            <Text style={UI.btnPrimaryText}>Next · Condition</Text>
          </TouchableOpacity>
          {canDo(first!, 'refuse_pickup', role) && (refusing ? (
            <View style={{ marginTop: 12 }}>
              <RefusePickupBox reservationIds={ids} onCancel={() => setRefusing(false)} onDone={backToBooking} />
            </View>
          ) : (
            <TouchableOpacity onPress={() => setRefusing(true)} style={s.link} accessibilityRole="button">
              <Text style={s.dangerLink}>Refuse pick-up</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : step === 1 ? (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          {ids.map((id, n) => (
            <ConditionCard key={id} title={`${docs[id].productName}${docs[id].quantity > 1 ? ` × ${docs[id].quantity}` : ''}`}
              index={n} count={ids.length} open={openItem === id || ids.length === 1}
              onToggle={() => setOpenItem(openItem === id ? null : id)}
              minPhotos={MIN_HANDOVER_PHOTOS}
              state={items[id]} onChange={next => { setItems(prev => ({ ...prev, [id]: next })); setSigned(null); }} />
          ))}
          {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
          <TouchableOpacity disabled={!conditionOk || busy} style={[UI.btnPrimary, s.cta, (!conditionOk || busy) && UI.btnDisabled]}
            onPress={toPayment} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Next · Payment</Text>}
          </TouchableOpacity>
          {!conditionOk && <Text style={[UI.small, { textAlign: 'center', marginTop: 8 }]}>{`Rate every part and take at least ${MIN_HANDOVER_PHOTOS} photos${ids.length > 1 ? ' of every item' : ''}.`}</Text>}
        </ScrollView>
      ) : step === 2 && quote ? (
        <PaymentStep quote={quote} rentalPart={rentalPart} depositPart={depositPart} split={split}
          setRentalPart={p => { setRentalPart(p); setSigned(null); }}
          setDepositPart={p => { setDepositPart(p); setSigned(null); }}
          setSplit={v => { setSplit(v); setSigned(null); if (v) setDepositPart({ currency: rentalPart.currency, method: rentalPart.method }); }}
          due={due} pay={pay} error={error} bottom={screen.contentBottom}
          onNext={() => { setError(null); setStep(3); }} />
      ) : quote && pay && due && handoverInfo ? (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}>
          <View style={s.handRow}>
            <Feather name="smartphone" size={16} color={SHADES.amberText} />
            <Text style={UI.title}>Hand the phone to the client</Text>
          </View>
          <View style={[UI.card, UI.cardPadded, s.card]}>
            {ids.map(id => (
              <View key={id} style={{ gap: 2 }}>
                <Text style={s.lineItem}>{`${docs[id].productName}${docs[id].quantity > 1 ? ` × ${docs[id].quantity}` : ''}`}</Text>
                <Text style={UI.small}>{worstCondition(items[id]) === 'good'
                  ? 'All checked: good condition'
                  : conditionLines(conditionPayload(items[id], []).categories as ChecklistData['categories']).join(' · ')}</Text>
                {items[id].photos.length > 0 && <Text style={UI.small}>{`${items[id].photos.length} photo${items[id].photos.length === 1 ? '' : 's'}`}</Text>}
              </View>
            ))}
            <View style={s.divider} />
            <Row label={`Rental · ${paymentPartLabel(pay.rental)}`} value={fmtMoney(due.rental, pay.rental.currency)} />
            <Row label={`Deposit (refundable) · ${paymentPartLabel(pay.deposit)}`} value={fmtMoney(due.deposit, pay.deposit.currency)} />
          </View>
          <AgreementSection
            reservations={ids.map(id => docs[id])}
            handover={handoverInfo}
            renterOverride={idCheck.needed ? { idType: ID_DOC_TYPES.find(t => t.key === idCheck.docTypeKey)?.label ?? null, idCheckedToday: true } : undefined}
            ready
            signed={signed}
            onSigned={setSigned}
          />
          {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
          <TouchableOpacity disabled={!signed || busy} style={[UI.btnPrimary, s.cta, (!signed || busy) && UI.btnDisabled]}
            onPress={confirm} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Confirm pick-up</Text>}
          </TouchableOpacity>
          {!signed && <Text style={[UI.small, { textAlign: 'center', marginTop: 8 }]}>The client signs the agreement first.</Text>}
        </ScrollView>
      ) : null}
    </View>
  );
}

// ── Step 3 · Payment ─────────────────────────────────────────────────────────────
function PaymentStep({ quote: q, rentalPart, depositPart, split, setRentalPart, setDepositPart, setSplit, due, pay, error, bottom, onNext }: {
  quote: HandoverQuote; rentalPart: Part; depositPart: Part; split: boolean;
  setRentalPart: (p: Part) => void; setDepositPart: (p: Part) => void; setSplit: (v: boolean) => void;
  due: { rental: number; deposit: number } | null; pay: PickupPayment | null; error: string | null; bottom: number;
  onNext: () => void;
}) {
  const lak = (n: number) => fmtMoney(n, 'LAK');
  const rateLine = (cur: PayCurrency) => {
    const f = q.currencies[cur];
    if (!f || cur === 'LAK') return null;
    return `Rate used: 1 ${cur} = ${f.rate.toLocaleString('en-US')} LAK${f.rateSetAtMs ? ` · set ${vteDay(f.rateSetAtMs)}` : ''}`;
  };
  const sameCur = pay && pay.rental.currency === pay.deposit.currency;
  const amountIn = (cur: PayCurrency, what: 'rental' | 'deposit') => {
    const f = q.currencies[cur];
    return f ? fmtMoney(f[what], cur) : '—';
  };
  const totalIn = (cur: PayCurrency) => {
    const f = q.currencies[cur];
    return f ? fmtMoney(f.rental + f.deposit, cur) : '—';
  };
  return (
    <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: bottom }]}>
      <View style={[UI.card, UI.cardPadded, s.card]}>
        <Text style={UI.title}>Payment</Text>
        {q.lines.length > 1 && q.lines.map(l => (
          <Row key={l.reservationId} label={`${l.productName}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`} value={lak(l.subtotalLak)} muted />
        ))}
        <Row label="Rental subtotal" value={lak(q.rentalSubtotalLak)} />
        {q.discount && <Row label={q.discount.label} value={`− ${lak(q.discount.amount)}`} />}
        <View style={s.divider} />
        <Row label="Rental to pay" value={lak(q.rentalLak)} bold />
        <Row label="Deposit (refundable)" value={lak(q.depositLak)} bold />
      </View>

      {/* ONE row for both by default; the deposit row only after "Pay the deposit in another currency". */}
      <PartChips title={split ? `Rental · ${amountIn(rentalPart.currency, 'rental')}` : `Rental + deposit · ${totalIn(rentalPart.currency)}`} q={q} part={rentalPart} onChange={setRentalPart} rateLine={rateLine(rentalPart.currency)} />
      {split ? (
        <>
          <PartChips title={`Deposit · ${amountIn(depositPart.currency, 'deposit')}`} q={q} part={depositPart} onChange={setDepositPart} rateLine={rateLine(depositPart.currency)} />
          <TouchableOpacity onPress={() => setSplit(false)} style={s.link} accessibilityRole="button">
            <Text style={UI.link}>Same currency and method for both</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => setSplit(true)} style={s.link} accessibilityRole="button">
          <Text style={UI.link}>Pay the deposit in another currency</Text>
        </TouchableOpacity>
      )}

      {due && pay && (
        <View style={s.resultBox}>
          {sameCur ? (
            <>
              <Text style={s.resultLabel}>Collect from the client</Text>
              <Text style={s.resultAmount}>{fmtMoney(due.rental + due.deposit, pay.rental.currency)}</Text>
              <Text style={UI.small}>{`rental ${fmtMoney(due.rental, pay.rental.currency)} + deposit ${fmtMoney(due.deposit, pay.deposit.currency)} · ${paymentPartLabel(pay.rental)}`}</Text>
            </>
          ) : (
            <>
              <Text style={s.resultLabel}>Collect from the client</Text>
              <Text style={s.resultTwo}>{`Rental · ${fmtMoney(due.rental, pay.rental.currency)} · ${paymentPartLabel(pay.rental)}`}</Text>
              <Text style={s.resultTwo}>{`Deposit · ${fmtMoney(due.deposit, pay.deposit.currency)} · ${paymentPartLabel(pay.deposit)}`}</Text>
            </>
          )}
        </View>
      )}
      <View style={s.lockRow}>
        <Feather name="lock" size={13} color={COLORS.fg3} />
        <Text style={UI.small}>Amounts follow the booking. Only an owner can change them.</Text>
      </View>
      {!!error && <Text style={[UI.errorText, { marginTop: 8 }]}>{error}</Text>}
      <TouchableOpacity disabled={!due} style={[UI.btnPrimary, s.cta, !due && UI.btnDisabled]} onPress={onNext} activeOpacity={0.85}>
        <Text style={UI.btnPrimaryText}>
          {!due || !pay ? 'Choose how the client pays'
            : sameCur ? `I collected ${fmtMoney(due.rental + due.deposit, pay.rental.currency)}` : 'I collected both'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const METHOD_ICON: Record<PayMethod, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  cash: 'cash', bank_transfer: 'bank', qr: 'qrcode',
};

// One payment block: "Currency" = a segmented control (LAK | USD | THB, the rate used
// right under it), "Paid by" = 3 icon tiles. Distinct looks so currency and method can't
// be confused.
function PartChips({ title, q, part, onChange, rateLine }: {
  title: string; q: HandoverQuote; part: Part; onChange: (p: Part) => void; rateLine: string | null;
}) {
  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={s.partTitle}>{title}</Text>
      <Text style={s.fieldLabel}>Currency</Text>
      <View style={s.segment} accessibilityRole="radiogroup">
        {PAY_CURRENCIES.map(cur => {
          const ok = !!q.currencies[cur];
          const on = part.currency === cur;
          return (
            <TouchableOpacity key={cur} disabled={!ok} style={[s.segItem, on && s.segItemOn, !ok && { opacity: 0.35 }]}
              onPress={() => onChange({ ...part, currency: cur })} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !ok }}>
              <Text style={[s.segText, on && s.segTextOn]}>{cur}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!rateLine && <Text style={UI.small}>{rateLine}</Text>}
      <Text style={[s.fieldLabel, { marginTop: 4 }]}>Paid by</Text>
      <View style={s.tiles} accessibilityRole="radiogroup">
        {PAY_METHODS.map(m => {
          const on = part.method === m.key;
          return (
            <TouchableOpacity key={m.key} style={[s.tile, on && s.tileOn]} onPress={() => onChange({ ...part, method: m.key })}
              accessibilityRole="radio" accessibilityState={{ selected: on }} activeOpacity={0.8}>
              <MaterialCommunityIcons name={METHOD_ICON[m.key]} size={24} color={on ? SHADES.amberText : SHADES.carbon} />
              <Text style={[s.tileText, on && s.tileTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Why "Choose how the client pays" stays disabled: point at the missing choice. */}
      {!part.method && <Text style={s.hint}>Choose a payment method</Text>}
    </View>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={s.rowLine}>
      <Text style={[s.rowLabel, bold && s.bold, muted && UI.small]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.bold, muted && UI.small]}>{value}</Text>
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
  doneLine: { ...TYPE.body, color: SHADES.carbonMuted, textAlign: 'center' },
  card: { gap: 10, marginTop: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  cta: { marginTop: 16 },
  link: { alignSelf: 'center', paddingVertical: 12 },
  dangerLink: { ...TYPE.body, fontWeight: '700', color: COLORS.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  partTitle: { ...TYPE.secondary, fontWeight: '700', color: SHADES.carbon },
  hint: { ...TYPE.small, fontWeight: '600', color: SHADES.amberText },
  fieldLabel: { ...TYPE.small, fontWeight: '600', color: SHADES.carbonMuted },
  segment: { flexDirection: 'row', backgroundColor: SHADES.carbonLight, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segItemOn: {
    backgroundColor: COLORS.white,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  segText: { ...TYPE.body, fontWeight: '600', color: SHADES.carbonMuted },
  segTextOn: { color: SHADES.carbon, fontWeight: '800' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, minHeight: 72, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4,
  },
  tileOn: { borderColor: SHADES.amber, backgroundColor: SHADES.amberLight },
  tileText: { ...TYPE.small, fontWeight: '600', color: SHADES.carbon },
  tileTextOn: { color: SHADES.amberText, fontWeight: '800' },
  lineItem: { ...TYPE.cardTitle, color: SHADES.carbon },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { ...TYPE.body, color: SHADES.carbonMuted, flex: 1 },
  rowValue: { ...TYPE.body, fontWeight: '600', color: SHADES.carbon },
  bold: { fontWeight: '700', color: SHADES.carbon },
  divider: { height: 1, backgroundColor: COLORS.softGray200 },
  resultBox: { marginTop: 14, borderRadius: 18, borderWidth: 1.5, borderColor: SHADES.amber, backgroundColor: '#FFF6DB', padding: 18, gap: 4 },
  resultLabel: { ...TYPE.secondary, fontWeight: '600', color: SHADES.carbon },
  resultAmount: { ...TYPE.display, color: SHADES.carbon },
  resultTwo: { ...TYPE.sectionTitle, color: SHADES.carbon },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
