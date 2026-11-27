import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Modal, TouchableOpacity, Image } from 'react-native';
import { Text } from '@/components/AppText';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { AGREEMENT_UI as c } from '@/constants/agreementCopy';
import { useReducedMotion } from '@/constants/motion';
import { UI, CheckLine, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { ConfirmBox } from '@/components/ConfirmBox';
import SignaturePad, { inkLength, type Signature } from '@/components/SignaturePad';
import { useShopInfo } from '@/lib/shop';
import { pickIdPhoto } from '@/lib/identity';
import type { RentalDoc } from '@/lib/firestore';
import {
  agreementIdFor, buildAgreementData, fmtDepositReceived, loadRenterBlock, termsForAnnex,
  type HandoverInfo, type AgreementCapture,
} from '@/lib/rentalAgreement';
import { vteDay, vteReservationLabel } from '@/functions/src/shared/dates';
import { AGREEMENT_COPY as A, type AgreementData, type AgreementLine } from '@/functions/src/shared/rentalAgreement';

// "Rental agreement" — step 4 of the Pick-up (app/admin/pickup.tsx). The client reads the
// agreement and signs on the full-screen view (or staff photograph the signed paper
// form). Nothing is uploaded here: the parent keeps the capture and, on "Confirm
// pick-up", uploads the PDF (uploadAgreement) then calls submitHandover, which records
// it in the same transaction as the pick-up. One agreement per pick-up.

/** What the parent keeps until "Confirm pick-up": the capture + the exact data signed. */
export interface SignedAgreement { capture: AgreementCapture; data: AgreementData; terms: string; label: string }

export function AgreementSection({ reservations, handover, renterOverride, ready, signed, onSigned }: {
  reservations: RentalDoc[];
  /** Condition, deposit received and payment — what the client signs for. */
  handover: HandoverInfo;
  /** ID checked during this pick-up: shown as checked today. */
  renterOverride?: { idType: string | null; idCheckedToday: boolean };
  ready: boolean;
  signed: SignedAgreement | null;
  onSigned: (s: SignedAgreement | null) => void;
}) {
  const shop = useShopInfo();
  const [open, setOpen] = useState(false);
  const [paperAsk, setPaperAsk] = useState(false);
  const [paperPhotos, setPaperPhotos] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<{ data: AgreementData; terms: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The agreement data (renter contact, ID type + date, items, payment).
  const prepare = useCallback(async () => {
    const first = reservations[0];
    const [renter, terms] = await Promise.all([loadRenterBlock(first.renterId, first.renterName ?? null), termsForAnnex(shop)]);
    if (renterOverride?.idCheckedToday) {
      renter.idType = renterOverride.idType ?? renter.idType;
      renter.idCheckedAtLabel = vteDay(Date.now());
    }
    const data = buildAgreementData({ agreementId: agreementIdFor(reservations), reservations, shop, renter, handover });
    return { data, terms };
  }, [reservations, shop, handover, renterOverride]);

  const startSigning = async () => {
    setError(null);
    setPrepared(null);
    setOpen(true);
    try {
      setPrepared(await prepare());
    } catch (e) {
      setOpen(false);
      setError((e as Error)?.message || c.errors.generic);
    }
  };

  const keepPaper = async () => {
    if (paperPhotos.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await prepare();
      onSigned({ capture: { method: 'paper', photoUris: paperPhotos }, data: p.data, terms: p.terms, label: c.signedPaper(vteReservationLabel(Date.now())) });
      setPaperAsk(false);
      setPaperPhotos([]);
    } catch (e) {
      setError((e as Error)?.message || c.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
        <Text style={UI.title}>{c.section}</Text>
        {signed ? (
          <>
            <CheckLine text={signed.label} />
            <TouchableOpacity onPress={() => { onSigned(null); startSigning(); }} hitSlop={8} disabled={!ready}>
              <Text style={[UI.link, !ready && { opacity: 0.4 }]}>{c.signAgain}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={UI.body}>{ready ? c.intro : c.notReady}</Text>
            <PressScale style={[UI.btnPrimary, !ready && UI.btnDisabled]} disabled={!ready} onPress={startSigning}>
              <Feather name="edit-3" size={17} color={SHADES.carbon} />
              <Text style={UI.btnPrimaryText}>{c.review}</Text>
            </PressScale>
            <TouchableOpacity onPress={() => setPaperAsk(true)} hitSlop={8} disabled={!ready} style={{ alignSelf: 'center' }}>
              <Text style={[UI.link, !ready && { opacity: 0.4 }]}>{c.paper}</Text>
            </TouchableOpacity>
          </>
        )}
        {paperAsk && (
          <ConfirmBox
            text={c.paperAsk}
            confirmLabel={busy ? c.saving : c.paperSave}
            confirmDisabled={paperPhotos.length === 0 || busy}
            onCancel={() => { setPaperAsk(false); setPaperPhotos([]); }}
            onConfirm={keepPaper}
          >
            <View style={s.photos}>
              {paperPhotos.map(uri => <Image key={uri} source={{ uri }} style={s.photo} />)}
              <PressScale accessibilityRole="button" accessibilityLabel="Take a photo" style={s.addPhoto} onPress={async () => { const u = await pickIdPhoto('camera'); if (u) setPaperPhotos(p => [...p, u].slice(0, 6)); }}>
                <Feather name="camera" size={18} color={SHADES.carbon} />
              </PressScale>
            </View>
            {paperPhotos.length > 0 && <Text style={UI.small}>{c.paperPages(paperPhotos.length)}</Text>}
          </ConfirmBox>
        )}
        {!!error && <Text style={UI.errorText}>{error}</Text>}
      </View>

      <SignModal
        visible={open}
        prepared={prepared}
        onClose={() => setOpen(false)}
        onConfirm={async sig => {
          if (!prepared) return;
          onSigned({ capture: { method: 'signature', signature: sig }, data: prepared.data, terms: prepared.terms, label: c.signed(vteReservationLabel(Date.now())) });
          setOpen(false);
        }}
      />
    </View>
  );
}

// ── Full-screen signing view ─────────────────────────────────────────────────

function SignModal({ visible, prepared, onClose, onConfirm }: {
  visible: boolean;
  prepared: { data: AgreementData } | null;
  onClose: () => void;
  onConfirm: (sig: Signature) => Promise<void>;
}) {
  const screen = useScreenInsets();
  const reduce = useReducedMotion();
  const [sig, setSig] = useState<Signature | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConfirm = !!sig && inkLength(sig.strokes) > 40 && !!prepared && !busy;

  const reset = () => { setSig(null); setPadKey(k => k + 1); setError(null); };
  const confirm = async () => {
    if (!sig || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(sig);
      reset();
    } catch (e) {
      setError((e as Error)?.message || c.errors.generic);
    } finally {
      setBusy(false);
    }
  };
  const d = prepared?.data;

  return (
    <Modal visible={visible} animationType={reduce ? 'none' : 'slide'} onRequestClose={busy ? () => {} : onClose} statusBarTranslucent>
      <View style={[s.modal, { paddingTop: screen.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel={c.close}>
            <Feather name="x" size={22} color={SHADES.carbon} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{c.title}</Text>
        </View>

        {!d ? (
          <View style={s.center}><ActivityIndicator color={SHADES.amber} /><Text style={[UI.small, { marginTop: 10 }]}>{c.loading}</Text></View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.doc}>
            <Text style={s.order}>{`Order ${d.orderLabel}`}</Text>
            <Text style={UI.body}>{A.intro}</Text>
            <Block title={A.renter} lines={[
              d.renter.name, d.renter.phone, d.renter.email,
              d.renter.idType && d.renter.idCheckedAtLabel ? A.idChecked(d.renter.idType, d.renter.idCheckedAtLabel) : A.idNotChecked,
            ]} />
            {d.lines.map(l => (
              <Block key={l.reservationId} title={`${l.productName} ${A.qty(l.quantity)}`} lines={[
                `${A.from}: ${l.pickupLabel}`, `${A.to}: ${l.returnLabel}`,
                `${A.rental}: ${A.rentalDays(l.durationDays, l.pricePerDay.toLocaleString('en-US'))} = ${l.subtotal.toLocaleString('en-US')} LAK`,
                l.couponDiscount > 0 ? `${l.discountLabel ?? A.coupon}: −${l.couponDiscount.toLocaleString('en-US')} LAK` : null,
                l.couponDiscount > 0 ? `${A.rentalTotal}: ${l.total.toLocaleString('en-US')} LAK` : null,
                `${A.deposit}: ${l.deposit.toLocaleString('en-US')} LAK (${A.depositDetail(l.quantity, l.depositPerUnit.toLocaleString('en-US'))})`,
                l.depositReceived ? `${A.depositReceived}: ${fmtDepositReceived(l.depositReceived, l.deposit)}` : null,
                ...(l.checklist ? [] : [`${A.condition}:`, l.photoCount != null ? A.photos(l.photoCount) : null, ...l.condition]),
              ]}>
                {l.checklist && <ConditionDetail line={l} />}
              </Block>
            ))}
            <Block title={A.totals} lines={[
              d.paymentMethod ? A.paidAtPickup(d.rentalTotal.toLocaleString('en-US'), d.paymentMethod) : A.toPayAtPickup(d.rentalTotal.toLocaleString('en-US')),
              `${A.totalDeposit}: ${d.depositTotal.toLocaleString('en-US')} LAK`,
              d.depositReceivedTotal
                ? `${A.depositReceived}: ${fmtDepositReceived(d.depositReceivedTotal, d.depositTotal)}${d.depositPaymentMethod ? ` · ${d.depositPaymentMethod}` : ''}`
                : null,
            ]} />
            <Block title={A.rules} lines={[...A.keyRules]} bullets />
            <Text style={[UI.small, { marginTop: 10 }]}>{A.terms(d.termsEffectiveDate)}</Text>
            <Text style={s.accept}>{A.accept}</Text>
          </ScrollView>
        )}

        {/* Fixed signing panel — the pad is never inside the ScrollView. */}
        <View style={[s.panel, { paddingBottom: screen.bottom + 12 }]}>
          <Text style={UI.title}>{c.signHere}</Text>
          <Text style={[UI.small, { marginBottom: 8 }]}>{c.signHint}</Text>
          <SignaturePad key={padKey} height={170} onChange={setSig} />
          {!!error && <Text style={[UI.errorText, { marginTop: 6 }]}>{error}</Text>}
          <View style={s.actions}>
            <PressScale style={[UI.btnSecondary, s.actionBtn]} onPress={reset} disabled={busy}>
              <Text style={UI.btnSecondaryText}>{c.clear}</Text>
            </PressScale>
            <PressScale style={[UI.btnPrimary, s.actionBtn, !canConfirm && UI.btnDisabled]} onPress={confirm} disabled={!canConfirm}>
              {busy ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.confirm}</Text>}
            </PressScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Block({ title, lines, bullets, children }: { title: string; lines: (string | null)[]; bullets?: boolean; children?: React.ReactNode }) {
  return (
    <View style={[UI.card, s.block]}>
      <Text style={UI.title}>{title}</Text>
      {lines.filter((l): l is string => !!l).map((l, i) => (
        <Text key={i} style={s.blockLine}>{bullets ? `•  ${l}` : l}</Text>
      ))}
      {children}
    </View>
  );
}

// Condition at pick-up (template .6): defects first (highlighted), every point with its
// state + note, the accessories handed over, the photos — what the client signs for.
function ConditionDetail({ line: l }: { line: AgreementLine }) {
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      <Text style={s.subTitle}>{A.condition}</Text>
      {l.defects?.length ? (
        <View style={s.defects}>
          <Text style={s.subTitle}>{A.defectsTitle}</Text>
          {l.defects.map(d => <Text key={d} style={s.blockLine}>{d}</Text>)}
          <Text style={UI.small}>{A.defectsNote}</Text>
        </View>
      ) : <Text style={s.blockLine}>{A.allGood}</Text>}
      <Text style={s.subTitle}>{A.checklistTitle}</Text>
      {(l.checklist ?? []).map(c => (
        <View key={c.label} style={s.ckRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.blockLine}>{c.label}</Text>
            {!!c.note && <Text style={UI.small}>{c.note}</Text>}
          </View>
          <Text style={[s.ckState, c.rating !== 'Good' && { color: SHADES.amberText }]}>{c.rating}</Text>
        </View>
      ))}
      <Text style={s.subTitle}>{A.accessoriesTitle}</Text>
      {l.accessories?.length
        ? l.accessories.map(a => (
          <Text key={a.name} style={s.blockLine}>{`•  ${a.qty} × ${a.name}${a.handedOver ? '' : ` (${A.notHandedOver})`}`}</Text>
        ))
        : <Text style={s.blockLine}>{A.noAccessories}</Text>}
      {!!l.photos?.length && (
        <>
          <Text style={s.subTitle}>{A.photosTitle}</Text>
          <View style={s.thumbs}>
            {l.photos.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  photo: { width: 56, height: 72, borderRadius: 8, backgroundColor: SHADES.carbonLight },
  addPhoto: {
    width: 56, height: 72, borderRadius: 8, borderWidth: 1, borderColor: SHADES.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: SHADES.white,
  },
  modal: { flex: 1, backgroundColor: SHADES.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: SHADES.carbon },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doc: { padding: 16, gap: 10, paddingBottom: 24 },
  order: { fontSize: 13, fontWeight: '600', color: SHADES.carbonMuted },
  block: { padding: 14, gap: 3 },
  blockLine: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  subTitle: { fontSize: 13, fontWeight: '700', color: SHADES.carbon, marginTop: 4 },
  defects: { backgroundColor: SHADES.amberLight, borderRadius: 10, padding: 10, gap: 2, borderWidth: 1, borderColor: SHADES.amber },
  ckRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ckState: { fontSize: 13, fontWeight: '700', color: SHADES.carbon },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: SHADES.carbonLight },
  accept: { fontSize: 15, fontWeight: '800', color: SHADES.carbon, marginTop: 10 },
  panel: {
    backgroundColor: SHADES.white, borderTopWidth: 0.5, borderTopColor: SHADES.border,
    paddingHorizontal: 16, paddingTop: 12,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { flex: 1 },
});
