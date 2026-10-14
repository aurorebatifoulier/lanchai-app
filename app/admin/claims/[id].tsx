import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { getReservationById, getProduct, type RentalDoc } from '@/lib/firestore';
import type { Product } from '@/lib/mockData';
import { getClaim, respondToClaim, type ClaimDoc, type ClaimType, type ClaimStatus } from '@/lib/claims';
import { sendNotif } from '@/lib/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { CLAIM_STATUS_CONFIG } from '../claims';
import { MediaViewer } from '@/components/MediaViewer';

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  damage_not_caused: "Damage not caused by renter",
  missing_accessory: 'Missing accessory',
  not_as_described:  'Item not as described',
  other:             'Other',
};

const RESPONSE_STATUS_OPTIONS: ClaimStatus[] = ['in_review', 'resolved', 'rejected'];

export default function AdminClaimDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [claim,       setClaim]       = useState<ClaimDoc | null>(null);
  const [reservation, setReservation] = useState<RentalDoc | null>(null);
  const [product,     setProduct]     = useState<Product | null>(null);
  const [loading,     setLoading]     = useState(true);

  const [responseStatus, setResponseStatus] = useState<ClaimStatus>('in_review');
  const [responseText,   setResponseText]   = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);
  const [viewerIndex,    setViewerIndex]    = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getClaim(id)
      .then(c => {
        if (!c) { setLoading(false); return; }
        setClaim(c);
        setResponseStatus(c.status === 'open' ? 'in_review' : c.status);
        setResponseText(c.adminResponse ?? '');
        getReservationById(c.reservationId).then(setReservation).catch(() => {});
        getProduct(c.productId).then(setProduct).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = useCallback(async () => {
    if (!claim || !user || submitting) return;
    if (responseText.trim().length < 1) { setSubmitError('Please write a response.'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await respondToClaim(claim.id, {
        status: responseStatus,
        adminResponse: responseText.trim(),
        adminRespondedBy: user.uid,
      });
      setClaim(prev => prev ? { ...prev, status: responseStatus, adminResponse: responseText.trim() } : prev);
      sendNotif(claim.userId, {
        type: 'rental',
        icon: 'check',
        iconColor: 'amber',
        title: responseStatus === 'resolved' ? 'Your claim was resolved'
             : responseStatus === 'rejected' ? 'Update on your claim'
             : 'Your claim is being reviewed',
        body: `We responded to your report about ${reservation?.productName ?? 'your rental'}.`,
        deepLink: `/rentals/${claim.reservationId}`,
      });
    } catch {
      setSubmitError('Failed to send response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [claim, user, responseStatus, responseText, reservation]);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  if (!claim) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={s.errorText}>Claim not found.</Text>
        </View>
      </View>
    );
  }

  const badge = CLAIM_STATUS_CONFIG[claim.status];
  // Defensive fallback — toClaimDoc() already normalizes this to a real array for
  // any doc read through lib/claims.ts, but guard here too in case `claim` was ever
  // set from an un-normalized source.
  const media = claim.media ?? [];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={s.titleRow}>
          <Text style={s.title}>{CLAIM_TYPE_LABELS[claim.type]}</Text>
          <View style={[s.badge, { backgroundColor: badge.bg }]}>
            <Text style={[s.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>

        {/* ── Context card ── */}
        <View style={s.card}>
          <DetailRow label="Product"     value={product?.name ?? reservation?.productName ?? claim.productId} />
          <DetailRow label="Reservation" value={claim.reservationId} />
          {reservation && <DetailRow label="Renter" value={reservation.renterName ?? claim.userId} />}
        </View>

        {/* ── Description ── */}
        <Text style={s.sectionLabel}>Description</Text>
        <View style={s.card}>
          <Text style={s.description}>{claim.description}</Text>
        </View>

        {/* ── Media ── */}
        {media.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Media</Text>
            <View style={s.photoGrid}>
              {media.map((item, i) => (
                <TouchableOpacity key={item.url} onPress={() => setViewerIndex(i)} activeOpacity={0.85}>
                  {item.type === 'image' ? (
                    <Image source={{ uri: item.url }} style={s.photoThumb} />
                  ) : (
                    <View style={[s.photoThumb, s.videoThumb]}>
                      <View style={s.playBadge}>
                        <Feather name="play" size={18} color={COLORS.white} />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Existing response ── */}
        {claim.adminResponse && (
          <>
            <Text style={s.sectionLabel}>Current response</Text>
            <View style={s.card}>
              <Text style={s.description}>{claim.adminResponse}</Text>
            </View>
          </>
        )}

        {/* ── Respond ── */}
        <Text style={[s.sectionLabel, { marginTop: 12 }]}>Respond</Text>
        <View style={s.statusRow}>
          {RESPONSE_STATUS_OPTIONS.map(opt => {
            const active = responseStatus === opt;
            const cfg = CLAIM_STATUS_CONFIG[opt];
            return (
              <TouchableOpacity
                key={opt}
                style={[s.statusOption, active && { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon }]}
                onPress={() => setResponseStatus(opt)}
                activeOpacity={0.75}
              >
                <Text style={[s.statusOptionText, active && { color: COLORS.porcelain }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={s.textInput}
          multiline
          placeholder="Write a response for the renter…"
          placeholderTextColor={COLORS.fg3}
          value={responseText}
          onChangeText={t => { setResponseText(t); setSubmitError(null); }}
          textAlignVertical="top"
          maxLength={1000}
        />

        {submitError && (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={s.errorBannerText}>{submitError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnBusy]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={COLORS.carbon} size="small" />
            : <Text style={s.submitBtnText}>Send response</Text>}
        </TouchableOpacity>
      </ScrollView>

      <MediaViewer media={media} openIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Claim</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
    backgroundColor: COLORS.porcelain,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { fontSize: 14, fontWeight: '600', color: COLORS.fg3 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    marginRight: 10,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: COLORS.fg3 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.carbon, textAlign: 'right' },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: COLORS.fg3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 19,
  },

  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: 10,
    backgroundColor: COLORS.softGray200,
  },
  videoThumb: {
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusOption: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOptionText: { fontSize: 12, fontWeight: '700', color: COLORS.fg2 },

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
    marginBottom: 12,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: COLORS.danger, fontWeight: '500' },

  submitBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnBusy: { opacity: 0.65 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.carbon },
});
