import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import type { RentalDoc } from '@/lib/firestore';
import { formatLakAmount } from '@/utils/currency';
import { deriveReceiptData } from '@/utils/receiptData';
import { downloadReceipt } from '@/lib/receiptPdf';
import { BillingSummary } from './BillingSummary';
import { SettlementSummary } from './SettlementSummary';

// End-of-service settlement receipt for a completed rental — pure aggregation of
// already-persisted figures (rental fee, deposit, damage/late charges, settlement
// outcome), no new financial computation. Shared by the customer route
// (app/rentals/[id]/receipt.tsx) and the admin reservation detail screen, so both
// audiences see identical figures, identical for BtoB/BtoC (no customerType branching
// anywhere in this component, matching the booking Summary screens' convention).
export interface RentalReceiptProps {
  rental: RentalDoc;
  vatPercent: number | null;
}

export function RentalReceipt({ rental, vatPercent }: RentalReceiptProps) {
  const {
    vatPct, vatHt, vatAmount,
    depositHeldAmount, depositCurrency, depositAppliedToCharge, outstandingBalance,
    netInLak, chargesTotal,
  } = deriveReceiptData(rental, vatPercent);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const result = await downloadReceipt(rental, vatPercent);
    if (!result.ok) {
      setDownloadError(
        result.reason === 'unavailable'
          ? 'Sharing isn’t available on this device.'
          : 'Couldn’t generate the receipt. Please try again.',
      );
    }
    setDownloading(false);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.sectionLabel}>Rental fee</Text>
      <View style={s.card}>
        <BillingSummary
          subtotalHt={vatHt}
          vatAmount={vatAmount}
          vatPct={vatPct}
          total={rental.total}
          totalLabel="Rental fee paid"
        />
      </View>

      <Text style={s.sectionLabel}>Deposit &amp; charges</Text>
      <SettlementSummary
        chargeAmount={rental.chargeAmount}
        chargeReason={rental.chargeReason}
        lateChargeAmount={rental.lateChargeAmount}
        lateChargeReason={rental.lateChargeReason}
        depositAmount={depositHeldAmount}
        depositCurrency={depositCurrency}
        depositAppliedToCharge={depositAppliedToCharge}
        outstandingBalance={outstandingBalance}
        outstandingSettled={rental.outstandingSettled}
        outstandingSettledBy={rental.outstandingSettledBy}
        outstandingWrittenOff={rental.outstandingWrittenOff}
        outstandingWrittenOffBy={rental.outstandingWrittenOffBy}
      />

      <Text style={s.sectionLabel}>Total</Text>
      <View style={s.netCard}>
        {netInLak != null ? (
          <View style={s.netRow}>
            <Text style={s.netLabel}>Total paid</Text>
            <Text style={s.netValue}>{formatLakAmount(netInLak)}</Text>
          </View>
        ) : (
          <>
            <View style={s.netRow}>
              <Text style={s.netLabel}>Rental fee paid</Text>
              <Text style={s.netValue}>{formatLakAmount(rental.total)}</Text>
            </View>
            {chargesTotal > 0 && (
              <Text style={s.netNote}>
                + {chargesTotal.toLocaleString('en-US')} {depositCurrency} in charges (see above)
              </Text>
            )}
          </>
        )}
      </View>

      <TouchableOpacity
        style={[s.downloadBtn, downloading && s.downloadBtnDisabled]}
        onPress={handleDownload}
        activeOpacity={0.85}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator color={COLORS.carbon} size="small" />
        ) : (
          <>
            <Feather name="download" size={16} color={COLORS.carbon} />
            <Text style={s.downloadBtnText}>Download / share receipt</Text>
          </>
        )}
      </TouchableOpacity>
      {downloadError && <Text style={s.downloadError}>{downloadError}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 8,
    marginTop: 12,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
  },
  netCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    gap: 4,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: { fontSize: 15, fontWeight: '700', color: COLORS.carbon },
  netValue: { fontSize: 22, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.4 },
  netNote: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    marginTop: 14,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  downloadError: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 8,
  },
});
