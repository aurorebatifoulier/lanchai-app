import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import {
  ID_DOC_TYPES, ID_MAX_PAGES, pickIdPhoto, submitMyIdentityDocument, type IdDocType,
} from '@/lib/identity';

// Identity document upload: document type, one or more pages (camera or gallery),
// then "Save my ID". Used by the ID & residency screen (components/profile/IdentitySection.tsx) and the booking step
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
      <Text style={UI.fieldLabel}>Type of document</Text>
      <View style={s.chips}>
        {ID_DOC_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[UI.choice, docType === t.key && UI.choiceOn]}
            onPress={() => setDocType(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[UI.choiceText, docType === t.key && UI.choiceTextOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[UI.fieldLabel, { marginTop: 16 }]}>Photos</Text>
      <Text style={[UI.small, { marginBottom: 10 }]}>
        A sharp photo of the page with your photo and name — all four corners visible. Add the back too for an ID card.
      </Text>
      {pages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
          {pages.map((uri, i) => (
            <View key={uri}>
              <Image source={{ uri }} style={s.thumb} />
              <TouchableOpacity style={s.remove} onPress={() => setPages(p => p.filter((_, j) => j !== i))} hitSlop={8}>
                <Feather name="x" size={12} color={SHADES.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      {pages.length < ID_MAX_PAGES && (
        <View style={s.addRow}>
          <TouchableOpacity style={[UI.btnSecondary, { flex: 1 }]} onPress={() => add('camera')} activeOpacity={0.8} disabled={saving}>
            <Feather name="camera" size={15} color={SHADES.carbon} />
            <Text style={UI.btnSecondaryText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[UI.btnSecondary, { flex: 1 }]} onPress={() => add('gallery')} activeOpacity={0.8} disabled={saving}>
            <Feather name="image" size={15} color={SHADES.carbon} />
            <Text style={UI.btnSecondaryText}>From gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}
      <TouchableOpacity
        style={[UI.btnPrimary, { marginTop: 16 }, (!docType || pages.length === 0 || saving) && UI.btnDisabled]}
        onPress={save}
        disabled={!docType || pages.length === 0 || saving}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{submitLabel}</Text>}
      </TouchableOpacity>
      <Text style={[UI.small, s.privacy]}>
        Only you and our staff can see it. We never share it or send it by email.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbs: { gap: 10, paddingBottom: 10 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(30,30,30,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 8 },
  privacy: { textAlign: 'center', marginTop: 8 },
});
