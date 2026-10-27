import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { IconCircle, useScreenInsets } from '@/components/account/ui';
import { getReservationById, type RentalDoc } from '@/lib/firestore';
import { useVatPercent } from '@/lib/exchangeRate';
import { RentalReceipt } from '@/components/RentalReceipt';
import { displayOrderId, fmtDay } from '@/utils/rentalDocs';

export default function RentalReceiptScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vatPercent = useVatPercent();

  const [rental,  setRental]  = useState<RentalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!id) return;
    getReservationById(id)
      .then(r => { setRental(r); if (!r) setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const notReady = !loading && !error && rental
    && !(rental.status === 'returned' && rental.returnFinalizedAt);

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Receipt</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : error || !rental ? (
        <View style={s.errorBox}>
          <IconCircle icon={{ name: 'alert-circle' }} size={56} />
          <Text style={s.errorText}>Receipt not found.</Text>
        </View>
      ) : notReady ? (
        <View style={s.errorBox}>
          <IconCircle icon={{ name: 'clock' }} size={56} />
          <Text style={s.errorText}>The receipt isn&apos;t ready yet — it&apos;s available once the return is complete and the deposit settled.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: screen.contentBottom }]}
        >
          <Text style={s.productName} numberOfLines={2}>
            {rental.quantity > 1 ? `${rental.productName} × ${rental.quantity}` : rental.productName}
          </Text>
          <Text style={s.refId}>
            {[displayOrderId(rental) ? `Order ${displayOrderId(rental)}` : null, `Returned ${fmtDay(rental.returnedAt ?? rental.returnAt)}`]
              .filter(Boolean).join(' · ')}
          </Text>
          <RentalReceipt rental={rental} vatPercent={vatPercent} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  productName: { fontSize: 22, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.4, marginBottom: 4 },
  refId: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 4, lineHeight: 18 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  errorText: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20 },
});
