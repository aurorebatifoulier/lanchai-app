import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, getDoc } from 'firebase/firestore';
import { Text, TextInput } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import KeyboardScreen from '@/components/KeyboardScreen';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, SectionTitle, StatusChip, useScreenInsets } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoPicker } from '@/components/admin/StaffNotes';
import { getReservationById, type RentalDoc } from '@/lib/firestore';
import {
  createIncident, addStaffNote, getStaffNotes, closeIncident,
  type Incident, type StaffNote,
} from '@/lib/staffOps';

// Internal incident on a booking (admin roles): staff or owners open one from the
// reservation detail ("Report an incident") with a note + photos, then add notes. Never
// visible to the renter. Closing it (with the outcome) is an owner decision — any amount
// is decided on the reservation itself (damage review / settlement), not here.
//   /admin/incident?reservationId=… → new incident   ·   /admin/incident?id=… → view

export default function AdminIncidentScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { isShopOwner } = useAuth();
  const params = useLocalSearchParams<{ id?: string; reservationId?: string }>();
  const [incidentId, setIncidentId] = useState<string | null>(params.id ?? null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [reservation, setReservation] = useState<RentalDoc | null>(null);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState('');

  const load = useCallback(async (iid: string) => {
    const snap = await getDoc(doc(db, 'incidents', iid));
    if (!snap.exists()) return;
    const inc = { id: snap.id, ...snap.data() } as Incident;
    setIncident(inc);
    setNotes(await getStaffNotes('incidents', iid).catch(() => []));
    getReservationById(inc.reservationId).then(setReservation).catch(() => {});
  }, []);

  useEffect(() => {
    if (incidentId) load(incidentId);
    else if (params.reservationId) getReservationById(params.reservationId).then(setReservation).catch(() => {});
  }, [incidentId, params.reservationId, load]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (!incidentId) {
        if (!reservation) throw new Error('Booking not found.');
        const iid = await createIncident({
          reservationId: reservation.id, orderId: reservation.orderId ?? null, renterId: reservation.renterId,
          renterName: reservation.renterName, productId: reservation.productId, productName: reservation.productName,
          note: text, photoUris: photos,
        });
        setIncidentId(iid);
      } else {
        await addStaffNote('incidents', incidentId, text, photos);
        await load(incidentId);
      }
      setText(''); setPhotos([]);
    } catch (e) {
      setError((e as Error).message || 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const creating = !incidentId;
  return (
    <KeyboardScreen style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title} pointerEvents="none">{creating ? 'Report an incident' : 'Incident'}</Text>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
        {!!reservation && (
          <TouchableOpacity style={[UI.card, UI.cardPadded, { marginTop: 12 }]} activeOpacity={0.85}
            onPress={() => router.push(`/admin/reservations/${reservation.id}`)}>
            <Text style={UI.title}>{reservation.productName}</Text>
            <Text style={UI.subtitle}>{`${reservation.renterName ?? '—'} · ${reservation.pickupLabel} → ${reservation.returnLabel}`}</Text>
          </TouchableOpacity>
        )}

        {!creating && !incident ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 24 }} /> : null}
        {!!incident && (
          <>
            <SectionTitle>What happened</SectionTitle>
            <View style={[UI.card, UI.cardPadded, { gap: 8 }]}>
              <View style={s.rowCenter}>
                <Text style={[UI.small, s.flex]}>{`${incident.createdByName ?? 'Staff'} · ${incident.createdAt?.toDate().toLocaleString('en-GB') ?? ''}`}</Text>
                <StatusChip label={incident.status === 'open' ? 'Open' : 'Closed'} tone={incident.status === 'open' ? 'amber' : 'grey'} />
              </View>
              <Text style={UI.body}>{incident.note}</Text>
              {incident.photos.length > 0 && (
                <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                  {incident.photos.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
                </ScrollView>
              )}
            </View>
            {notes.length > 0 && <SectionTitle>Notes</SectionTitle>}
            {notes.map(n => (
              <View key={n.id} style={[UI.card, UI.cardPadded, { gap: 6, marginBottom: 8 }]}>
                <Text style={UI.small}>{`${n.byName} · ${n.at?.toDate().toLocaleString('en-GB') ?? ''}`}</Text>
                <Text style={UI.body}>{n.text}</Text>
                {!!n.photos?.length && (
                  <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                    {n.photos.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
                  </ScrollView>
                )}
              </View>
            ))}
          </>
        )}

        {(creating || incident?.status === 'open') && (
          <>
            <SectionTitle>{creating ? 'Describe it' : 'Add a note'}</SectionTitle>
            <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
              <TextInput style={[UI.input, s.textArea]} value={text} onChangeText={setText} multiline editable={!busy}
                placeholder={creating ? 'e.g. Tear on the side panel, renter says it was there' : 'Note'}
                placeholderTextColor={SHADES.carbonPlaceholder} />
              <PhotoPicker uris={photos} onChange={setPhotos} disabled={busy} />
              {!!error && <Text style={UI.errorText}>{error}</Text>}
              <TouchableOpacity disabled={busy || text.trim().length < 3}
                style={[UI.btnPrimary, (busy || text.trim().length < 3) && UI.btnDisabled]} onPress={submit} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{creating ? 'Report incident' : 'Add note'}</Text>}
              </TouchableOpacity>
              <Text style={UI.small}>Internal — the renter never sees this. Any charge is decided by an owner.</Text>
            </View>
          </>
        )}

        {isShopOwner && incident?.status === 'open' && (
          closing ? (
            <View style={{ marginTop: 16 }}>
              <ConfirmBox text="Close this incident? Write the outcome." confirmLabel="Close incident"
                confirmDisabled={outcome.trim().length < 3}
                onCancel={() => setClosing(false)}
                onConfirm={async () => {
                  try { await closeIncident(incident.id, outcome); setClosing(false); await load(incident.id); }
                  catch { setError('Couldn’t close. Please try again.'); }
                }}>
                <TextInput style={[UI.input, s.textArea, { marginTop: 8 }]} value={outcome} onChangeText={setOutcome} multiline
                  placeholder="Outcome" placeholderTextColor={SHADES.carbonPlaceholder} />
              </ConfirmBox>
            </View>
          ) : (
            <TouchableOpacity style={[UI.btnSecondary, { marginTop: 16 }]} onPress={() => setClosing(true)} activeOpacity={0.85}>
              <Text style={UI.btnSecondaryText}>Close incident</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.3 },
  row: { flexDirection: 'row', gap: 8 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(30,30,30,0.7)', alignItems: 'center', justifyContent: 'center' },
  textArea: { height: 96, paddingTop: 10, textAlignVertical: 'top' },
});
