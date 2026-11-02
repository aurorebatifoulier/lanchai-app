import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { UI, useScreenInsets, SectionTitle, CheckLine } from '@/components/account/ui';
import {
  ONBOARDING_DEFAULTS, getOnboardingDocs, saveOnboardingSlides, uploadOnboardingPhoto, deleteOnboardingPhoto,
  type OnboardingSlideDoc,
} from '@/lib/onboardingContent';

// Admin → Onboarding: the 3 first-launch slides. Photo (portrait, cropped 9:16, saved
// 1080×1920), title, text. Empty fields / no photo = the bundled default for that slot.
export default function AdminOnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [slides, setSlides] = useState<OnboardingSlideDoc[] | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOnboardingDocs().then(d => setSlides([0, 1, 2].map(i => d[i] ?? {})));
  }, []);

  const patch = (i: number, p: Partial<OnboardingSlideDoc>) => {
    setSaved(false);
    setSlides(prev => prev && prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
  };

  const pick = async (i: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [9, 16], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusySlot(i); setError(null);
    try {
      const up = await uploadOnboardingPhoto(i, res.assets[0].uri);
      const old = slides?.[i]?.imagePath;
      patch(i, up);
      if (old) deleteOnboardingPhoto(old);
    } catch {
      setError('Upload failed — try again.');
    } finally {
      setBusySlot(null);
    }
  };

  const save = async () => {
    if (!slides) return;
    setSaving(true); setError(null);
    try { await saveOnboardingSlides(slides); setSaved(true); } catch { setError('Could not save — try again.'); }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Onboarding</Text>
      </View>
      {!slides ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          <Text style={[UI.body, { marginTop: 12 }]}>Shown once, on first launch. Leave a field empty to keep the default.</Text>
          {slides.map((sl, i) => {
            const d = ONBOARDING_DEFAULTS[i];
            return (
              <View key={i}>
                <SectionTitle>{`Slide ${i + 1}`}</SectionTitle>
                <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
                  <View style={s.photoRow}>
                    <View style={s.photo}>
                      <Image source={sl.imageUrl ? { uri: sl.imageUrl } : d.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                      {busySlot === i && <View style={s.photoBusy}><ActivityIndicator color={SHADES.white} /></View>}
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={UI.small}>{sl.imageUrl ? 'Your photo' : 'Default photo'} · portrait 9:16</Text>
                      <PressScale style={[UI.btnSecondary, UI.btnCard]} onPress={() => pick(i)} disabled={busySlot !== null}>
                        <Text style={[UI.btnSecondaryText, UI.btnCardText]}>{sl.imageUrl ? 'Replace photo' : 'Upload photo'}</Text>
                      </PressScale>
                      {!!sl.imageUrl && (
                        <Text style={UI.link} onPress={() => { if (sl.imagePath) deleteOnboardingPhoto(sl.imagePath); patch(i, { imageUrl: undefined, imagePath: undefined }); }}>
                          Use the default photo
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={UI.fieldLabel}>Title</Text>
                  <TextInput style={UI.input} value={sl.title ?? ''} onChangeText={t => patch(i, { title: t })} placeholder={d.title} placeholderTextColor={SHADES.carbonFaint} maxLength={60} />
                  <Text style={UI.fieldLabel}>Text</Text>
                  <TextInput style={[UI.input, s.multi]} value={sl.text ?? ''} onChangeText={t => patch(i, { text: t })} placeholder={d.text} placeholderTextColor={SHADES.carbonFaint} multiline maxLength={160} />
                </View>
              </View>
            );
          })}
          {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
          {saved && <View style={{ marginTop: 12 }}><CheckLine text="Saved. New installs see it on first launch." /></View>}
          <PressScale style={[UI.btnPrimary, { marginTop: 16 }]} onPress={save} disabled={saving || busySlot !== null}>
            {saving ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Save</Text>}
          </PressScale>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHADES.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { ...TYPE.sectionTitle, color: SHADES.carbon },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 72, height: 128, borderRadius: 12, overflow: 'hidden', backgroundColor: SHADES.carbonLight },
  photoBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.4)', alignItems: 'center', justifyContent: 'center' },
  multi: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
});
