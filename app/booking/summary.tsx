import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import BookingHoldNotice from '@/components/BookingHoldNotice';
import { useBookingHold } from '@/lib/bookingHold';
import { auth } from '@/lib/auth';
import { createBooking, BookingError, getUserProfile, type UserProfile, type LoyaltyCoupon } from '@/lib/firestore';
import { useLoyaltyConfig, isLoyaltyExcluded } from '@/lib/loyalty';
import { couponPercentFor, orderDiscount } from '@/functions/src/shared/pricing';
import { sendNotif } from '@/lib/notifications';
import { PaymentAtPickupBox } from '@/components/PaymentAtPickupBox';
import { useAuth } from '@/contexts/AuthContext';
import { useVatPercent, DEFAULT_VAT_PERCENT } from '@/lib/exchangeRate';
import { splitHtVat, formatLakAmount } from '@/utils/currency';
import { BillingSummary } from '@/components/BillingSummary';
import { useMyIdentity } from '@/lib/identity';
import { IdRequirementStep } from '@/components/IdRequirementStep';

export default function BookingSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const vatPercent = useVatPercent();
  const params = useLocalSearchParams<{
    productId: string;
    productName: string;
    productImage: string;
    pickupDateISO: string;
    returnDateISO: string;
    pickupDateLabel: string;
    pickupTimeLabel: string;
    returnDateLabel: string;
    returnTimeLabel: string;
    billableDays: string;
    quantity: string;
    pricePerDay: string;
    subtotal: string;
    deposit: string;
    notes: string;
  }>();

  const billableDays = parseInt(params.billableDays ?? '1', 10);
  const quantity     = parseInt(params.quantity ?? '1', 10);
  const pricePerDay  = parseInt(params.pricePerDay ?? '0', 10);
  const subtotal     = parseInt(params.subtotal ?? '0', 10);
  const deposit      = parseInt(params.deposit ?? '0', 10);

  const [depositOpen, setDepositOpen] = useState(false);
  const [cancelPolicyOpen, setCancelPolicyOpen] = useState(false);
  const [agreed,      setAgreed]      = useState(false);
  const [confirming,  setConfirming]  = useState(false);
  const bookingHold = useBookingHold();
  const [error,       setError]       = useState<string | null>(null);

  // ── Loyalty coupon ───────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  // Excluded accounts (business/BtoB) never see or apply coupons. The % shown is the
  // CONFIG % for the coupon's tier — exactly what createReservations applies server-side
  // (never the percent stored on the renter's coupon).
  const loyaltyConfig = useLoyaltyConfig();
  const couponPct = (c: LoyaltyCoupon) => couponPercentFor(c.tier, loyaltyConfig);
  const unusedCoupons: LoyaltyCoupon[] = isLoyaltyExcluded(profile ?? {})
    ? []
    : (profile?.coupons ?? []).filter(c => !c.used && couponPct(c) > 0);
  const selectedCoupon = unusedCoupons.find(c => c.id === selectedCouponId) ?? null;
  const discountAmount = selectedCoupon ? orderDiscount([subtotal], couponPct(selectedCoupon)).total : 0;
  const finalTotal = subtotal - discountAmount;
  const vatPct = vatPercent ?? DEFAULT_VAT_PERCENT;
  const { ht: vatHt, vat: vatAmount } = splitHtVat(finalTotal, vatPct);

  // ID document required to rent: without one on file, "Confirm" opens the ID step
  // (add it now, or show it at the shop) and resumes here with the selection kept.
  const { identity } = useMyIdentity();
  const [idStepOpen, setIdStepOpen] = useState(false);

  const handleConfirm = async (opts: { idCheckAtCounter?: boolean; idJustAdded?: boolean } = {}) => {
    if (!agreed || confirming) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Please sign in to confirm your booking.');
      return;
    }
    if (identity?.status !== 'on_file' && !opts.idJustAdded && !opts.idCheckAtCounter) {
      setIdStepOpen(true);
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const profileAtSubmit = await getUserProfile(currentUser.uid);
      if (!profileAtSubmit?.phoneNumber && !profileAtSubmit?.phone) {
        setError('A phone number is required to book. Go to Account → Personal info to add one.');
        setConfirming(false);
        return;
      }

      // Server-side creation: every figure is recomputed and checked by the
      // createReservations callable (stock, slots, hold, coupon) — what's shown above is
      // a preview built with the same shared rules.
      const { orderId, reservationIds } = await createBooking({
        items: [{
          productId: params.productId ?? '',
          pickupAt:  new Date(params.pickupDateISO ?? ''),
          returnAt:  new Date(params.returnDateISO ?? ''),
          quantity,
        }],
        couponId: selectedCoupon?.id ?? null,
        idCheckAtCounter: opts.idCheckAtCounter === true && !opts.idJustAdded,
        notes:    params.notes ?? '',
      });
      const reservationId = reservationIds[0];

      sendNotif(currentUser.uid, {
        type:      'rental',
        icon:      'clock',
        iconColor: '#F4B400',
        title:     'Reservation request sent',
        body:      `Your booking for ${params.productName ?? 'this item'} is pending confirmation.`,
        deepLink:  `/rentals/${reservationId}`,
      });

      router.replace({
        pathname: '/booking/confirmation',
        params: { orderId },
      });
    } catch (err) {
      setError(err instanceof BookingError ? err.message : 'Could not confirm your booking. Please try again.');
      setConfirming(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <IdRequirementStep
        visible={idStepOpen}
        rejected={identity?.status === 'rejected'}
        onClose={() => setIdStepOpen(false)}
        onUploaded={() => { setIdStepOpen(false); handleConfirm({ idJustAdded: true }); }}
        onAtCounter={() => { setIdStepOpen(false); handleConfirm({ idCheckAtCounter: true }); }}
      />

      {/* ── Header ── */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {bookingHold && <BookingHoldNotice hold={bookingHold} style={{ marginBottom: 16 }} />}

        {/* ── Booking card ── */}
        <View style={s.card}>
          <Text style={s.productName}>{params.productName}</Text>

          <View style={s.divider} />

          <Row label="Pick-up"  value={`${params.pickupDateLabel} · ${params.pickupTimeLabel}`} />
          <Row label="Return"   value={`${params.returnDateLabel} · ${params.returnTimeLabel}`} />
          <Row
            label="Duration"
            value={billableDays === 1 ? '1 day (24h)' : `${billableDays} days`}
          />
          <Row label="Quantity" value={`${quantity} unit${quantity !== 1 ? 's' : ''}`} />
          <Row label="Rate"     value={`${pricePerDay.toLocaleString('en-US')} LAK / day`} />

          {unusedCoupons.length > 0 && (
            <View style={s.couponSection}>
              <Text style={s.couponSectionLabel}>Apply a coupon</Text>
              {unusedCoupons.map(c => {
                const selected = c.id === selectedCouponId;
                const savings = orderDiscount([subtotal], couponPct(c)).total;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.couponCard, selected && s.couponCardSelected]}
                    onPress={() => setSelectedCouponId(selected ? null : c.id)}
                    activeOpacity={0.75}
                  >
                    <View style={s.couponPercentBox}>
                      <Text style={s.couponPercentText}>{couponPct(c)}%</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.couponCardTitle}>{couponPct(c)}% off</Text>
                      <Text style={s.couponCardSub}>Save {savings.toLocaleString('en-US')} LAK</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {selectedCoupon && (
            <View style={s.couponAppliedRow}>
              <Feather name="tag" size={13} color="#854F0B" />
              <Text style={s.couponAppliedText}>
                Coupon applied: −{discountAmount.toLocaleString('en-US')} LAK
              </Text>
            </View>
          )}

          <View style={s.divider} />

          <BillingSummary
            subtotalHt={vatHt}
            vatAmount={vatAmount}
            vatPct={vatPercent}
            total={finalTotal}
            totalLabel="Total to pay"
            deposit={deposit}
            depositLabel="Deposit (refundable)"
          />
        </View>

        {params.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{params.notes}</Text>
          </View>
        ) : null}

        {/* ── Payment info (text-only — amounts shown above) ── */}
        <PaymentAtPickupBox />

        {/* ── Deposit / cancellation info ── */}
        <View style={s.card}>
          <TouchableOpacity
            style={s.depositAccordionRow}
            onPress={() => setDepositOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Feather name="info" size={13} color="#854F0B" />
            <Text style={s.depositAccordionLabel}>How does the deposit work?</Text>
            <Feather
              name="chevron-right"
              size={14}
              color="#854F0B"
              style={{ transform: [{ rotate: depositOpen ? '90deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {depositOpen && (
            <View style={s.depositExplain}>
              {[
                'The deposit is a refundable security amount, separate from your rental fee.',
                'Your rental fee is also collected in-store at pick-up.',
                'The deposit is collected in store when you pick up the item.',
                'It is refunded on the spot once you return the item and it\'s inspected (about 10 minutes).',
                'Part of it may be kept only if the item is returned damaged, incomplete, or late.',
              ].map((line, i) => (
                <View key={i} style={s.depositExplainRow}>
                  <Text style={s.depositExplainBullet}>·</Text>
                  <Text style={s.depositExplainText}>{line}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={s.depositAccordionRow}
            onPress={() => setCancelPolicyOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Feather name="info" size={13} color="#854F0B" />
            <Text style={s.depositAccordionLabel}>Cancellation policy</Text>
            <Feather
              name="chevron-right"
              size={14}
              color="#854F0B"
              style={{ transform: [{ rotate: cancelPolicyOpen ? '90deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {cancelPolicyOpen && (
            <View style={s.depositExplain}>
              {[
                // Reality at launch: nothing is charged before pick-up (no advance). The
                // full policy tiers live in lib/legalContent.ts (pending review).
                'Nothing is charged before pick-up — you pay in store when you collect your items.',
                'Free cancellation: cancel anytime before pick-up in the app (My rentals).',
                'Can’t make it? Please cancel so someone else can rent the item.',
              ].map((line, i) => (
                <View key={i} style={s.depositExplainRow}>
                  <Text style={s.depositExplainBullet}>·</Text>
                  <Text style={s.depositExplainText}>{line}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => router.push('/legal/cancellation')} activeOpacity={0.7}>
                <Text style={s.cancelPolicyFullLink}>Read full cancellation policy</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Terms checkbox ── */}
        <TouchableOpacity
          style={s.termsRow}
          onPress={() => setAgreed(v => !v)}
          activeOpacity={0.75}
        >
          <View style={[s.checkbox, agreed && s.checkboxChecked]}>
            {agreed && <Feather name="check" size={12} color={COLORS.carbon} />}
          </View>
          <Text style={s.termsText}>
            I agree to the{' '}
            <Text
              style={s.termsLink}
              onPress={() => router.push('/legal/terms')}
            >
              rental terms and conditions
            </Text>
          </Text>
        </TouchableOpacity>

        {/* ── Error ── */}
        {error ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Confirm button ── */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[s.confirmBtn, (!agreed || confirming || !!bookingHold) && s.confirmBtnOff]}
          onPress={() => handleConfirm()}
          disabled={!agreed || confirming || !!bookingHold}
          activeOpacity={0.85}
        >
          {confirming ? (
            <>
              <ActivityIndicator size="small" color={COLORS.carbon} />
              <Text style={s.confirmBtnText}>Confirming…</Text>
            </>
          ) : (
            <Text style={[s.confirmBtnText, !agreed && s.confirmBtnTextOff]}>
              Confirm booking
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      <Text style={[r.value, muted && r.valueMuted]}>{value}</Text>
    </View>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  valueMuted: {
    color: COLORS.fg3,
    fontWeight: '500',
  },
});

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
    paddingTop: 24,
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 16,
  },
  productName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    paddingBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginVertical: 4,
  },

  // Deposit disclosure
  depositAccordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginBottom: 4,
  },
  depositAccordionLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#854F0B',
  },
  depositExplain: {
    backgroundColor: COLORS.porcelain,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 6,
  },
  depositExplainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  depositExplainBullet: {
    fontSize: 14,
    color: COLORS.fg3,
    lineHeight: 20,
  },
  depositExplainText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.carbon,
    lineHeight: 18,
  },
  cancelPolicyFullLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
    textDecorationLine: 'underline',
    marginTop: 4,
  },


  // Coupon selector — compact version of profile/loyalty.tsx's coupon cards
  couponSection: {
    paddingVertical: 10,
  },
  couponSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    marginBottom: 8,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.softGray200,
    padding: 10,
    marginBottom: 8,
  },
  couponCardSelected: {
    backgroundColor: COLORS.amberTint,
    borderColor: COLORS.amber,
  },
  couponPercentBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  couponPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  couponCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  couponCardSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 1,
  },
  couponAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  couponAppliedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#854F0B',
  },

  // Notes box
  notesBox: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.carbon,
    lineHeight: 20,
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
  },
  checkbox: {
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
  checkboxChecked: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
    lineHeight: 20,
  },
  termsLink: {
    color: COLORS.carbon,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
    lineHeight: 18,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: COLORS.porcelain,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },
  confirmBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnOff: {
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  confirmBtnTextOff: {
    color: COLORS.fg3,
  },
});
