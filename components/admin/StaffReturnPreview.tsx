import React from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import { Text } from '@/components/AppText';
import UnitsStepper from '@/components/UnitsStepper';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import type { ReturnCharges, ChargeCurrency } from '@/functions/src/shared/returnCharges';
import type { ReturnResult } from '@/lib/staffOps';

// Staff return (admin roles): what will happen, READ-ONLY — the same shared
// computeReturnCharges as the submitReturn callable, which decides the final figures.
// Staff can't lower or waive anything; damage goes to an owner (deposit held).

const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('en-US')} ${cur}`;

export function StaffReturnPreview({ charges, currency, deposit, quantity, units, onUnits, collected, onCollected }: {
  charges: ReturnCharges;
  currency: ChargeCurrency;
  deposit: number;
  quantity: number;
  units: number;
  onUnits: (n: number) => void;
  collected: boolean;
  onCollected: (v: boolean) => void;
}) {
  const damage = charges.outcome === 'damage';
  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>At the counter</Text>
      {damage ? (
        <>
          {quantity > 1 && (
            <UnitsStepper label={charges.worst === 'unusable' ? 'Units unusable' : 'Units damaged'}
              value={units} max={quantity} onChange={onUnits} />
          )}
          <Text style={UI.body}>
            {`Damage recorded. Keep the deposit (${fmt(deposit, currency)}) — an owner decides the charge and is told as soon as you confirm.`}
          </Text>
          {!!charges.lateAmount && <Text style={UI.small}>{`Late fee: ${fmt(charges.lateAmount, currency)}`}</Text>}
        </>
      ) : charges.unresolved ? (
        <Text style={UI.body}>A charge can’t be calculated (exchange rate missing). Keep the deposit — an owner will settle it.</Text>
      ) : charges.lateAmount ? (
        <>
          <Text style={UI.body}>{`Late fee (set by the shop rules): ${fmt(charges.lateAmount, currency)}`}</Text>
          {charges.outstanding > 0 ? (
            <>
              <Text style={s.big}>{`Collect ${fmt(charges.outstanding, currency)}`}</Text>
              <Text style={UI.small}>The fee is more than the deposit. The whole deposit is used.</Text>
              <View style={s.switchRow}>
                <Text style={[UI.body, s.flex]}>The renter paid this balance</Text>
                <Switch value={collected} onValueChange={onCollected}
                  trackColor={{ false: COLORS.softGray200, true: COLORS.amber }} thumbColor={COLORS.white} />
              </View>
              {!collected && <Text style={UI.small}>Not paid now? Leave it off — an owner follows up.</Text>}
            </>
          ) : (
            <Text style={s.big}>{`Give back ${fmt(charges.refund, currency)}`}</Text>
          )}
        </>
      ) : (
        <Text style={s.big}>{`Give back the full deposit: ${fmt(deposit, currency)}`}</Text>
      )}
      <Text style={UI.small}>Fees can only be changed by an owner.</Text>
    </View>
  );
}

/** After submitReturn: what staff do now. */
export function staffReturnMessage(r: ReturnResult): { title: string; body: string } {
  const cur = r.currency;
  switch (r.outcome) {
    case 'clean':
      return { title: 'Return complete', body: `Give back the full deposit: ${fmt(r.refund, cur)}.` };
    case 'late':
      return r.outstanding > 0
        ? { title: 'Return complete', body: r.settled ? `Balance of ${fmt(r.outstanding, cur)} collected.` : `Balance of ${fmt(r.outstanding, cur)} still due — an owner will follow up.` }
        : { title: 'Return complete', body: `Late fee taken from the deposit. Give back ${fmt(r.refund, cur)}.` };
    default:
      return { title: 'Return recorded', body: 'Keep the deposit. The owners have been told and will decide the charge.' };
  }
}

const s = StyleSheet.create({
  card: { gap: 8, marginTop: 12 },
  big: { fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
});
