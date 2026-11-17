import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Text, TextInput } from '@/components/AppText';
import { UI, SectionTitle } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { askCamera } from '@/lib/mediaPermissions';
import { addStaffNote, getStaffNotes, type StaffNote } from '@/lib/staffOps';

// Evidence photos (camera / library, ≤ 6) + internal staff notes — used by the incident
// screen and the claim detail ("Team notes": staff add context and photos, the owner
// decides). Never shown to renters (firestore.rules: admin read only).

const MAX_PHOTOS = 6;

export function PhotoPicker({ uris, onChange, disabled }: { uris: string[]; onChange: (u: string[]) => void; disabled?: boolean }) {
  const add = async (camera: boolean) => {
    if (camera) {
      const p = await askCamera();
      if (!p.granted) return;
    }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS });
    if (r.canceled) return;
    onChange([...uris, ...r.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
  };
  return (
    <View style={{ gap: 8 }}>
      {uris.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {uris.map(u => (
            <View key={u}>
              <Image source={{ uri: u }} style={s.thumb} />
              <TouchableOpacity style={s.remove} onPress={() => onChange(uris.filter(x => x !== u))}
                accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={10}>
                <Feather name="x" size={14} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      {uris.length < MAX_PHOTOS && (
        <View style={s.row}>
          <TouchableOpacity disabled={disabled} style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => add(true)} activeOpacity={0.85}>
            <Feather name="camera" size={16} color={SHADES.carbon} />
            <Text style={[UI.btnSecondaryText, UI.btnCardText]}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={disabled} style={[UI.btnSecondary, UI.btnCard, s.flex]} onPress={() => add(false)} activeOpacity={0.85}>
            <Feather name="image" size={16} color={SHADES.carbon} />
            <Text style={[UI.btnSecondaryText, UI.btnCardText]}>From photos</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}


export function StaffNotes({ parent, parentId, canAdd = true }: {
  parent: 'incidents' | 'claims'; parentId: string; canAdd?: boolean;
}) {
  const [notes, setNotes] = useState<StaffNote[] | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getStaffNotes(parent, parentId).then(setNotes).catch(() => setNotes([]));
  }, [parent, parentId]);
  useEffect(load, [load]);

  const add = async () => {
    setBusy(true); setError(null);
    try {
      await addStaffNote(parent, parentId, text, photos);
      setText(''); setPhotos([]);
      load();
    } catch (e) {
      setError((e as Error).message || 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionTitle>Team notes</SectionTitle>
      {notes == null ? <ActivityIndicator color={SHADES.amber} /> : notes.length === 0 ? (
        <Text style={UI.small}>No notes yet. Only the team sees them.</Text>
      ) : notes.map(n => (
        <View key={n.id} style={[UI.card, UI.cardPadded, sn.note]}>
          <Text style={UI.small}>{`${n.byName} · ${n.at?.toDate().toLocaleString('en-GB') ?? ''}`}</Text>
          <Text style={UI.body}>{n.text}</Text>
          {!!n.photos?.length && (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {n.photos.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
            </ScrollView>
          )}
        </View>
      ))}
      {canAdd && (
        <View style={[UI.card, UI.cardPadded, sn.form]}>
          <TextInput style={[UI.input, sn.area]} value={text} onChangeText={setText} multiline editable={!busy}
            placeholder="Add a note for the team" placeholderTextColor={SHADES.carbonPlaceholder} />
          <PhotoPicker uris={photos} onChange={setPhotos} disabled={busy} />
          {!!error && <Text style={UI.errorText}>{error}</Text>}
          <TouchableOpacity disabled={busy || text.trim().length < 3}
            style={[UI.btnSecondary, (busy || text.trim().length < 3) && UI.btnDisabled]} onPress={add} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnSecondaryText}>Add note</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(30,30,30,0.7)', alignItems: 'center', justifyContent: 'center' },
});
const sn = StyleSheet.create({
  note: { gap: 6, marginBottom: 8 },
  form: { gap: 10, marginTop: 4 },
  area: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
});
