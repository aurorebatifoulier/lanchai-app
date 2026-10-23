import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import { ConfirmBox } from '@/components/ConfirmBox';
import { RenterNameBlock } from '@/components/admin/RenterNameBlock';
import { db, storage, functions } from '@/lib/firebase';
import {
  ID_DOC_TYPES, ID_REJECTION_REASONS, pickIdPhoto, uploadIdPhotos, type IdDocType, type IdentityRecord,
} from '@/lib/identity';

// Admin: the renter's ID document (reservation detail, later Verifications → Identity).
// View the photos (download URLs fetched on demand, never stored), add/replace a photo
// taken at the counter, or decline it with a preset reason (blocks new bookings until a
// new one is sent). All writes go through the adminIdentityAction callable.
export function RenterIdCard({ renterId }: { renterId: string }) {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'add' | 'reject'>('idle');
  const [docType, setDocType] = useState<IdDocType | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onSnapshot(
    doc(db, 'identityChecks', renterId),
    snap => { setIdentity(snap.exists() ? (snap.data() as IdentityRecord) : null); setLoading(false); },
    () => setLoading(false),
  ), [renterId]);

  const filesKey = (identity?.status === 'on_file' ? identity.files ?? [] : []).join('|');
  useEffect(() => {
    let alive = true;
    const files = filesKey ? filesKey.split('|') : [];
    Promise.all(files.map(p => getDownloadURL(storageRef(storage, p)).catch(() => null)))
      .then(u => { if (alive) setUrls(u.filter((x): x is string => !!x)); });
    return () => { alive = false; };
  }, [filesKey]);

  const reset = () => { setMode('idle'); setDocType(null); setPhotos([]); setReason(null); setError(null); };

  const run = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, 'adminIdentityAction')({ renterId, ...payload });
      reset();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [renterId]);

  const saveCounterPhoto = async () => {
    if (!docType || photos.length === 0) return;
    setBusy(true);
    try {
      const files = await uploadIdPhotos(renterId, photos, 'counter');
      await run({ action: 'set', docType, files });
    } catch {
      setError('Upload failed. Please try again.');
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 8 }} />;
  const onFile = identity?.status === 'on_file';
  const typeLabel = ID_DOC_TYPES.find(t => t.key === identity?.docType)?.label ?? 'ID document';

  return (
    <View style={s.card}>
      <Text style={s.label}>ID document</Text>
      <Text style={s.status}>
        {onFile
          ? `${typeLabel} on file${identity?.source === 'counter' ? ' · photo taken at the shop' : ''}`
          : identity?.status === 'rejected'
            ? `Declined — ${identity.rejection?.text ?? ''}`
            : 'No ID on file'}
      </Text>
      <RenterNameBlock renterId={renterId} />
      {urls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
          {urls.map(u => (
            <TouchableOpacity key={u} onPress={() => setZoom(u)} activeOpacity={0.85}>
              <Image source={{ uri: u }} style={s.photo} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {mode === 'idle' && (
        <View style={s.actions}>
          <TouchableOpacity style={s.btn} onPress={() => setMode('add')} activeOpacity={0.8}>
            <Feather name="camera" size={14} color={COLORS.carbon} />
            <Text style={s.btnText}>{onFile ? 'Replace photo' : 'Add ID photo'}</Text>
          </TouchableOpacity>
          {onFile && (
            <TouchableOpacity style={s.btn} onPress={() => setMode('reject')} activeOpacity={0.8}>
              <Feather name="x-circle" size={14} color={COLORS.danger} />
              <Text style={[s.btnText, { color: COLORS.danger }]}>Decline</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {mode === 'add' && (
        <View style={{ marginTop: 10 }}>
          <View style={s.chips}>
            {ID_DOC_TYPES.map(t => (
              <TouchableOpacity key={t.key} style={[s.chip, docType === t.key && s.chipOn]} onPress={() => setDocType(t.key)}>
                <Text style={[s.chipText, docType === t.key && s.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
            {photos.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
            <TouchableOpacity
              style={s.addPhoto}
              onPress={async () => { const u = await pickIdPhoto('camera'); if (u) setPhotos(p => [...p, u]); }}
            >
              <Feather name="camera" size={18} color={COLORS.carbon} />
            </TouchableOpacity>
          </ScrollView>
          <View style={s.actions}>
            <TouchableOpacity style={s.btn} onPress={reset}><Text style={s.btnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, (!docType || photos.length === 0 || busy) && { opacity: 0.45 }]}
              disabled={!docType || photos.length === 0 || busy}
              onPress={saveCounterPhoto}
            >
              {busy ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={s.btnText}>Save ID</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mode === 'reject' && (
        <ConfirmBox
          text="Decline this ID? The renter is asked for a new one and new bookings are paused until then."
          confirmLabel="Decline"
          cancelLabel="Keep"
          destructive
          confirmDisabled={!reason || busy}
          onCancel={reset}
          onConfirm={() => run({ action: 'reject', reason })}
        >
          <View style={[s.chips, { marginTop: 8 }]}>
            {ID_REJECTION_REASONS.map(r => (
              <TouchableOpacity key={r.key} style={[s.chip, reason === r.key && s.chipOn]} onPress={() => setReason(r.key)}>
                <Text style={[s.chipText, reason === r.key && s.chipTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ConfirmBox>
      )}
      {error && <Text style={s.error}>{error}</Text>}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <TouchableOpacity style={s.zoomBackdrop} activeOpacity={1} onPress={() => setZoom(null)}>
          {zoom && <Image source={{ uri: zoom }} style={s.zoomImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2, color: COLORS.fg3, marginBottom: 6 },
  status: { fontSize: 14, fontWeight: '600', color: COLORS.carbon },
  photos: { gap: 10, paddingVertical: 10 },
  photo: { width: 160, height: 110, borderRadius: 8, backgroundColor: COLORS.softGray200 },
  thumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: COLORS.softGray200 },
  addPhoto: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.carbon,
    alignItems: 'center', justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.softGray200,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  btnPrimary: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  btnText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.carbon },
  chipTextOn: { color: COLORS.white },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 8 },
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: '100%', height: '85%' },
});
