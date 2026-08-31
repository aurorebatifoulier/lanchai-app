import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { getReservationById, getProduct, cancelReservation, getUserProfile, RentalDoc, UserProfile } from '@/lib/firestore';
import { overdueSeverity, overdueLabel } from '@/utils/overdue';
import { Product } from '@/lib/mockData';
import { sendNotif } from '@/lib/notifications';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import { useAuth } from '@/contexts/AuthContext';
import { useVatPercent } from '@/lib/exchangeRate';
import { QRThumb } from '@/components/QRThumb';
import { QRLightbox } from '@/components/QRLightbox';
import { ChecklistSummary } from '@/components/ChecklistSummary';
import { SettlementSummary } from '@/components/SettlementSummary';
import { PriceLak } from '@/components/PriceLak';
import { getClaimsForReservation, type ClaimDoc, type ClaimType, type ClaimStatus } from '@/lib/claims';

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  damage_not_caused: "Damage I didn't cause",
  missing_accessory: 'Missing accessory',
  not_as_described:  'Item not as described',
  other:             'Other issue',
};

const CLAIM_STATUS_STYLE: Record<ClaimStatus, { label: string; color: string; bg: string }> = {
  open:       { label: 'Open',       color: '#854F0B',      bg: '#FBE8C4' },
  in_review:  { label: 'In review',  color: COLORS.pending,  bg: 'rgba(37,115,181,0.1)' },
  resolved:   { label: 'Resolved',   color: COLORS.success,  bg: 'rgba(46,139,87,0.1)' },
  rejected:   { label: 'Rejected',   color: COLORS.fg3,      bg: COLORS.softGray200 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type TabId = 'upcoming' | 'active' | 'history';

type CancelTier = 'free' | 'voucher' | 'no_refund' | 'premium';

function getCancelTier(hoursUntilPickup: number, isPremium?: boolean): CancelTier {
  if (isPremium) return 'premium';
  if (hoursUntilPickup > 48) return 'free';
  if (hoursUntilPickup > 24) return 'voucher';
  return 'no_refund';
}

function getCategory(r: RentalDoc, now: number): TabId {
  if (r.status === 'returned') return 'history';
  if (r.status === 'active')   return 'active';
  const pickup = r.pickupAt.toDate().getTime();
  const ret    = r.returnAt.toDate().getTime();
  if (ret < now)     return 'history';
  if (pickup <= now) return 'active';
  return 'upcoming';
}

interface Badge { label: string; color: string; bg: string }

function getBadge(r: RentalDoc, cat: TabId): Badge {
  if (r.status === 'cancelled') {
    return { label: 'Cancelled', color: COLORS.fg3, bg: COLORS.softGray200 };
  }
  if (cat === 'history') {
    return { label: 'Returned', color: COLORS.fg3, bg: COLORS.warmBeige };
  }
  if (cat === 'active') {
    return { label: 'Active', color: COLORS.success, bg: 'rgba(46,139,87,0.1)' };
  }
  if (r.status === 'pending_payment') {
    return { label: 'Pending payment at pick-up', color: '#854F0B', bg: '#FBE8C4' };
  }
  return { label: 'Confirmed', color: COLORS.success, bg: 'rgba(46,139,87,0.1)' };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RentalDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const shop = useShopInfo();
  const { user } = useAuth();
  const vatPercent = useVatPercent();

  const [rental,  setRental]  = useState<RentalDoc | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const [cancelPhase,  setCancelPhase]  = useState<'idle' | 'confirm' | 'terms'>('idle');
  const [cancelAgreed, setCancelAgreed] = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [cancelError,  setCancelError]  = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ value: string; label: string } | null>(null);
  const [claims, setClaims] = useState<ClaimDoc[]>([]);

  useEffect(() => {
    if (!id) return;
    getReservationById(id)
      .then(async r => {
        setRental(r);
        if (!r) { setError(true); return; }
        try { setProduct(await getProduct(r.productId)); } catch {}
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || !id) return;
    getClaimsForReservation(user.uid, id).then(setClaims).catch(() => {});
  }, [user, id]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  if (error || !rental) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={28} color={COLORS.fg3} />
          <Text style={s.errorText}>Rental not found.</Text>
        </View>
      </View>
    );
  }

  const now       = Date.now();
  const cat       = getCategory(rental, now);
  const badge     = getBadge(rental, cat);
  const isOverdue = rental.status === 'active' && rental.returnAt.toDate().getTime() < now;

  const hoursUntilPickup = (rental.pickupAt.toDate().getTime() - now) / (1000 * 60 * 60);
  const isCancellable = (rental.status === 'pending_payment' || rental.status === 'confirmed') &&
    hoursUntilPickup > 0;
  const cancelTier = getCancelTier(hoursUntilPickup, product?.isPremium);

  // Once a handover checklist has been submitted, the deposit was actually received in
  // whatever currency the admin chose there — show that instead of the original LAK
  // figure. Before handover, no currency choice has been made yet, so show LAK as usual.
  const handoverDeposit = rental.handoverChecklist;
  const depositDisplay = (handoverDeposit?.depositCurrency && handoverDeposit?.depositAmount != null)
    ? `${handoverDeposit.depositAmount.toLocaleString('en-US')} ${handoverDeposit.depositCurrency}`
    : `${rental.deposit.toLocaleString('en-US')} LAK`;

  // Settlement summary — only once the rental has actually concluded (returned or
  // lost/stolen) AND any outstanding balance has been settled (or there never was one).
  // Kept separate from the isOverdue banner above, which is an earlier, purely
  // indicative moment in the lifecycle (still active, nothing frozen yet).
  const hasCharge = rental.chargeAmount != null || rental.lateChargeAmount != null;
  const settlementVisible = hasCharge && rental.chargeCurrency != null
    && (rental.status === 'returned' || rental.status === 'lost')
    && ((rental.outstandingBalance ?? 0) === 0 || rental.outstandingSettled === true || rental.outstandingWrittenOff === true);

  // Separate from hasCharge above (which also ORs in lateChargeAmount) — a late-return
  // penalty has no matching claim type, so it must never trigger "Dispute this charge".
  const hasDamageCharge = rental.chargeAmount != null;
  const hasOpenClaim = claims.some(c => c.status === 'open' || c.status === 'in_review');

  const handleCancel = async () => {
    if (cancelling || !rental) return;
    if (cancelPhase === 'terms' && !cancelAgreed) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelReservation(rental.id);
      sendNotif(rental.renterId, {
        type:      'rental',
        icon:      'x-circle',
        iconColor: COLORS.fg3,
        title:     'Rental cancelled',
        body:      `Your booking for ${rental.productName} has been cancelled.`,
        deepLink:  '/(tabs)/reservations',
      });
      setRental(prev => prev ? { ...prev, status: 'cancelled' as const } : prev);
      setCancelPhase('idle');
      setCancelAgreed(false);
    } catch {
      setCancelError('Could not cancel. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* ── Product name + badge ── */}
        <Text style={s.productName}>{rental.productName}</Text>

        {isOverdue ? (() => {
          const sev = overdueSeverity(rental.returnAt);
          const bg  = sev === 'severe' ? COLORS.danger : sev === 'moderate' ? '#FEE2E2' : COLORS.amberTint;
          const bdr = sev === 'severe' ? COLORS.danger : sev === 'moderate' ? '#FCA5A5' : COLORS.amberTintBorder;
          const txt = sev === 'severe' ? '#FFFFFF'     : sev === 'moderate' ? COLORS.danger : COLORS.amberTintText;
          return (
            <View style={s.overdueBannerWrap}>
              <View style={[s.badge, { backgroundColor: bg, borderColor: bdr, borderWidth: 1, marginBottom: 0 }]}>
                <Text style={[s.badgeText, { color: txt }]}>{overdueLabel(rental.returnAt)}</Text>
              </View>
              {(rental.latePenaltyAmount ?? 0) > 0 && (
                <Text style={s.penaltyNote}>
                  A penalty of {rental.latePenaltyAmount!.toLocaleString('en-US')} LAK may apply, pending confirmation from our team
                </Text>
              )}
            </View>
          );
        })() : (
          <View style={[s.badge, { backgroundColor: badge.bg }]}>
            <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}

        {/* ── Pick-up QR — only for reservations that still need pickup ── */}
        {(rental.status === 'pending_payment' || rental.status === 'confirmed' || rental.status === 'active') && (
          <View style={s.qrCard}>
            <View style={s.qrCardLeft}>
              <Text style={s.qrCardTitle}>Pick-up QR</Text>
              <Text style={s.qrCardHint}>Show this at pick-up</Text>
            </View>
            <QRThumb
              value={`LANCHAI-RES:${rental.id}`}
              size={90}
              variant="item"
              onPress={() => setLightbox({ value: `LANCHAI-RES:${rental.id}`, label: rental.productName })}
            />
          </View>
        )}

        {/* ── Recap card ── */}
        <View style={s.card}>
          <DetailRow label="Pick-up"      value={rental.pickupLabel} />
          <DetailRow label="Return"       value={rental.returnLabel} />
          <DetailRow
            label="Duration"
            value={rental.durationDays === 1 ? '1 day (24h)' : `${rental.durationDays} days`}
          />
          <DetailRow
            label="Quantity"
            value={`${rental.quantity} unit${rental.quantity !== 1 ? 's' : ''}`}
          />

          <View style={s.divider} />

          <DetailRow label="Rate"          value={`${rental.pricePerDay.toLocaleString('en-US')} LAK / day`} />
          <View style={dr.row}>
            <Text style={dr.label}>Subtotal</Text>
            <PriceLak lak={rental.subtotal} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={dr.value} style={{ alignItems: 'flex-end' }} />
          </View>
          {rental.couponApplied && (
            <DetailRow
              label="Coupon applied"
              value={`−${rental.couponApplied.discountAmount.toLocaleString('en-US')} LAK (${rental.couponApplied.percent}% off)`}
              muted
            />
          )}
          <View style={dr.row}>
            <Text style={dr.label}>Total paid</Text>
            <PriceLak lak={rental.total} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={[dr.value, dr.valueBold]} style={{ alignItems: 'flex-end' }} bold />
          </View>
          <DetailRow label="Deposit (refundable)" value={depositDisplay} muted />
        </View>

        {/* ── Deposit note ── */}
        <Text style={s.depositNote}>
          Deposit is collected in store at pick-up and refunded on the spot when you return the item, once it's inspected (about 10 minutes).
        </Text>

        {/* ── Ref ID ── */}
        <Text style={s.refId}>Ref: {rental.id}</Text>

        {/* ── Pick-up location ── */}
        <Text style={s.sectionLabel}>PICK-UP LOCATION</Text>
        <View style={s.locationCard}>
          <View style={s.locationIcon}>
            <Feather name="map-pin" size={18} color={COLORS.carbon} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.locationTitle}>{shop.name}</Text>
            <Text style={s.locationSub}>{shop.addressLine}, {shop.city}</Text>
            <Text style={s.locationSub}>{shop.hours}</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(buildMapsUrl(shop))}
              activeOpacity={0.7}
              style={s.directionsBtn}
            >
              <Feather name="map" size={13} color={COLORS.carbon} />
              <Text style={s.directionsBtnText}>Get directions</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Notes ── */}
        {!!rental.notes && (
          <>
            <Text style={s.sectionLabel}>NOTES</Text>
            <View style={s.notesCard}>
              <Text style={s.notesText}>{rental.notes}</Text>
            </View>
          </>
        )}

        {/* ── Checklists ── */}
        {rental.handoverChecklist?.confirmedAt && (
          <View style={{ marginBottom: 12 }}>
            <ChecklistSummary checklist={rental.handoverChecklist} title="Handover checklist" />
          </View>
        )}
        {rental.returnChecklist?.confirmedAt && (
          <View style={{ marginBottom: 12 }}>
            <ChecklistSummary checklist={rental.returnChecklist} title="Return checklist" />
          </View>
        )}

        {/* ── Settlement summary ── */}
        {settlementVisible && (
          <View style={{ marginBottom: 12 }}>
            <SettlementSummary
              chargeAmount={rental.chargeAmount}
              chargeReason={rental.chargeReason}
              lateChargeAmount={rental.lateChargeAmount}
              lateChargeReason={rental.lateChargeReason}
              depositAmount={handoverDeposit?.depositAmount ?? rental.deposit}
              depositCurrency={rental.chargeCurrency!}
              depositAppliedToCharge={rental.depositAppliedToCharge ?? 0}
              outstandingBalance={rental.outstandingBalance ?? 0}
              outstandingSettled={rental.outstandingSettled}
              outstandingSettledBy={rental.outstandingSettledBy}
              outstandingWrittenOff={rental.outstandingWrittenOff}
              outstandingWrittenOffBy={rental.outstandingWrittenOffBy}
            />
          </View>
        )}

        {/* ── Receipt link ── */}
        {rental.status === 'returned' && rental.returnFinalizedAt && (
          <TouchableOpacity
            style={s.receiptLink}
            onPress={() => router.push(`/rentals/${rental.id}/receipt`)}
            activeOpacity={0.75}
          >
            <Feather name="file-text" size={15} color={COLORS.carbon} />
            <Text style={s.receiptLinkText}>View receipt</Text>
            <Feather name="chevron-right" size={15} color={COLORS.fg3} />
          </TouchableOpacity>
        )}

        {/* ── Cancel section ── */}
        {isCancellable && (
          <View style={s.cancelSection}>
            {cancelError && (
              <View style={s.cancelErrorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={s.cancelErrorText}>{cancelError}</Text>
              </View>
            )}

            {cancelPhase === 'idle' && (
              <>
                <TouchableOpacity
                  style={s.cancelLink}
                  onPress={() => setCancelPhase(cancelTier === 'free' ? 'confirm' : 'terms')}
                  activeOpacity={0.7}
                >
                  <Feather name="x-circle" size={14} color={COLORS.danger} />
                  <Text style={s.cancelLinkText}>Cancel this rental</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cancelLink}
                  onPress={() => router.push('/legal/cancellation')}
                  activeOpacity={0.7}
                >
                  <Feather name="file-text" size={14} color={COLORS.fg3} />
                  <Text style={[s.cancelLinkText, { color: COLORS.fg3 }]}>View cancellation policy</Text>
                </TouchableOpacity>
              </>
            )}

            {cancelPhase === 'confirm' && (
              <View style={s.cancelCard}>
                <Text style={s.cancelCardTitle}>Cancel this rental?</Text>
                <Text style={s.cancelCardBody}>
                  Free cancellation — your pickup is more than 48 hours away. No charges apply.
                </Text>
                <View style={s.cancelBtnRow}>
                  <TouchableOpacity style={s.cancelKeepBtn} onPress={() => setCancelPhase('idle')} activeOpacity={0.8}>
                    <Text style={s.cancelKeepText}>Keep it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cancelConfirmBtn, cancelling && s.cancelBtnOff]}
                    onPress={handleCancel}
                    disabled={cancelling}
                    activeOpacity={0.8}
                  >
                    {cancelling
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.cancelConfirmText}>Cancel rental</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {cancelPhase === 'terms' && (
              <View style={s.cancelCard}>
                <View style={s.cancelWarningRow}>
                  <Feather
                    name={cancelTier === 'premium' ? 'info' : 'alert-triangle'}
                    size={14}
                    color={
                      cancelTier === 'no_refund' ? COLORS.danger
                      : cancelTier === 'premium'  ? COLORS.fg2
                      : '#854F0B'
                    }
                  />
                  <Text style={[
                    s.cancelWarningTitle,
                    cancelTier === 'no_refund' && { color: COLORS.danger },
                  ]}>
                    {cancelTier === 'voucher'  ? 'No cash refund — store credit applies'
                    : cancelTier === 'premium' ? 'Non-refundable — premium equipment'
                    : 'No refund or voucher'}
                  </Text>
                </View>
                {cancelTier === 'premium' ? (
                  <Text style={s.cancelCardBody}>
                    This is a premium item. Per cancellation policy, the advance payment is
                    non-refundable regardless of cancellation date. No refund or store credit applies.
                  </Text>
                ) : cancelTier === 'voucher' ? (
                  <Text style={s.cancelCardBody}>
                    Your pickup is 24–48 hours away. Per cancellation policy, no cash refund applies.
                    You will receive a store credit voucher equal to your advance payment, valid 6 months
                    from the date of cancellation. The voucher is nominative and non-transferable.
                  </Text>
                ) : (
                  <Text style={s.cancelCardBody}>
                    Your pickup is less than 24 hours away. Per cancellation policy, no refund or store
                    credit applies. The advance payment is retained by LANCHAI.
                  </Text>
                )}
                <TouchableOpacity
                  style={s.cancelPolicyLink}
                  onPress={() => router.push('/legal/cancellation')}
                  activeOpacity={0.7}
                >
                  <Feather name="file-text" size={13} color={COLORS.fg3} />
                  <Text style={s.cancelPolicyLinkText}>Read full cancellation policy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cancelAgreeRow}
                  onPress={() => setCancelAgreed(v => !v)}
                  activeOpacity={0.75}
                >
                  <View style={[s.cancelCheckbox, cancelAgreed && s.cancelCheckboxChecked]}>
                    {cancelAgreed && <Feather name="check" size={11} color={COLORS.carbon} />}
                  </View>
                  <Text style={s.cancelAgreeText}>
                    I have read and accept the cancellation terms
                  </Text>
                </TouchableOpacity>
                <View style={s.cancelBtnRow}>
                  <TouchableOpacity
                    style={s.cancelKeepBtn}
                    onPress={() => { setCancelPhase('idle'); setCancelAgreed(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.cancelKeepText}>Keep it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cancelConfirmBtn, (!cancelAgreed || cancelling) && s.cancelBtnOff]}
                    onPress={handleCancel}
                    disabled={!cancelAgreed || cancelling}
                    activeOpacity={0.8}
                  >
                    {cancelling
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.cancelConfirmText}>Cancel rental</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Cancelled banner ── */}
        {rental.status === 'cancelled' && (
          <View style={s.cancelledBanner}>
            <Feather name="x-circle" size={14} color={COLORS.fg3} />
            <Text style={s.cancelledBannerText}>This rental has been cancelled.</Text>
          </View>
        )}

        {/* ── Claim status ── */}
        {claims.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.sectionLabel}>YOUR REPORTS</Text>
            {claims.map(claim => {
              const st = CLAIM_STATUS_STYLE[claim.status];
              return (
                <View key={claim.id} style={s.claimCard}>
                  <View style={s.claimCardHeader}>
                    <Text style={s.claimCardType}>{CLAIM_TYPE_LABELS[claim.type]}</Text>
                    <View style={[s.claimStatusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.claimStatusBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={s.claimCardDescription}>{claim.description}</Text>
                  {!!claim.adminResponse && (
                    <View style={s.claimResponseBox}>
                      <Text style={s.claimResponseLabel}>Response from LANCHAI</Text>
                      <Text style={s.claimResponseText}>{claim.adminResponse}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Issues — report a problem or dispute a damage/loss charge ── */}
        {!hasOpenClaim && (
          <View style={s.cancelSection}>
            {hasDamageCharge && (rental.status === 'returned' || rental.status === 'lost') && (
              <TouchableOpacity
                style={s.issueLink}
                onPress={() => router.push(`/claim/${rental.id}?type=damage_not_caused`)}
                activeOpacity={0.7}
              >
                <Feather name="alert-triangle" size={14} color={COLORS.fg2} />
                <View style={{ flex: 1 }}>
                  <Text style={s.issueLinkText}>Dispute this charge</Text>
                  {!!rental.chargeReason && (
                    <Text style={s.issueLinkSub}>Charged for: {rental.chargeReason}</Text>
                  )}
                </View>
                <Feather name="chevron-right" size={14} color={COLORS.fg3} />
              </TouchableOpacity>
            )}
            {(rental.status === 'active' || rental.status === 'returned' || rental.status === 'lost') && (
              <TouchableOpacity
                style={s.cancelLink}
                onPress={() => router.push(`/claim/${rental.id}`)}
                activeOpacity={0.7}
              >
                <Feather name="flag" size={14} color={COLORS.fg3} />
                <Text style={[s.cancelLinkText, { color: COLORS.fg3 }]}>Report an issue</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── QR lightbox — outside ScrollView to cover full screen ── */}
      {lightbox && (
        <QRLightbox
          value={lightbox.value}
          label={lightbox.label}
          onClose={() => setLightbox(null)}
        />
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Rental details</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function DetailRow({
  label, value, bold, muted,
}: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={dr.row}>
      <Text style={dr.label}>{label}</Text>
      <Text style={[dr.value, bold && dr.valueBold, muted && dr.valueMuted]}>
        {value}
      </Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  valueBold: {
    fontSize: 15,
    fontWeight: '800',
  },
  valueMuted: {
    color: COLORS.fg3,
    fontWeight: '500',
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  // Content
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Product name
  productName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
    marginBottom: 10,
  },

  // Pick-up QR card
  qrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
    marginBottom: 4,
  },
  qrCardLeft: {
    flex: 1,
    gap: 4,
  },
  qrCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  qrCardHint: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
  },

  // Status badge
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  overdueBannerWrap: {
    gap: 6,
    marginBottom: 20,
  },
  penaltyNote: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
    lineHeight: 17,
  },

  // Recap card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 12,
  },
  receiptLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  receiptLinkText: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  divider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginVertical: 4,
  },

  // Deposit note
  depositNote: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    lineHeight: 17,
    marginBottom: 12,
  },

  // Ref ID
  refId: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    letterSpacing: 0.3,
    marginBottom: 28,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: COLORS.fg3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Location card
  locationCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  locationSub: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    lineHeight: 17,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: COLORS.amber,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  directionsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },

  // Notes
  notesCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
  },
  notesText: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.carbon,
    lineHeight: 20,
  },

  // Error
  errorBox: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.fg3,
  },

  // Claim status cards
  claimCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  claimCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claimCardType: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  claimStatusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  claimStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  claimCardDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 18,
  },
  claimResponseBox: {
    backgroundColor: COLORS.porcelain,
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  claimResponseLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: COLORS.fg3,
    textTransform: 'uppercase',
  },
  claimResponseText: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.carbon,
    lineHeight: 18,
  },

  // Issues section (report an issue / dispute a charge)
  issueLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 12,
    marginBottom: 8,
  },
  issueLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  issueLinkSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 1,
  },

  // Cancel section
  cancelSection: {
    marginTop: 20,
  },
  cancelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  cancelLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  cancelCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    gap: 10,
  },
  cancelCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  cancelCardBody: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 18,
  },
  cancelWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cancelWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#854F0B',
    letterSpacing: -0.1,
  },
  cancelBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cancelBullet: {
    fontSize: 14,
    color: COLORS.fg3,
    lineHeight: 18,
  },
  cancelBulletText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 18,
  },
  cancelPolicyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  cancelPolicyLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
    textDecorationLine: 'underline',
  },
  cancelAgreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 2,
  },
  cancelCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  cancelCheckboxChecked: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  cancelAgreeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg2,
    lineHeight: 18,
  },
  cancelBtnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 2,
  },
  cancelKeepBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  cancelKeepText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  cancelConfirmBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnOff: {
    backgroundColor: COLORS.softGray200,
  },
  cancelConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  cancelErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  cancelErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.softGray200,
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
  },
  cancelledBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
  },
});
