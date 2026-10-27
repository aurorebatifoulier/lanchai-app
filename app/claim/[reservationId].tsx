import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle, useScreenInsets } from '@/components/account/ui';
import { getReservationById, type RentalDoc } from '@/lib/firestore';
import { getClaimsForReservation, submitClaim, type ClaimType, type ClaimMediaType } from '@/lib/claims';
import { useAuth } from '@/contexts/AuthContext';

interface PickedMedia { uri: string; type: ClaimMediaType; }

const CLAIM_TYPES: { id: ClaimType; label: string; sub: string }[] = [
  { id: 'damage_not_caused', label: "Damage I didn't cause", sub: 'The item was already damaged, or the charge is wrong' },
  { id: 'missing_accessory', label: 'Missing accessory', sub: 'Something included with the item was missing' },
  { id: 'not_as_described', label: 'Item not as described', sub: "The item didn't match the listing" },
  { id: 'other', label: 'Other', sub: 'Something else went wrong' },
];

export default function ClaimScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const { type: presetType } = useLocalSearchParams<{ type?: ClaimType }>();
  const router = useRouter();
  const screen = useScreenInsets();
  const { user } = useAuth();

  const [rental,       setRental]       = useState<RentalDoc | null>(null);
  const [loadError,    setLoadError]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [hasOpenClaim, setHasOpenClaim] = useState(false);

  const [type,        setType]        = useState<ClaimType | null>(null);
  const [description, setDescription] = useState('');
  const [media,       setMedia]       = useState<PickedMedia[]>([]);
  const [mediaSheetVisible, setMediaSheetVisible] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (presetType) setType(presetType);
  }, [presetType]);

  useEffect(() => {
    if (!reservationId || !user) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    Promise.all([
      getReservationById(reservationId),
      getClaimsForReservation(user.uid, reservationId),
    ])
      .then(([r, claims]) => {
        if (!r) { setLoadError(true); return; }
        setRental(r);
        if (claims.some(c => c.status === 'open' || c.status === 'in_review')) {
          setHasOpenClaim(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reservationId, user]);

  const handleAddPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Photo access denied. Please allow it in your device settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;
    setMedia(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, type: 'image' as const }))]);
    setMediaSheetVisible(false);
  }, []);

  const handleRecordVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setError('Camera access denied. Please allow it in your device settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: 0.6,
    });
    if (result.canceled || result.assets.length === 0) return;
    setMedia(prev => [...prev, { uri: result.assets[0].uri, type: 'video' as const }]);
    setMediaSheetVisible(false);
  }, []);

  const handlePickVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Video access denied. Please allow it in your device settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (result.canceled || result.assets.length === 0) return;
    setMedia(prev => [...prev, { uri: result.assets[0].uri, type: 'video' as const }]);
    setMediaSheetVisible(false);
  }, []);

  const handleRemoveMedia = useCallback((uri: string) => {
    setMedia(prev => prev.filter(m => m.uri !== uri));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user || !rental || !type) return;
    if (media.length === 0) { setError('Please attach at least one photo or video.'); return; }
    if (description.trim().length < 10) { setError('Please describe the issue in at least 10 characters.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await submitClaim({
        userId: user.uid,
        reservationId: rental.id,
        productId: rental.productId,
        type,
        description: description.trim(),
        media: media.map(m => ({ uri: m.uri, type: m.type })),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [user, rental, type, description, media]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { paddingBottom: screen.bottom }]} edges={['top']}>
        <ActivityIndicator color={SHADES.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !rental) {
    return (
      <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <IconCircle icon={{ name: 'alert-circle' }} size={64} />
          <Text style={styles.stateTitle}>Couldn&apos;t load this rental</Text>
          <Text style={styles.stateSub}>The reservation may no longer be available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already has an open claim ─────────────────────────────────────────────────

  if (hasOpenClaim) {
    return (
      <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <IconCircle icon={{ name: 'clock' }} size={64} />
          <Text style={styles.stateTitle}>You already have an open claim</Text>
          <Text style={styles.stateSub}>
            We&apos;re already looking into an issue you reported for this rental — check the rental
            details screen for its status.
          </Text>
          <TouchableOpacity style={[UI.btnPrimary, styles.doneBtn]} onPress={() => router.replace(`/rentals/${rental.id}`)}>
            <Text style={UI.btnPrimaryText}>Back to rental</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
        <View style={styles.center}>
          <IconCircle icon={{ name: 'check' }} size={64} />
          <Text style={styles.stateTitle}>Claim submitted</Text>
          <Text style={styles.stateSub}>
            We&apos;ve received your report and will get back to you soon.
          </Text>
          <TouchableOpacity style={[UI.btnPrimary, styles.doneBtn]} onPress={() => router.replace('/reservations')}>
            <Text style={UI.btnPrimaryText}>Back to my rentals</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <Text style={styles.headerTitle}>Report an issue</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: screen.contentBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.productName}>{rental.productName}</Text>

          {/* Claim type */}
          <Text style={styles.fieldLabel}>What&apos;s the issue?</Text>
          <View style={styles.typeList}>
            {CLAIM_TYPES.map(opt => {
              const active = type === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.typeRow, active && styles.typeRowActive]}
                  onPress={() => { setType(opt.id); setError(null); }}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeRowLabel}>{opt.label}</Text>
                    <Text style={styles.typeRowSub}>{opt.sub}</Text>
                  </View>
                  {active && <Feather name="check" size={16} color={SHADES.carbon} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Description */}
          <Text style={styles.fieldLabel}>Tell us what happened</Text>
          <TextInput
            style={styles.textInput}
            multiline
            placeholder="Describe the issue with as much detail as you can…"
            placeholderTextColor={SHADES.carbonFaint}
            value={description}
            onChangeText={t => { setDescription(t); setError(null); }}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.charHint}>{description.trim().length}/1000 · min 10 characters</Text>

          {/* Photos & videos */}
          <Text style={styles.fieldLabel}>Photos & videos</Text>
          <View style={styles.photoRow}>
            {media.map(m => (
              <View key={m.uri} style={styles.photoThumbWrap}>
                {m.type === 'image' ? (
                  <Image source={{ uri: m.uri }} style={styles.photoThumb} />
                ) : (
                  <View style={[styles.photoThumb, styles.videoThumb]}>
                    <View style={styles.playBadge}>
                      <Feather name="play" size={14} color={COLORS.white} />
                    </View>
                  </View>
                )}
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemoveMedia(m.uri)}>
                  <Feather name="x" size={12} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhotoBtn} onPress={() => setMediaSheetVisible(true)}>
              <Feather name="plus" size={20} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.mediaHint}>At least one photo or video is required.</Text>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={[UI.errorText, { flex: 1 }]}>{error}</Text>
              <TouchableOpacity
                onPress={() => setError(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={14} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[UI.btnPrimary, styles.submitBtn, (submitting || !type || media.length === 0) && styles.submitBtnBusy]}
            onPress={handleSubmit}
            disabled={submitting || !type || media.length === 0}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.carbon} size="small" />
              : <Text style={UI.btnPrimaryText}>Submit claim</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Media action sheet */}
      <Modal
        visible={mediaSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMediaSheetVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => setMediaSheetVisible(false)}
        >
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionOption} onPress={handleAddPhotos} activeOpacity={0.7}>
              <Feather name="image" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Photo library</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionOption} onPress={handleRecordVideo} activeOpacity={0.7}>
              <Feather name="video" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Record video</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionOption} onPress={handlePickVideo} activeOpacity={0.7}>
              <Feather name="film" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Video library</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// My Account design (components/account/ui.tsx), brand shades only.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.porcelain },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  productName: { fontSize: 22, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.4, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: SHADES.carbon, marginBottom: 8, marginTop: 8 },
  typeList: { gap: 8, marginBottom: 8 },
  // Choice rows: white cards; selected = light amber with an amber border.
  typeRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: SHADES.white,
    borderWidth: 0.5, borderColor: SHADES.border, borderRadius: 18,
    paddingVertical: 13, paddingHorizontal: 14, gap: 8,
  },
  typeRowActive: { backgroundColor: SHADES.amberLight, borderColor: SHADES.amber, borderWidth: 1 },
  typeRowLabel: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  typeRowSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },

  textInput: {
    backgroundColor: SHADES.white, borderWidth: 1, borderColor: SHADES.border, borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: SHADES.carbon,
    minHeight: 110, lineHeight: 21,
  },
  charHint: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'right', marginBottom: 16 },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  photoThumbWrap: { width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  photoRemoveBtn: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: SHADES.carbonFaint,
    borderStyle: 'dashed', backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  videoThumb: { backgroundColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaHint: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, marginTop: -8, marginBottom: 16 },

  // Media action sheet
  actionOverlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8, paddingBottom: 40, paddingHorizontal: 20,
  },
  actionOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  actionOptionText: { fontSize: 15, fontWeight: '600', color: SHADES.carbon },
  actionDivider: { height: 0.5, backgroundColor: SHADES.border },

  // One-line error (no red background), dismissable.
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  submitBtn: { marginTop: 8 },
  submitBtnBusy: { opacity: 0.45 },
  stateTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon, textAlign: 'center' },
  stateSub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20 },
  doneBtn: { marginTop: 16, paddingHorizontal: 28 },
});
