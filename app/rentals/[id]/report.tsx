import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { IconCircle, useScreenInsets } from '@/components/account/ui';
import { ChecklistSummary } from '@/components/ChecklistSummary';
import { getReservationById, type RentalDoc } from '@/lib/firestore';
import { displayOrderId, fmtDay } from '@/utils/rentalDocs';

// Read-only condition report (pick-up or return checklist) for the renter — opened from
// the Receipts & reports / All rentals cards. Renter mode: no staff or typed names.
export default function RentalReportScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const isReturn = type === 'return';

  const [rental, setRental] = useState<RentalDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getReservationById(id).then(setRental).catch(() => setRental(null)).finally(() => setLoading(false));
  }, [id]);

  const checklist = isReturn ? rental?.returnChecklist : rental?.handoverChecklist;
  const orderId = rental ? displayOrderId(rental) : null;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{isReturn ? 'Return report' : 'Pick-up report'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      ) : !rental || !checklist?.confirmedAt ? (
        <View style={s.emptyBox}>
          <IconCircle icon={{ name: 'clipboard' }} size={56} />
          <Text style={s.emptyText}>This report isn&apos;t available yet.</Text>
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
          <Text style={s.meta}>
            {[orderId ? `Order ${orderId}` : null, `${isReturn ? 'Returned' : 'Picked up'} ${fmtDay(checklist.confirmedAt)}`]
              .filter(Boolean).join(' · ')}
          </Text>
          <ChecklistSummary
            checklist={checklist}
            title={isReturn ? 'Return checklist' : 'Pick-up checklist'}
            audience="renter"
            defaultOpen
          />
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
  meta: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 16 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20 },
});
