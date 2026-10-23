import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { IdUploadPanel } from '@/components/IdUploadPanel';

// Shown when a renter without an ID document taps "Confirm booking" (single booking and
// bag checkout). The booking screen stays mounted underneath, so the selection is kept:
// onUploaded / onAtCounter resume the same confirmation. After a rejection only a new
// document unblocks bookings (createReservations returns id-rejected otherwise).
export function IdRequirementStep({
  visible, rejected, onUploaded, onAtCounter, onClose,
}: {
  visible: boolean;
  rejected: boolean;
  onUploaded: () => void;
  onAtCounter: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const close = () => { setUploading(false); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.headerRow}>
            <Text style={s.title}>{rejected ? 'Please add a new ID' : 'One last step: your ID'}</Text>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <Feather name="x" size={20} color={COLORS.fg2} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.body}>
              {rejected
                ? 'Your previous ID document was declined. Add a new one to confirm this booking.'
                : 'An ID document (passport or ID card) is needed to rent. Add it now, or show it at the shop when you pick up.'}
            </Text>
            {uploading || rejected ? (
              <IdUploadPanel
                submitLabel="Save and confirm booking"
                onDone={() => { setUploading(false); onUploaded(); }}
              />
            ) : (
              <>
                <TouchableOpacity style={s.primary} onPress={() => setUploading(true)} activeOpacity={0.85}>
                  <Feather name="camera" size={16} color={COLORS.carbon} />
                  <Text style={s.primaryText}>Add my ID now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.secondary} onPress={onAtCounter} activeOpacity={0.85}>
                  <Feather name="map-pin" size={16} color={COLORS.carbon} />
                  <Text style={s.secondaryText}>I&apos;ll show my ID at the shop</Text>
                </TouchableOpacity>
                <Text style={s.note}>Either way, we check your ID with you at your first pick-up.</Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.porcelain, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 18, maxHeight: '88%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.carbon, flex: 1 },
  body: { fontSize: 14, fontWeight: '500', color: COLORS.fg2, lineHeight: 20, marginBottom: 14 },
  primary: {
    height: 50, borderRadius: 12, backgroundColor: COLORS.amber,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  secondary: {
    height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.carbon, backgroundColor: COLORS.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10,
  },
  secondaryText: { fontSize: 15, fontWeight: '700', color: COLORS.carbon },
  note: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, textAlign: 'center', marginTop: 12 },
});
