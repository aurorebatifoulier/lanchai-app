import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SHADES } from '@/constants/brandShades';
import { TYPE } from '@/constants/typography';
import {
  ONBOARDING_DEFAULT_TEXTS, ONBOARDING_STICKER_LABELS, ONBOARDING_PHOTO_SLOTS,
} from '@/constants/onboardingCopy';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { UI, useScreenInsets, SectionTitle, CheckLine } from '@/components/account/ui';
import {
  bundledPhoto, getOnboardingDocs, saveOnboardingSlides, uploadOnboardingPhoto, deleteOnboardingPhoto,
  type OnboardingSlideDoc,
} from '@/lib/onboardingContent';

const SLIDE_NAMES = ['Slide 1 · The idea', 'Slide 2 · How it works', 'Slide 3 · Why LANCHAI'];

// Admin → Onboarding ("living cards"): per slide the photo slots (2 / 3 / 1, cropped 4:5,
// saved ~1080 px JPEG 0.7), the title ([brackets] = highlighted words), the sub-line and
// the sticker texts. Empty = the default (shown as placeholder). Shown once per device.
export default function AdminOnboardingScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [slides, setSlides] = useState<OnboardingSlideDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOnboardingDocs().then(d => setSlides([0, 1, 2].map(i => d[i] ?? {})));
  }, []);

  const patch = (i: number, fn: (x: OnboardingSlideDoc) => OnboardingSlideDoc) => {
    setSaved(false);
    setSlides(prev => prev && prev.map((x, j) => (j === i ? fn(x) : x)));
  };
  const setPhoto = (i: number, j: number, photo: { url: string | null; path: string | null }) =>
    patch(i, x => {
      const photos = Array.from({ length: ONBOARDING_PHOTO_SLOTS[i] }, (_, k) => x.photos?.[k] ?? {});
      photos[j] = photo;
      return { ...x, photos };
    });

  const pick = async (i: number, j: number) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(`${i}-${j}`); setError(null);
    try {
      const up = await uploadOnboardingPhoto(i, j, res.assets[0].uri);
      const old = slides?.[i]?.photos?.[j]?.path;
      setPhoto(i, j, up);
      if (old) deleteOnboardingPhoto(old);
    } catch {
      setError('Upload failed — try again.');
    } finally {
      setBusy(null);
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
          <Text style={[UI.body, { marginTop: 12 }]}>
            Shown once per device, on first launch. Leave a field empty to keep the default. In titles, put the highlighted words in [brackets].
          </Text>
          {slides.map((sl, i) => {
            const d = ONBOARDING_DEFAULT_TEXTS[i];
            return (
              <View key={i}>
                <SectionTitle>{SLIDE_NAMES[i]}</SectionTitle>
                <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
                  <Text style={UI.fieldLabel}>Photos · 4:5</Text>
                  <View style={s.photos}>
                    {Array.from({ length: ONBOARDING_PHOTO_SLOTS[i] }, (_, j) => {
                      const ph = sl.photos?.[j];
                      return (
                        <View key={j} style={s.slot}>
                          <PressScale accessibilityRole="button" accessibilityLabel="Change photo" style={s.photo} onPress={() => pick(i, j)} disabled={busy !== null}>
                            <Image source={ph?.url ? { uri: ph.url } : bundledPhoto(i, j)} style={StyleSheet.absoluteFill} contentFit="cover" />
                            {busy === `${i}-${j}` && <View style={s.photoBusy}><ActivityIndicator color={SHADES.white} /></View>}
                          </PressScale>
                          <Text style={UI.small}>{ph?.url ? 'Yours · tap to replace' : 'Default · tap to upload'}</Text>
                          {!!ph?.url && (
                            <Text style={[UI.link, s.reset]} onPress={() => { if (ph.path) deleteOnboardingPhoto(ph.path); setPhoto(i, j, { url: null, path: null }); }}>
                              Use default
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <Text style={UI.fieldLabel}>Title</Text>
                  <TextInput style={UI.input} value={sl.title ?? ''} onChangeText={t => patch(i, x => ({ ...x, title: t }))}
                    placeholder={d.title} placeholderTextColor={SHADES.carbonPlaceholder} maxLength={80} />
                  <Text style={UI.fieldLabel}>Sub-line</Text>
                  <TextInput style={[UI.input, s.multi]} value={sl.sub ?? ''} onChangeText={t => patch(i, x => ({ ...x, sub: t }))}
                    placeholder={d.sub} placeholderTextColor={SHADES.carbonPlaceholder} multiline maxLength={140} />
                  {Object.keys(d.stickers).map(k => (
                    <View key={k}>
                      <Text style={UI.fieldLabel}>{ONBOARDING_STICKER_LABELS[i][k]}</Text>
                      <TextInput style={UI.input} value={sl.stickers?.[k] ?? ''}
                        onChangeText={t => patch(i, x => ({ ...x, stickers: { ...(x.stickers ?? {}), [k]: t } }))}
                        placeholder={d.stickers[k]} placeholderTextColor={SHADES.carbonPlaceholder} maxLength={40} />
                    </View>
                  ))}
                  {i === 0 && <Text style={UI.small}>The “From … LAK / day” chip is computed from the published catalogue.</Text>}
                </View>
              </View>
            );
          })}
          {!!error && <Text style={[UI.errorText, { marginTop: 12 }]}>{error}</Text>}
          {saved && <View style={{ marginTop: 12 }}><CheckLine text="Saved. New installs see it on first launch." /></View>}
          <PressScale style={[UI.btnPrimary, { marginTop: 16 }]} onPress={save} disabled={saving || busy !== null}>
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
  photos: { flexDirection: 'row', gap: 10 },
  slot: { width: 92, gap: 4 },
  photo: { width: 92, height: 115, borderRadius: 12, overflow: 'hidden', backgroundColor: SHADES.carbonLight },
  photoBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,30,0.4)', alignItems: 'center', justifyContent: 'center' },
  reset: { fontSize: 12 },
  multi: { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 },
});
