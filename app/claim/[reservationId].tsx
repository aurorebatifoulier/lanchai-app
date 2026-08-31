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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
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
  const insets = useSafeAreaInsets();
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
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={COLORS.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !rental) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={styles.stateTitle}>Couldn't load this rental</Text>
          <Text style={styles.stateSub}>The reservation may no longer be available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already has an open claim ─────────────────────────────────────────────────

  if (hasOpenClaim) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="clock" size={36} color={COLORS.amber} />
          <Text style={styles.stateTitle}>You already have an open claim</Text>
          <Text style={styles.stateSub}>
            We're already looking into an issue you reported for this rental — check the rental
            details screen for its status.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace(`/rentals/${rental.id}`)}>
            <Text style={styles.doneBtnText}>Back to rental</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Feather name="check-circle" size={40} color={COLORS.success} />
          <Text style={styles.stateTitle}>Claim submitted</Text>
          <Text style={styles.stateSub}>
            We've received your report and will get back to you soon.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/reservations')}>
            <Text style={styles.doneBtnText}>Back to my rentals</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.productName}>{rental.productName}</Text>

          {/* Claim type */}
          <Text style={styles.fieldLabel}>What's the issue?</Text>
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
                  {active && <Feather name="check" size={16} color={COLORS.carbon} />}
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
            placeholderTextColor={COLORS.fg3}
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
              <Feather name="plus" size={20} color={COLORS.fg3} />
            </TouchableOpacity>
          </View>
          <Text style={styles.mediaHint}>At least one photo or video is required.</Text>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
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
            style={[styles.submitBtn, (submitting || !type || media.length === 0) && styles.submitBtnBusy]}
            onPress={handleSubmit}
            disabled={submitting || !type || media.length === 0}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.carbon} size="small" />
              : <Text style={styles.submitBtnText}>Submit claim</Text>}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 8,
  },
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
    marginBottom: 8,
    marginTop: 8,
  },
  typeList: {
    gap: 8,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  typeRowActive: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  typeRowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  typeRowSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },

  textInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: COLORS.carbon,
    minHeight: 110,
    lineHeight: 20,
  },
  charHint: {
    fontSize: 11,
    color: COLORS.fg3,
    textAlign: 'right',
    marginBottom: 16,
  },

  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  photoThumbWrap: {
    width: 72,
    height: 72,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: COLORS.softGray200,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumb: {
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaHint: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: -8,
    marginBottom: 16,
  },

  // Media action sheet
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '500',
  },
  submitBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnBusy: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'center',
  },
  stateSub: {
    fontSize: 14,
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 20,
  },
  doneBtn: {
    marginTop: 16,
    height: 48,
    paddingHorizontal: 28,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});
