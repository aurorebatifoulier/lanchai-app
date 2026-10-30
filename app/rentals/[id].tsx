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
import { discountOf } from '@/functions/src/shared/promo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, RowGroup, Row, IconCircle, useScreenInsets } from '@/components/account/ui';
import { getReservationById, cancelReservation, getUserProfile, RentalDoc, UserProfile } from '@/lib/firestore';
import { overdueSeverity, overdueLabel, overdueChipColors, renterLateFeeText } from '@/utils/overdue';
import { sendNotif } from '@/lib/notifications';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import WhatsAppButton from '@/components/WhatsAppButton';
import { useAuth } from '@/contexts/AuthContext';
import { useVatPercent } from '@/lib/exchangeRate';
import { QRThumb } from '@/components/QRThumb';
import { QRLightbox } from '@/components/QRLightbox';
import { ChecklistSummary } from '@/components/ChecklistSummary';
import { displayOrderId } from '@/utils/rentalDocs';
import { SettlementSummary } from '@/components/SettlementSummary';
import { PriceLak } from '@/components/PriceLak';
import { getClaimsForReservation, type ClaimDoc, type ClaimType, type ClaimStatus } from '@/lib/claims';
import PressScale from '@/components/PressScale';

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  damage_not_caused: "Damage I didn't cause",
  missing_accessory: 'Missing accessory',
  not_as_described:  'Item not as described',
  other:             'Other issue',
};

