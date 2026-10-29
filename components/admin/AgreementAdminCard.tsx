import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { AGREEMENT_UI as c } from '@/constants/agreementCopy';
import { UI, CheckLine } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { useShopInfo } from '@/lib/shop';
import { getReservationsByOrderId, type RentalDoc } from '@/lib/firestore';
import {
  agreementIdFor, buildAgreementData, getAgreement, getAgreementStaff, loadRenterBlock, openAgreementPdf,
  printBlankAgreement, termsForAnnex, type AgreementDoc,
} from '@/lib/rentalAgreement';
import { displayOrderId } from '@/utils/rentalDocs';
import { vteReservationLabel } from '@/functions/src/shared/dates';

// Admin reservation detail — rental agreement status (signed / paper, when, who
// recorded it, email sent), "Open PDF", and "Print agreement" (blank printable version
// of the items not handed over yet, for the paper fallback). Staff names: admin only.

const PRE_PICKUP = ['pending_payment', 'confirmed'];

export function AgreementAdminCard({ reservation }: { reservation: RentalDoc }) {
  const shop = useShopInfo();
  const [agreement, setAgreement] = useState<AgreementDoc | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [busy, setBusy] = useState<'open' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = reservation.agreementId;
  const orderLabel = displayOrderId(reservation) ?? reservation.orderId ?? reservation.id;

  useEffect(() => {
    if (!id) return;
    getAgreement(id).then(setAgreement).catch(() => setAgreement(null));
    getAgreementStaff(id).then(setStaff).catch(() => setStaff(null));
  }, [id]);

  const open = async () => {
    if (!id) return;
    setBusy('open'); setError(null);
    const r = await openAgreementPdf(id, orderLabel);
    if (r !== 'ok') setError(r === 'unavailable' ? c.errors.share : c.errors.open);
    setBusy(null);
  };

  // Blank version: this order's items still to hand over (or just this one).
  const print = async () => {
    setBusy('print'); setError(null);
    try {
      const all = reservation.orderId ? await getReservationsByOrderId(reservation.orderId) : [reservation];
      const pending = all.filter(r => PRE_PICKUP.includes(r.status));
      const items = pending.length > 0 ? pending : [reservation];
      const [renter, terms] = await Promise.all([loadRenterBlock(reservation.renterId, reservation.renterName ?? null), termsForAnnex(shop)]);
      const data = buildAgreementData({ agreementId: agreementIdFor(items), reservations: items, shop, renter, conditions: {} });
      await printBlankAgreement(data, terms);
    } catch {
      setError(c.errors.generic);
    }
    setBusy(null);
  };

  const when = reservation.agreementSignedAt?.toMillis ? vteReservationLabel(reservation.agreementSignedAt.toMillis()) : '';

  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>{c.adminTitle}</Text>
      {id ? (
        <>
          <CheckLine text={reservation.agreementMethod === 'paper' ? c.signedPaper(when) : c.signed(when)} />
          {!!staff && <Text style={UI.small}>{c.adminBy(staff)}</Text>}
          {agreement && <Text style={UI.small}>{agreement.emailSentAt ? c.adminEmailed : c.adminNotEmailed}</Text>}
        </>
      ) : (
        <Text style={UI.body}>{c.adminNone}</Text>
      )}
      <View style={s.row}>
        {id && (
          <PressScale style={[UI.btnSecondary, s.btn]} onPress={open} disabled={!!busy}>
            {busy === 'open' ? <ActivityIndicator size="small" color={SHADES.carbon} /> : (
              <><Feather name="file-text" size={15} color={SHADES.carbon} /><Text style={UI.btnSecondaryText}>{c.open}</Text></>
            )}
          </PressScale>
        )}
        {PRE_PICKUP.includes(reservation.status) && (
          <PressScale style={[UI.btnSecondary, s.btn]} onPress={print} disabled={!!busy}>
            {busy === 'print' ? <ActivityIndicator size="small" color={SHADES.carbon} /> : (
              <><Feather name="printer" size={15} color={SHADES.carbon} /><Text style={UI.btnSecondaryText}>{c.print}</Text></>
            )}
          </PressScale>
        )}
      </View>
      {!!error && <Text style={UI.errorText}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, flexDirection: 'row', gap: 6 },
});
