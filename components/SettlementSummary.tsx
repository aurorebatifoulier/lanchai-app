import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

// Reservation-level, not tied to any single checklist — works identically for a normal
// return AND for a 'lost' reservation (which has no returnChecklist at all). Damage
// charge and late-return penalty are always rendered as fully separate line items; they
// only combine into the deposit-applied/outstanding math shown at the bottom.
export interface SettlementSummaryProps {
  chargeAmount?: number;
  chargeReason?: string;
  lateChargeAmount?: number;
  lateChargeReason?: string;
  depositAmount: number;
  depositCurrency: 'LAK' | 'USD' | 'THB';
  depositAppliedToCharge: number;
  outstandingBalance: number;
  outstandingSettled?: boolean;
  outstandingSettledBy?: string;
  // Second, parallel resolution path — balance confirmed uncollectible rather than
  // actually collected. Takes precedence over outstandingSettled if somehow both were set.
  outstandingWrittenOff?: boolean;
  outstandingWrittenOffBy?: string;
}

export function SettlementSummary({
  chargeAmount,
  chargeReason,
  lateChargeAmount,
  lateChargeReason,
  depositAmount,
  depositCurrency,
  depositAppliedToCharge,
  outstandingBalance,
  outstandingSettled,
  outstandingSettledBy,
  outstandingWrittenOff,
  outstandingWrittenOffBy,
}: SettlementSummaryProps) {
  const fmt = (n: number) => `${n.toLocaleString('en-US')} ${depositCurrency}`;
  // Non-zero only when the deposit more than covers both charges combined.
  const amountOwedToClient = Math.max(0, depositAmount - depositAppliedToCharge);
  const resolution: 'writtenOff' | 'settled' | 'unsettled' = outstandingWrittenOff
    ? 'writtenOff'
    : outstandingSettled
    ? 'settled'
    : 'unsettled';

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Settlement summary</Text>

      {chargeAmount != null && (
        <View style={s.lineBlock}>
          <View style={s.lineRow}>
            <Text style={s.lineLabel}>Damage/condition charge</Text>
            <Text style={s.lineAmount}>{fmt(chargeAmount)}</Text>
          </View>
          {!!chargeReason && <Text style={s.lineReason}>{chargeReason}</Text>}
        </View>
      )}

      {lateChargeAmount != null && (
        <View style={s.lineBlock}>
          <View style={s.lineRow}>
            <Text style={s.lineLabel}>Late return penalty</Text>
            <Text style={s.lineAmount}>{fmt(lateChargeAmount)}</Text>
          </View>
          {!!lateChargeReason && <Text style={s.lineReason}>{lateChargeReason}</Text>}
        </View>
      )}

      <View style={s.divider} />

      <View style={s.lineRow}>
        <Text style={s.lineLabelMuted}>Deposit held</Text>
        <Text style={s.lineAmountMuted}>{fmt(depositAmount)}</Text>
      </View>

      <View style={s.divider} />

      {outstandingBalance > 0 ? (
        <>
          <View style={s.lineRow}>
            <Text style={s.netLabel}>Client owes</Text>
            <Text style={[s.netAmount, { color: COLORS.danger }]}>{fmt(outstandingBalance)}</Text>
          </View>
          <View style={[
            s.settledBadge,
            resolution === 'settled' && s.settledBadgeDone,
            resolution === 'writtenOff' && s.settledBadgeWrittenOff,
          ]}>
            <Feather
              name={resolution === 'settled' ? 'check-circle' : resolution === 'writtenOff' ? 'slash' : 'alert-circle'}
              size={12}
              color={resolution === 'settled' ? '#065F46' : resolution === 'writtenOff' ? COLORS.fg3 : COLORS.white}
            />
            <Text style={[
              s.settledBadgeText,
              resolution === 'settled' && s.settledBadgeTextDone,
              resolution === 'writtenOff' && s.settledBadgeTextWrittenOff,
            ]}>
              {resolution === 'settled'
                ? `Settled${outstandingSettledBy ? ` by ${outstandingSettledBy}` : ''}`
                : resolution === 'writtenOff'
                ? `Written off${outstandingWrittenOffBy ? ` by ${outstandingWrittenOffBy}` : ''}`
                : 'Not yet settled'}
            </Text>
          </View>
        </>
      ) : amountOwedToClient > 0 ? (
        <View style={s.lineRow}>
          <Text style={s.netLabel}>Owed to client</Text>
          <Text style={[s.netAmount, { color: COLORS.success }]}>{fmt(amountOwedToClient)}</Text>
        </View>
      ) : (
        <View style={s.lineRow}>
          <Text style={s.netLabel}>Fully settled — nothing owed</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 4,
  },
  lineBlock: { gap: 2 },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineLabel: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  lineAmount: { fontSize: 13, fontWeight: '700', color: COLORS.danger },
  lineReason: { fontSize: 12, fontWeight: '400', color: COLORS.fg3 },
  lineLabelMuted: { fontSize: 13, fontWeight: '500', color: COLORS.fg3 },
  lineAmountMuted: { fontSize: 13, fontWeight: '600', color: COLORS.fg3 },
  divider: { height: 1, backgroundColor: COLORS.softGray200, marginVertical: 2 },
  netLabel: { fontSize: 14, fontWeight: '800', color: COLORS.carbon },
  netAmount: { fontSize: 16, fontWeight: '800' },
  settledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  settledBadgeDone: { backgroundColor: '#D1FAE5' },
  settledBadgeWrittenOff: { backgroundColor: COLORS.softGray200 },
  settledBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  settledBadgeTextDone: { color: '#065F46' },
  settledBadgeTextWrittenOff: { color: COLORS.fg3 },
});
