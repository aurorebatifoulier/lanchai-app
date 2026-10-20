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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { getProduct, getReview, submitReview } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { useAuth } from '@/contexts/AuthContext';

export default function ReviewScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { reservationId, rating: ratingParam } = useLocalSearchParams<{ reservationId?: string; rating?: string }>();
  // Optional pre-selected rating from an email star link (1–5); the renter can still change it.
  const initialRating = /^[1-5]$/.test(ratingParam ?? '') ? Number(ratingParam) : 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [product,        setProduct]        = useState<Product | null>(null);
  const [loadError,      setLoadError]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const [rating,     setRating]     = useState(initialRating);
  const [text,       setText]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !reservationId) {
      setLoadError(true);
      setLoading(false);
      return;
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
  }, [productId, reservationId]);

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
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={COLORS.amber} size="large" />
      </SafeAreaView>
    );
  }

  if (loadError || !product) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={styles.stateTitle}>Couldn&apos;t load this review</Text>
          <Text style={styles.stateSub}>The product or reservation may no longer be available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already reviewed ─────────────────────────────────────────────────────────

  if (alreadyReviewed) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackButton onPress={() => router.back()} variant="bare" size={20} boxSize={44} />
        <View style={styles.center}>
          <Feather name="check-circle" size={36} color={COLORS.success} />
          <Text style={styles.stateTitle}>Already reviewed</Text>
          <Text style={styles.stateSub}>You&apos;ve already left a review for this rental.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/reservations')}>
            <Text style={styles.doneBtnText}>Back to my rentals</Text>
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
          <Feather name="star" size={40} color={COLORS.amber} />
          <Text style={styles.stateTitle}>Thanks for your review!</Text>
          <Text style={styles.stateSub}>
            Your feedback helps other renters and makes LANCHAI better.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/reservations')}>
            <Text style={styles.doneBtnText}>Back to my rentals</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review form ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Product name */}
          <Text style={styles.productName}>{product.name}</Text>

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
                  color={n <= rating ? COLORS.amber : COLORS.softGray}
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
            placeholderTextColor={COLORS.fg3}
            value={text}
            onChangeText={t => { setText(t); setError(null); }}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.charHint}>{text.trim().length}/1000 · min 10 characters</Text>

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
            style={[styles.submitBtn, submitting && styles.submitBtnBusy]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.carbon} size="small" />
              : <Text style={styles.submitBtnText}>Submit review</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  starBtn: {
    padding: 4,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.amber,
    marginBottom: 8,
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
    minHeight: 130,
    lineHeight: 20,
  },
  charHint: {
    fontSize: 11,
    color: COLORS.fg3,
    textAlign: 'right',
    marginBottom: 16,
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
