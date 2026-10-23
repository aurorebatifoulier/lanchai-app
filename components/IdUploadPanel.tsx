import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import {
  ID_DOC_TYPES, ID_MAX_PAGES, pickIdPhoto, submitMyIdentityDocument, type IdDocType,
} from '@/lib/identity';

// Identity document upload: document type, one or more pages (camera or gallery),
// then "Save my ID". Used by My ID (app/profile/identity.tsx) and the booking step
// (components/IdRequirementStep.tsx). Photos never leave this flow except to Storage.
export function IdUploadPanel({ onDone, submitLabel = 'Save my ID' }: { onDone: () => void; submitLabel?: string }) {
  const [docType, setDocType] = useState<IdDocType | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (source: 'camera' | 'gallery') => {
    setError(null);
    const uri = await pickIdPhoto(source);
    if (uri) setPages(p => [...p, uri].slice(0, ID_MAX_PAGES));
  };

  const save = async () => {
    if (!docType || pages.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await submitMyIdentityDocument(docType, pages);
      onDone();
    } catch (err) {
      setError((err as Error).message || 'Could not save your ID. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={s.label}>Type of document</Text>
      <View style={s.chips}>
        {ID_DOC_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.chip, docType === t.key && s.chipActive]}
            onPress={() => setDocType(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.chipText, docType === t.key && s.chipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Photos</Text>
      <Text style={s.hint}>
        A sharp photo of the page with your photo and name — all four corners visible. Add the back too for an ID card.
      </Text>
      {pages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
          {pages.map((uri, i) => (
            <View key={uri}>
              <Image source={{ uri }} style={s.thumb} />
              <TouchableOpacity style={s.remove} onPress={() => setPages(p => p.filter((_, j) => j !== i))} hitSlop={8}>
                <Feather name="x" size={12} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      {pages.length < ID_MAX_PAGES && (
        <View style={s.addRow}>
          <TouchableOpacity style={s.addBtn} onPress={() => add('camera')} activeOpacity={0.8} disabled={saving}>
            <Feather name="camera" size={15} color={COLORS.carbon} />
            <Text style={s.addText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => add('gallery')} activeOpacity={0.8} disabled={saving}>
            <Feather name="image" size={15} color={COLORS.carbon} />
            <Text style={s.addText}>From gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity
        style={[s.saveBtn, (!docType || pages.length === 0 || saving) && s.saveBtnDisabled]}
        onPress={save}
        disabled={!docType || pages.length === 0 || saving}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={s.saveText}>{submitLabel}</Text>}
      </TouchableOpacity>
      <Text style={s.privacy}>
        Only you and our staff can see it. We never share it or send it by email.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipActive: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  chipTextActive: { color: COLORS.white },
  thumbs: { gap: 10, paddingBottom: 10 },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: COLORS.softGray200 },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 8 },
  addBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.carbon,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  addText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 10 },
  saveBtn: {
    height: 48, borderRadius: 12, backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  privacy: { fontSize: 11, fontWeight: '500', color: COLORS.fg3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
