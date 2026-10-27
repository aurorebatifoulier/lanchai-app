import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle } from '@/components/account/ui';
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
          <View style={s.handle} />
          <View style={s.headerRow}>
            <IconCircle icon={{ set: 'mci', name: 'card-account-details-outline' }} tone="amber" />
            <Text style={s.title}>{rejected ? 'Please add a new ID' : 'One last step: your ID'}</Text>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <Feather name="x" size={20} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[UI.body, s.body]}>
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
                <TouchableOpacity style={UI.btnPrimary} onPress={() => setUploading(true)} activeOpacity={0.85}>
                  <Feather name="camera" size={16} color={SHADES.carbon} />
                  <Text style={UI.btnPrimaryText}>Add my ID now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[UI.btnSecondary, { height: 50, marginTop: 10 }]} onPress={onAtCounter} activeOpacity={0.85}>
                  <Feather name="map-pin" size={16} color={SHADES.carbon} />
                  <Text style={UI.btnSecondaryText}>I&apos;ll show my ID at the shop</Text>
                </TouchableOpacity>
                <Text style={[UI.small, s.note]}>Either way, we check your ID with you at your first pick-up.</Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, flex: 1 },
  body: { marginBottom: 16 },
  note: { textAlign: 'center', marginTop: 12 },
});
