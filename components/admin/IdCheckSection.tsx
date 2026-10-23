import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import { db, storage, functions } from '@/lib/firebase';
import {
  ID_DOC_TYPES, idCheckNeeded, pickIdPhoto, uploadIdPhotos, type IdDocType, type IdentityRecord,
} from '@/lib/identity';

// First-pick-up ID double check (admin, pick-up checklist + multi-item summary). Needed
// while the renter's CURRENT document hasn't been checked in person (shared
// idCheckNeeded — tied to the document version). Blocking: both confirmations, plus a
// staff photo when no document is on file ("I'll show my ID at the shop").
// perform() uploads that photo to idDocs/{renterId}/ and calls recordIdCheck.

export interface IdCheck {
  loading: boolean;
  needed: boolean;
  onFile: boolean;
  docTypeLabel: string;
  urls: string[];
  matchesPerson: boolean;
  nameMatches: boolean;
  counterDocType: IdDocType | null;
  counterPhotos: string[];
  setMatchesPerson: (v: boolean) => void;
  setNameMatches: (v: boolean) => void;
  setCounterDocType: (v: IdDocType) => void;
  addCounterPhoto: () => Promise<void>;
  removeCounterPhoto: (i: number) => void;
  /** True when the checklist may be submitted (or when no check is needed). */
  ready: boolean;
  /** Records the check (uploads the counter photo first). Throws a readable Error. */
  perform: () => Promise<void>;
}

export function useIdCheck(renterId: string | null | undefined): IdCheck {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [needed, setNeeded] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [matchesPerson, setMatchesPerson] = useState(false);
  const [nameMatches, setNameMatches] = useState(false);
  const [counterDocType, setCounterDocType] = useState<IdDocType | null>(null);
  const [counterPhotos, setCounterPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!renterId) { setLoading(false); return; }
    let alive = true;
    Promise.all([getDoc(doc(db, 'identityChecks', renterId)), getDoc(doc(db, 'users', renterId))])
      .then(async ([idSnap, userSnap]) => {
        const rec = idSnap.exists() ? (idSnap.data() as IdentityRecord) : null;
        const files = rec?.status === 'on_file' ? rec.files ?? [] : [];
        const fetched = await Promise.all(files.map(p => getDownloadURL(storageRef(storage, p)).catch(() => null)));
        if (!alive) return;
        setIdentity(rec);
        setNeeded(idCheckNeeded(userSnap.data()));
        setUrls(fetched.filter((u): u is string => !!u));
      })
      .catch(() => { if (alive) setNeeded(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [renterId]);

  const onFile = identity?.status === 'on_file';
  const ready = !loading && (!needed || (matchesPerson && nameMatches && (onFile || (!!counterDocType && counterPhotos.length > 0))));

  const addCounterPhoto = useCallback(async () => {
    const uri = await pickIdPhoto('camera');
    if (uri) setCounterPhotos(p => [...p, uri].slice(0, 6));
  }, []);

  const perform = useCallback(async () => {
    if (!needed || !renterId) return;
    let counterPhoto: { docType: IdDocType; files: string[] } | undefined;
    if (!onFile) {
      if (!counterDocType || counterPhotos.length === 0) throw new Error('Take a photo of the ID first.');
      counterPhoto = { docType: counterDocType, files: await uploadIdPhotos(renterId, counterPhotos, 'counter') };
    }
    try {
      await httpsCallable(functions, 'recordIdCheck')({ renterId, matchesPerson, nameMatches, counterPhoto });
    } catch (err) {
      throw new Error((err as { message?: string })?.message || 'Could not record the ID check. Please try again.');
    }
  }, [needed, renterId, onFile, counterDocType, counterPhotos, matchesPerson, nameMatches]);

  return {
    loading, needed, onFile, urls,
    docTypeLabel: ID_DOC_TYPES.find(t => t.key === identity?.docType)?.label ?? 'ID document',
    matchesPerson, nameMatches, counterDocType, counterPhotos,
    setMatchesPerson, setNameMatches, setCounterDocType,
    addCounterPhoto,
    removeCounterPhoto: i => setCounterPhotos(p => p.filter((_, j) => j !== i)),
    ready, perform,
  };
}

function Check({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.checkRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.box, checked && s.boxOn]}>
        {checked && <Feather name="check" size={13} color={COLORS.porcelain} />}
      </View>
      <Text style={s.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IdCheckSection({ check, renterName }: { check: IdCheck; renterName?: string | null }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (check.loading) return <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 12 }} />;
  if (!check.needed) return null;
  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Feather name="credit-card" size={16} color="#7A5500" />
        <Text style={s.title}>First rental — check ID</Text>
      </View>
      {check.onFile ? (
        <>
          <Text style={s.body}>
            Compare the person and their {check.docTypeLabel.toLowerCase()} with the uploaded photo{renterName ? ` (account: ${renterName})` : ''}. Tap to enlarge.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
            {check.urls.map(u => (
              <TouchableOpacity key={u} onPress={() => setZoom(u)} activeOpacity={0.85}>
                <Image source={{ uri: u }} style={s.photo} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <Text style={s.body}>
            No ID on file — ask for the renter&apos;s ID and take a photo of it{renterName ? ` (account: ${renterName})` : ''}.
          </Text>
          <View style={s.chips}>
            {ID_DOC_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[s.chip, check.counterDocType === t.key && s.chipOn]}
                onPress={() => check.setCounterDocType(t.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.chipText, check.counterDocType === t.key && s.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
            {check.counterPhotos.map((u, i) => (
              <View key={u}>
                <Image source={{ uri: u }} style={s.thumb} />
                <TouchableOpacity style={s.remove} onPress={() => check.removeCounterPhoto(i)} hitSlop={8}>
                  <Feather name="x" size={12} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addPhoto} onPress={check.addCounterPhoto} activeOpacity={0.8}>
              <Feather name="camera" size={18} color={COLORS.carbon} />
              <Text style={s.addText}>Take photo</Text>
            </TouchableOpacity>
          </ScrollView>
        </>
      )}
      <Check checked={check.matchesPerson} label="The document matches the person" onPress={() => check.setMatchesPerson(!check.matchesPerson)} />
      <Check checked={check.nameMatches} label="The name matches the account" onPress={() => check.setNameMatches(!check.nameMatches)} />
      {!check.ready && <Text style={s.required}>Required before handover.</Text>}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <TouchableOpacity style={s.zoomBackdrop} activeOpacity={1} onPress={() => setZoom(null)}>
          {zoom && <Image source={{ uri: zoom }} style={s.zoomImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14,
    padding: 14, marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#7A5500' },
  body: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19, marginTop: 6 },
  photos: { gap: 10, paddingVertical: 10 },
  photo: { width: 220, height: 150, borderRadius: 10, backgroundColor: COLORS.softGray200 },
  thumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: COLORS.softGray200 },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  addPhoto: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.carbon, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.white,
  },
  addText: { fontSize: 11, fontWeight: '700', color: COLORS.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.carbon },
  chipTextOn: { color: COLORS.white },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.carbon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white,
  },
  boxOn: { backgroundColor: COLORS.carbon },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.carbon },
  required: { fontSize: 12, fontWeight: '600', color: '#7A5500', marginTop: 4 },
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: '100%', height: '85%' },
});
