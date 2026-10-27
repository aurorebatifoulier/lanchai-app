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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, IconCircle, useScreenInsets } from '@/components/account/ui';
import { getProduct, getReview, submitReview, getUserProfile, getReservationById } from '@/lib/firestore';
import { isLoyaltyExcluded, useLoyaltyConfig, DEFAULT_REVIEW_REWARD_POINTS } from '@/lib/loyalty';
import { Product } from '@/lib/mockData';
import { useAuth } from '@/contexts/AuthContext';

export default function ReviewScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { reservationId, rating: ratingParam } = useLocalSearchParams<{ reservationId?: string; rating?: string }>();
  // Optional pre-selected rating from an email star link (1–5); the renter can still change it.
  const initialRating = /^[1-5]$/.test(ratingParam ?? '') ? Number(ratingParam) : 0;
  const router = useRouter();
  const screen = useScreenInsets();
  const { user } = useAuth();

  const [product,        setProduct]        = useState<Product | null>(null);
  const [loadError,      setLoadError]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const [rating,     setRating]     = useState(initialRating);
  const [text,       setText]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  // Review reward (credited server-side by applyReviewReward, whatever the rating):
  // only shown to eligible accounts whose reservation hasn't been rewarded yet.
  const loyaltyConfig = useLoyaltyConfig();
  const [rewardEligible, setRewardEligible] = useState(false);
  const rewardPoints = loyaltyConfig?.reviewRewardPoints ?? DEFAULT_REVIEW_REWARD_POINTS;
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !reservationId) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    if (user) {
      Promise.all([getUserProfile(user.uid), getReservationById(reservationId)])
        .then(([profile, res]) => setRewardEligible(!isLoyaltyExcluded(profile ?? {}) && !res?.reviewRewardApplied))
        .catch(() => setRewardEligible(false));
    }
    Promise.all([
      getProduct(productId),
      getReview(productId, reservationId),
    ])
      .then(([prod, existing]) => {
        if (!prod) { setLoadError(true); return; }
        setProduct(prod);
        if (existing) setAlreadyReviewed(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [productId, reservationId, user]);

  const handleSubmit = useCallback(async () => {
    if (!user || !productId || !reservationId || !product) return;
    if (rating < 1) { setError('Please select a rating before submitting.'); return; }
    if (text.trim().length < 10) { setError('Your review must be at least 10 characters.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await submitReview({
        productId,
        reservationId,
        userId: user.uid,
        reviewerName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        rating,
        text: text.trim(),
        productName: product.name,
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [user, productId, reservationId, product, rating, text]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { paddingBottom: screen.bottom }]} edges={['top']}>
        <ActivityIndicator color={COLORS.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !product) {
    return (
      <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <IconCircle icon={{ name: 'alert-circle' }} size={64} />
          <Text style={styles.stateTitle}>Couldn&apos;t load this review</Text>
          <Text style={styles.stateSub}>The product or reservation may no longer be available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already reviewed ─────────────────────────────────────────────────────────

  if (alreadyReviewed) {
    return (
      <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <IconCircle icon={{ name: 'check' }} size={64} />
          <Text style={styles.stateTitle}>Already reviewed</Text>
          <Text style={styles.stateSub}>You&apos;ve already left a review for this rental.</Text>
          <TouchableOpacity style={[UI.btnPrimary, styles.doneBtn]} onPress={() => router.replace('/reservations')}>
            <Text style={UI.btnPrimaryText}>Back to my rentals</Text>
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
          <IconCircle icon={{ name: 'star' }} tone="amber" size={64} />
          <Text style={styles.stateTitle}>
            {rewardEligible && rewardPoints > 0 ? `Thanks! +${rewardPoints} points added` : 'Thanks for your review!'}
          </Text>
          <Text style={styles.stateSub}>
            Your feedback helps other renters and makes LANCHAI better.
          </Text>
          <TouchableOpacity style={[UI.btnPrimary, styles.doneBtn]} onPress={() => router.replace('/reservations')}>
            <Text style={UI.btnPrimaryText}>Back to my rentals</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review form ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: screen.bottom }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <Text style={styles.headerTitle}>Leave a review</Text>
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
          {/* Product name */}
          <Text style={styles.productName}>{product.name}</Text>

          <View style={[UI.card, UI.cardPadded]}>
            {/* Star selector */}
            <Text style={styles.fieldLabel}>Your rating</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  style={styles.starBtn}
                  onPress={() => { setRating(n); setError(null); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Feather
                    name="star"
                    size={36}
                    color={n <= rating ? SHADES.amber : SHADES.carbonFaint}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingLabel}>
                {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][rating]}
              </Text>
            )}

            {/* Text input */}
            <Text style={styles.fieldLabel}>Your review</Text>
            <TextInput
              style={styles.textInput}
              multiline
              placeholder="Tell us what you thought — quality, ease of use, value for money…"
              placeholderTextColor={SHADES.carbonFaint}
              value={text}
              onChangeText={t => { setText(t); setError(null); }}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.charHint}>{text.trim().length}/1000 · min 10 characters</Text>
          </View>

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
            style={[UI.btnPrimary, styles.submitBtn, submitting && styles.submitBtnBusy]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.carbon} size="small" />
              : <Text style={UI.btnPrimaryText}>Submit review</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  fieldLabel: { fontSize: 13, fontWeight: '700', color: SHADES.carbon, marginBottom: 8, marginTop: 4 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  starBtn: { padding: 4 },
  ratingLabel: { fontSize: 13, fontWeight: '700', color: SHADES.amberDeep, marginBottom: 12 },
  textInput: {
    backgroundColor: SHADES.cream, borderWidth: 1, borderColor: SHADES.border, borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: SHADES.carbon,
    minHeight: 130, lineHeight: 21,
  },
  charHint: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'right', marginTop: 6 },
  // One-line error (no red background), dismissable.
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  submitBtn: { marginTop: 12 },
  submitBtnBusy: { opacity: 0.65 },
  stateTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon, textAlign: 'center' },
  stateSub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20 },
  doneBtn: { marginTop: 16, paddingHorizontal: 28 },
});