const CLAIM_STATUS_STYLE: Record<ClaimStatus, { label: string; color: string; bg: string }> = {
  open:       { label: 'Open',       color: SHADES.amberDeep,   bg: SHADES.amberLight },
  in_review:  { label: 'In review',  color: SHADES.carbonMuted, bg: SHADES.carbonLight },
  resolved:   { label: 'Resolved',   color: COLORS.success,     bg: '#E7F3EC' },
  rejected:   { label: 'Rejected',   color: COLORS.fg3,      bg: COLORS.softGray200 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type TabId = 'upcoming' | 'active' | 'history';


function getCategory(r: RentalDoc, now: number): TabId {
  if (r.status === 'returned' || r.status === 'no_show') return 'history';
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
  if (r.status === 'no_show') {
    return { label: 'Missed pick-up', color: COLORS.fg3, bg: COLORS.softGray200 };
  }
  if (cat === 'history') {
    return { label: 'Returned', color: SHADES.carbonMuted, bg: SHADES.carbonLight };
  }
  if (cat === 'active') {
    return { label: 'Active', color: COLORS.success, bg: '#E7F3EC' };
  }
  if (r.status === 'pending_payment') {
    return { label: 'Pending payment at pick-up', color: SHADES.amberDeep, bg: SHADES.amberLight };
  }
  return { label: 'Confirmed', color: COLORS.success, bg: '#E7F3EC' };
}

// ── Screen ────────────────────────────────────────────────────────────────────

const CANCEL_CONFIRM_TEXT = 'Free cancellation — nothing is charged before pick-up. You can book again anytime.';

export default function RentalDetailScreen() {
  const screen = useScreenInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const shop = useShopInfo();
  const { user } = useAuth();
  const vatPercent = useVatPercent();

  const [rental,  setRental]  = useState<RentalDoc | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const [cancelPhase,  setCancelPhase]  = useState<'idle' | 'confirm'>('idle');
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
      <View style={[s.root, screen.root]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  if (error || !rental) {
    return (
      <View style={[s.root, screen.root]}>
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
  // The renter always sees the CURRENT policy: free cancellation any time before
  // pick-up, nothing charged (Terms §8). The advance tiers stay in
  // shared/cancellation.ts only, for the day an advance exists.

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
    } catch {
      setCancelError('Could not cancel. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: screen.contentBottom }]}
      >
        {/* ── Product name + badge ── */}
        <Text style={s.productName}>{rental.productName}</Text>

        {isOverdue ? (() => {
          const sev = overdueSeverity(rental.returnAt);
          const { bg, border: bdr, fg: txt } = overdueChipColors(sev);
          return (
            <View style={s.overdueBannerWrap}>
              <View style={[s.badge, { backgroundColor: bg, borderColor: bdr, borderWidth: 1, marginBottom: 0 }]}>
                <Text style={[s.badgeText, { color: txt }]}>{overdueLabel(rental.returnAt)}</Text>
              </View>
              {(rental.latePenaltyAmount ?? 0) > 0 && (
                <Text style={s.penaltyNote}>
                  {renterLateFeeText(rental.latePenaltyAmount!, rental.latePenaltyDays)}
                </Text>
              )}
              {!!rental.nonReturnAt && (
                <>
                  <Text style={s.penaltyNote}>
                    This rental is now more than 72 hours overdue and is treated as a non-return. Your deposit may be kept and our contract procedure applies. Please contact us right away.
                  </Text>
                  <WhatsAppButton
                    variant="row"
                    message={`Hi LANCHAI, I'm contacting you about my overdue rental (reservation ID: ${rental.id}).`}
                  />
                </>
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
          {discountOf(rental) && (
            <DetailRow
              label={discountOf(rental)!.label}
              value={`−${discountOf(rental)!.amount.toLocaleString('en-US')} LAK`}
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
          Deposit is collected in store at pick-up and refunded on the spot when you return the item, once it&apos;s inspected (about 10 minutes).
        </Text>

        {/* ── Order number (LNC-…); nothing for legacy reservations ── */}
        {displayOrderId(rental) && <Text style={s.refId}>Order {displayOrderId(rental)}</Text>}

        {/* ── Pick-up location ── */}
        <Text style={s.sectionLabel}>Pick-up location</Text>
        <View style={s.locationCard}>
          <IconCircle icon={{ name: 'map-pin' }} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.locationTitle}>{shop.name}</Text>
            <Text style={s.locationSub}>{shop.addressLine}, {shop.city}</Text>
            <Text style={s.locationSub}>{shop.hours}</Text>
            <PressScale
              onPress={() => Linking.openURL(buildMapsUrl(shop))}
              activeOpacity={0.7}
              style={[UI.btnPrimary, s.directionsBtn]}
            >
              <Feather name="map" size={15} color={SHADES.carbon} />
              <Text style={UI.btnPrimaryText}>Get directions</Text>
            </PressScale>
          </View>
        </View>

        {/* ── Notes ── */}
        {!!rental.notes && (
          <>
            <Text style={s.sectionLabel}>Notes</Text>
            <View style={s.notesCard}>
              <Text style={s.notesText}>{rental.notes}</Text>
            </View>
          </>
        )}

        {/* ── Checklists ── */}
        {rental.handoverChecklist?.confirmedAt && (
          <View style={{ marginBottom: 12 }}>
            <ChecklistSummary checklist={rental.handoverChecklist} title="Pick-up checklist" audience="renter" />
          </View>
        )}
        {rental.returnChecklist?.confirmedAt && (
          <View style={{ marginBottom: 12 }}>
            <ChecklistSummary checklist={rental.returnChecklist} title="Return checklist" audience="renter" />
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
          <View style={{ marginBottom: 12 }}>
            <RowGroup>
              <Row icon={{ name: 'file-text' }} title="View receipt" onPress={() => router.push(`/rentals/${rental.id}/receipt`)} />
            </RowGroup>
          </View>
        )}

        {/* ── Cancel section ── */}
        {isCancellable && (
          <View style={s.cancelSection}>
            {cancelError && (
              <Text style={[UI.errorText, s.cancelErrorText]}>{cancelError}</Text>
            )}

            {cancelPhase === 'idle' && (
              <>
                <TouchableOpacity
                  style={s.cancelLink}
                  onPress={() => setCancelPhase('confirm')}
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
                  {CANCEL_CONFIRM_TEXT}
                </Text>
                <View style={s.cancelBtnRow}>
                  <TouchableOpacity style={s.cancelKeepBtn} onPress={() => setCancelPhase('idle')} activeOpacity={0.8}>
                    <Text style={UI.btnSecondaryText}>Keep it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cancelConfirmBtn, cancelling && s.cancelBtnOff]}
                    onPress={handleCancel}
                    disabled={cancelling}
                    activeOpacity={0.8}
                  >
                    {cancelling
                      ? <ActivityIndicator size="small" color={COLORS.danger} />
                      : <Text style={UI.dangerText}>Cancel rental</Text>
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

        {/* ── Missed pick-up banner (friendly, never accusatory) ── */}
        {rental.status === 'no_show' && (
          <View style={s.cancelledBanner}>
            <Feather name="calendar" size={14} color={COLORS.fg3} />
            <Text style={s.cancelledBannerText}>
              We missed you at pick-up, so this booking was released. Nothing to pay — message us to book again.
            </Text>
          </View>
        )}

        {/* ── Claim status ── */}
        {claims.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>Your reports</Text>
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

// My Account design (components/account/ui.tsx), brand shades; green / red only as
// small status chips (overdue chips: shared overdueChipColors).
const dr = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  label: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted },
  value: { fontSize: 14, fontWeight: '600', color: SHADES.carbon, textAlign: 'right', flexShrink: 1, marginLeft: 12 },
  valueBold: { fontSize: 15, fontWeight: '800' },
  valueMuted: { color: SHADES.carbonMuted, fontWeight: '500' },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD = { backgroundColor: SHADES.white, borderRadius: 18, borderWidth: 0.5, borderColor: SHADES.border } as const;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },

  content: { paddingHorizontal: 16, paddingTop: 20 },
  productName: { fontSize: 22, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.4, marginBottom: 10 },

  // Pick-up QR card
  qrCard: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginBottom: 4 },
  qrCardLeft: { flex: 1, gap: 2 },
  qrCardTitle: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  qrCardHint: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },

  // Status badge (small chip)
  badge: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 20 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  overdueBannerWrap: { gap: 6, marginBottom: 20 },
  penaltyNote: { fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },

  // Recap card
  card: { ...CARD, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12 },
  divider: { height: 0.5, backgroundColor: SHADES.border, marginVertical: 4 },

  depositNote: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 17, marginBottom: 12 },
  refId: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, marginBottom: 4 },

  // Section title (UI.sectionTitle)
  sectionLabel: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginTop: 24, marginBottom: 12 },

  // Location card
  locationCard: { ...CARD, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  locationTitle: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  locationSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 18 },
  directionsBtn: { marginTop: 12, height: 44 },

  // Notes
  notesCard: { ...CARD, padding: 16, marginBottom: 12 },
  notesText: { fontSize: 14, fontWeight: '500', color: SHADES.carbon, lineHeight: 20 },

  // Error
  errorBox: { alignItems: 'center', paddingTop: 64, gap: 12 },
  errorText: { fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted },

  // Claim status cards
  claimCard: { ...CARD, padding: 16, marginBottom: 10, gap: 8 },
  claimCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimCardType: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  claimStatusBadge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  claimStatusBadgeText: { fontSize: 12, fontWeight: '700' },
  claimCardDescription: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  claimResponseBox: { backgroundColor: SHADES.cream, borderRadius: 12, padding: 12, gap: 3 },
  claimResponseLabel: { fontSize: 12, fontWeight: '700', color: SHADES.carbonMuted },
  claimResponseText: { fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },

  // Issues section (report an issue / dispute a charge) — row style
  issueLink: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  issueLinkText: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  issueLinkSub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },

  // Cancel section
  cancelSection: { marginTop: 20 },
  cancelLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  cancelLinkText: { fontSize: 14, fontWeight: '700', color: COLORS.danger },
  cancelCard: { ...CARD, padding: 16, gap: 10 },
  cancelCardTitle: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
  cancelCardBody: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  cancelWarningRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cancelWarningTitle: { fontSize: 14, fontWeight: '800', color: SHADES.amberDeep },
  cancelBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cancelBullet: { fontSize: 14, color: SHADES.carbonMuted, lineHeight: 18 },
  cancelBulletText: { flex: 1, fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 18 },
  cancelPolicyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  cancelPolicyLinkText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon, textDecorationLine: 'underline' },
  cancelAgreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 2 },
  cancelCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbonFaint,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cancelCheckboxChecked: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  cancelAgreeText: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.carbon, lineHeight: 19 },
  cancelBtnRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  // Keep = secondary (white, carbon outline); confirm = destructive (white, red text).
  cancelKeepBtn: {
    flex: 1, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: SHADES.carbon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SHADES.white,
  },
  cancelConfirmBtn: {
    flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: SHADES.border,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnOff: { opacity: 0.45 },
  cancelErrorText: { marginBottom: 8, textAlign: 'center' },
  // Neutral info card (cancelled / missed pick-up) — no grey banner.
  cancelledBanner: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 20 },
  cancelledBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
});
