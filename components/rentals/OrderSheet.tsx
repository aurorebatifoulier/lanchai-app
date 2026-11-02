import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { RENTALS_COPY as c } from '@/constants/rentalsCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { QRThumb } from '@/components/QRThumb';
import { ConfirmBox } from '@/components/ConfirmBox';
import { displayOrderId } from '@/utils/rentalDocs';
import type { RentalDoc } from '@/lib/firestore';
import { type RentalEntry, isPrePickup, isCancelledLike, tabOf, lak, orderTotal } from '@/lib/rentalsList';
import { useMyRatings, PastItemActions, RatedLine, RentalThumb } from '@/components/rentals/RentalCards';

// "Your order" sheet — a multi-item card's tap: the order QR (while something is still
// to pick up / return), one row per item → its rental detail, and "Cancel order" for the
// lines not picked up yet (free cancellation, ConfirmBox). The backdrop is a SIBLING of
// the sheet so the item list scrolls. Past items (returned / not returned) get the same
// "Rent again" / "Review · +N pts" / "★ You rated it n" as a single past card.
const isPastItem = (r: RentalDoc) => tabOf(r) === 'past' && !isCancelledLike(r);

export function OrderSheet({ entry, onClose, onOpenQR, onCancel, reviewPoints }: {
  entry: RentalEntry | null;
  onClose: () => void;
  onOpenQR: (value: string, label: string) => void;
  onCancel: (items: RentalDoc[]) => Promise<void>;
  /** Review reward points (null = loyalty excluded → plain "Review"). */
  reviewPoints: number | null;
}) {
  const router = useRouter();
  const screen = useScreenInsets();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ratings = useMyRatings(entry ? entry.items.filter(isPastItem) : []);

  const close = () => { setAsking(false); setError(false); onClose(); };
  if (!entry) return null;

  const { items } = entry;
  const first = items[0];
  const lnc = displayOrderId(first); // LNC-… or null — never the raw Firestore id
  const now = Date.now();
  const cancellable = items.filter(r => isPrePickup(r) && r.pickupAt.toMillis() > now);
  const showQr = !!entry.orderId && items.some(r => isPrePickup(r) || r.status === 'active');
  const qr = `LANCHAI-ORDER:${entry.orderId}`;

  const doCancel = async () => {
    setBusy(true); setError(false);
    try {
      await onCancel(cancellable);
      close();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[s.sheet, { paddingBottom: screen.bottom + 16 }]}>
          <View style={s.handle} />
          <Text style={s.title}>{c.yourOrder}</Text>
          <Text style={UI.subtitle}>{[lnc ? c.orderLabel(lnc) : null, c.items(items.length), lak(orderTotal(items))].filter(Boolean).join(' · ')}</Text>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingTop: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
            {showQr && (
              <View style={[UI.card, s.qrRow]}>
                <Text style={[UI.body, { flex: 1 }]}>{c.showQr}</Text>
                <QRThumb value={qr} size={64} variant="order" onPress={() => { close(); onOpenQR(qr, lnc ? c.orderLabel(lnc) : c.items(items.length)); }} />
              </View>
            )}
            {items.map(r => {
              const rating = ratings.get(r.id);
              return (
                <PressScale key={r.id} style={[UI.card, s.item]} onPress={() => { close(); router.push(`/rentals/${r.id}`); }}>
                  <View style={s.itemRow}>
                    <RentalThumb rental={r} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={UI.title} numberOfLines={1}>{r.productName}</Text>
                      <Text style={UI.subtitle} numberOfLines={1}>{`${r.pickupLabel} → ${r.returnLabel}`}</Text>
                      {isPastItem(r) && rating != null && <RatedLine rating={rating} />}
                    </View>
                    <Feather name="chevron-right" size={18} color={SHADES.carbonFaint} />
                  </View>
                  {isPastItem(r) && <PastItemActions rental={r} rating={rating} reviewPoints={reviewPoints} onNavigate={close} />}
                </PressScale>
              );
            })}
            {cancellable.length > 0 && (
              asking ? (
                <ConfirmBox
                  text={c.cancelAsk}
                  confirmLabel={c.cancelConfirm}
                  confirmDisabled={busy}
                  destructive
                  onCancel={() => setAsking(false)}
                  onConfirm={doCancel}
                >
                  {/* Only the lines that are still cancellable (booked, pick-up ahead). */}
                  <Text style={[UI.small, { marginTop: 6 }]}>{c.cancelList}</Text>
                  {cancellable.map(r => (
                    <Text key={r.id} style={UI.small} numberOfLines={1}>{`• ${r.productName}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`}</Text>
                  ))}
                </ConfirmBox>
              ) : (
                <PressScale style={[UI.btnDestructive, { marginTop: 4 }]} onPress={() => setAsking(true)}>
                  <Text style={UI.dangerText}>{c.cancelOrder(cancellable.length)}</Text>
                </PressScale>
              )
            )}
            {busy && <ActivityIndicator color={SHADES.amber} />}
            {error && <Text style={UI.errorText}>{c.cancelError}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  item: { padding: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
