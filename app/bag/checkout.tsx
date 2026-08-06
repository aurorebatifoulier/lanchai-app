import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import {
  addReservationBatch,
  getProduct,
  getUserProfile,
  newOrderId,
  type UserProfile,
  type LoyaltyCoupon,
} from '@/lib/firestore';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { clearBag, listenBagItems, BagItem } from '@/lib/bag';
import { sendNotif } from '@/lib/notifications';
import { PaymentAtPickupBox } from '@/components/PaymentAtPickupBox';
import { Product } from '@/lib/mockData';
import { getEffectiveRate, billableDaysFromDates, fmtReservationLabel } from '@/utils/pricing';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { useLoyaltyConfig, depositPercentFor } from '@/lib/loyalty';
import { PriceLak } from '@/components/PriceLak';
import { getProductAccessState } from '@/utils/productAccess';
import { needsBtobDocument } from '@/utils/btob';

// ── CheckoutItem ──────────────────────────────────────────────────────────────
// Derived locally from Firestore bag items + product data.
// Image URLs come directly from Firestore, bypassing expo-router param encoding.

interface CheckoutItem {
  bagItemId:    string;
  productId:    string;
  productName:  string;
  productImage: string | null;
  pickupAt:     number; // ms timestamp
  returnAt:     number; // ms timestamp
  durationDays: number;
  quantity:     number;
  pricePerDay:  number;
  subtotal:     number;
  deposit:      number;
  pickupLabel:  string;
  returnLabel:  string;
}

// Rounds so the per-item shares sum exactly to totalDiscount (remainder goes to the last item).
function prorateDiscount(items: CheckoutItem[], totalDiscount: number): number[] {
  const totalSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
  if (totalSubtotal <= 0) return items.map(() => 0);
  const shares = items.map(i => Math.round((totalDiscount * i.subtotal) / totalSubtotal));
  const allocated = shares.reduce((s, v) => s + v, 0);
  if (shares.length > 0) shares[shares.length - 1] += totalDiscount - allocated;
  return shares;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BagSummaryScreen() {
  const insets       = useSafeAreaInsets();
  const router       = useRouter();
  const { user }     = useAuth();
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const loyaltyConfig = useLoyaltyConfig();

  const [depositOpen, setDepositOpen] = useState(false);
  const [cancelPolicyOpen, setCancelPolicyOpen] = useState(false);
  const [agreed,      setAgreed]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [docRequired, setDocRequired] = useState(false);

  // ── Loyalty ──────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  // Business accounts are excluded from the loyalty program — never show or let them
  // apply a coupon, even one issued before the account became a business account.
  const unusedCoupons: LoyaltyCoupon[] = profile?.customerType === 'business'
    ? []
    : (profile?.coupons ?? []).filter(c => !c.used);
  const selectedCoupon = unusedCoupons.find(c => c.id === selectedCouponId) ?? null;

  // ── Bag data ────────────────────────────────────────────────────────────────
  const [rawItems,   setRawItems]   = useState<BagItem[]>([]);
  const [productMap, setProductMap] = useState<Record<string, Product | null>>({});
  const [loadingBag, setLoadingBag] = useState(true);
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setLoadingBag(false); return; }
    const unsub = listenBagItems(
      user.uid,
      items => { setRawItems(items); setLoadingBag(false); },
      () => setLoadingBag(false),
    );
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    rawItems.forEach(item => {
      if (fetchedIds.current.has(item.productId)) return;
      fetchedIds.current.add(item.productId);
      getProduct(item.productId)
        .then(p  => setProductMap(prev => ({ ...prev, [item.productId]: p })))
        .catch(() => setProductMap(prev => ({ ...prev, [item.productId]: null })));
    });
  }, [rawItems]);

  // ── Derive checkout items (same logic as bag.tsx handleCheckout) ─────────────
  const items = useMemo<CheckoutItem[]>(() => {
    if (exchangeRate == null) return [];
    return rawItems.flatMap(raw => {
      if (!raw.pickupAt || !raw.returnAt) return [];
      const product = productMap[raw.productId];
      if (!product) return [];
      const pickupDate = raw.pickupAt.toDate();
      const returnDate = raw.returnAt.toDate();
      if (returnDate.getTime() <= pickupDate.getTime()) return [];
      if (getProductAccessState(product, profile?.loyaltyTier ?? null).locked) return []; // now restricted — never create a reservation for this item
      const days = billableDaysFromDates(pickupDate, returnDate);
      const rateUsd = getEffectiveRate(product, days);
      if (rateUsd === null) return []; // unpriced — never create a reservation for this item
      const rateLak = toLak(rateUsd, exchangeRate);
      const depositPercent = depositPercentFor(profile?.customerType, profile?.loyaltyTier, loyaltyConfig);
      const depositLak = Math.round(toLak(product.deposit, exchangeRate) * depositPercent / 100);
      return [{
        bagItemId:    raw.id,
        productId:    raw.productId,
        productName:  raw.productName,
        productImage: raw.productImage, // URL direct from Firestore — no param encoding
        pickupAt:     pickupDate.getTime(),
        returnAt:     returnDate.getTime(),
        durationDays: days,
        quantity:     raw.quantity,
        pricePerDay:  rateLak,
        subtotal:     rateLak * days * raw.quantity,
        deposit:      depositLak,
        pickupLabel:  fmtReservationLabel(pickupDate),
        returnLabel:  fmtReservationLabel(returnDate),
      }];
    });
  }, [rawItems, productMap, exchangeRate, profile, loyaltyConfig]);

  const totalRental  = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalDeposit = items.reduce((sum, i) => sum + i.deposit, 0);
  const discountAmount = selectedCoupon ? Math.round((totalRental * selectedCoupon.percent) / 100) : 0;
  const finalTotal = totalRental - discountAmount;
  const perItemDiscount = selectedCoupon ? prorateDiscount(items, discountAmount) : items.map(() => 0);

  // ── Confirm ──────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!agreed || submitting || items.length === 0) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Please sign in to confirm your reservation.');
      return;
    }
    if (needsBtobDocument(profile)) {
      setDocRequired(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setDocRequired(false);
    try {
      // Phone guard — same as single-item flow. Also doubles as the freshest read of
      // the renter's coupons for the mark-used write below.
      const profileAtSubmit = await getUserProfile(currentUser.uid);
      if (!profileAtSubmit?.phoneNumber && !profileAtSubmit?.phone) {
        setError('A phone number is required to book. Go to Account → Personal info to add one.');
        setSubmitting(false);
        return;
      }

      const orderId    = await newOrderId();
      const renterName = currentUser.displayName || currentUser.email || null;

      await addReservationBatch(
        items.map((item, i) => ({
          productId:    item.productId,
          productName:  item.productName,
          productImage: item.productImage,
          renterId:     currentUser.uid,
          renterName,
          pickupAt:     new Date(item.pickupAt),
          returnAt:     new Date(item.returnAt),
          pickupLabel:  item.pickupLabel,
          returnLabel:  item.returnLabel,
          durationDays: item.durationDays,
          quantity:     item.quantity,
          pricePerDay:  item.pricePerDay,
          subtotal:     item.subtotal,
          total:        item.subtotal - perItemDiscount[i],
          deposit:      item.deposit,
          currency:     'LAK' as const,
          notes:        '',
          status:       'pending_payment' as const,
          ...(selectedCoupon
            ? { couponApplied: { id: selectedCoupon.id, percent: selectedCoupon.percent, discountAmount: perItemDiscount[i] } }
            : {}),
        })),
        orderId,
      );

      // Mark the coupon used at creation time — permanent even if the order is later
      // cancelled. orderId (not a single reservation id) is stored since one coupon can
      // span N reservation docs in a multi-item order.
      if (selectedCoupon) {
        const updatedCoupons = (profileAtSubmit.coupons ?? []).map(c =>
          c.id === selectedCoupon.id
            ? { ...c, used: true, usedAt: Timestamp.now(), usedOnReservationId: orderId }
            : c,
        );
        updateDoc(doc(db, 'users', currentUser.uid), { coupons: updatedCoupons }).catch(() => {});
      }

      // Clear the bag — fire and forget
      clearBag(currentUser.uid).catch(() => {});

      // Consolidated notification for the whole order
      sendNotif(currentUser.uid, {
        type:      'rental',
        icon:      'clock',
        iconColor: '#F4B400',
        title:     'Reservation request sent',
        body:      items.length === 1
          ? `Your booking for ${items[0].productName} is pending confirmation.`
          : `${items.length} items reserved. We'll confirm your order shortly.`,
        deepLink: '/(tabs)/reservations',
      });

      router.replace({
        pathname: '/booking/confirmation',
        params: { orderId },
      });
    } catch {
      setError('Could not submit your reservation. Please try again.');
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  const loadingProducts = rawItems.some(item => productMap[item.productId] === undefined);
  const isLoading       = loadingBag || loadingProducts;

  const header = (
    <View style={s.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={s.headerTitle}>Summary</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        {header}
        <View style={s.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {header}
        <View style={s.centered}>
          <Text style={s.emptyText}>No items to check out.</Text>
        </View>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Item cards ── */}
        <Text style={s.sectionLabel}>
          {items.length} item{items.length !== 1 ? 's' : ''} in your order
        </Text>

        {items.map(item => (
          <ItemCard key={item.bagItemId} item={item} customerType={profile?.customerType} vatPercent={vatPercent} />
        ))}

        {/* ── Cost breakdown ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Cost breakdown</Text>

          <View style={s.row}>
            <Text style={s.rowLabel}>Rental fees</Text>
            <PriceLak lak={totalRental} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={s.rowValue} style={{ alignItems: 'flex-end' }} />
          </View>
          <View style={s.row}>
            <Text style={[s.rowLabel, s.rowLabelMuted]}>Deposits (refundable)</Text>
            <PriceLak lak={totalDeposit} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={[s.rowValue, s.rowValueMuted]} style={{ alignItems: 'flex-end' }} />
          </View>

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
                'Collected in cash at pick-up, alongside the rental fee.',
                'Fully refunded within 48h after the item is returned in good condition.',
                'Part or all of the deposit may be kept if the item is returned late, damaged, or with missing accessories.',
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
                'More than 48 hours before pickup: full refund of your advance.',
                'Between 24 and 48 hours before pickup: your advance becomes a non-transferable credit for a future rental.',
                'Less than 24 hours before pickup, or no-show: the advance is not refunded.',
                'Premium items may be non-refundable regardless of cancellation date.',
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

          {unusedCoupons.length > 0 && (
            <>
              <View style={s.divider} />
              <View style={s.couponSection}>
                <Text style={s.couponSectionLabel}>Apply a coupon</Text>
                {unusedCoupons.map(c => {
                  const selected = c.id === selectedCouponId;
                  const savings = Math.round((totalRental * c.percent) / 100);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.couponCard, selected && s.couponCardSelected]}
                      onPress={() => setSelectedCouponId(selected ? null : c.id)}
                      activeOpacity={0.75}
                    >
                      <View style={s.couponPercentBox}>
                        <Text style={s.couponPercentText}>{c.percent}%</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.couponCardTitle}>{c.percent}% off</Text>
                        <Text style={s.couponCardSub}>Save {savings.toLocaleString('en-US')} LAK</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
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
          <View style={s.row}>
            <Text style={[s.rowLabel, s.rowLabelBold]}>Total to pay</Text>
            <PriceLak lak={finalTotal} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={[s.rowValue, s.rowValueBold]} style={{ alignItems: 'flex-end' }} />
          </View>
          <Text style={s.totalNote}>
            + {totalDeposit.toLocaleString('en-US')} LAK deposit, refunded within 48h after return
          </Text>
        </View>

        {/* ── Payment info ── */}
        <PaymentAtPickupBox />

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

        {/* ── Business document required ── */}
        {docRequired && (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={s.errorText}>
                Please upload your business registration document before booking.
                You can do this in your account settings.
              </Text>
              <TouchableOpacity
                onPress={() => { setDocRequired(false); router.push('/profile/business-document'); }}
                activeOpacity={0.7}
                style={{ marginTop: 6 }}
              >
                <Text style={s.errorLink}>Go to settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Error ── */}
        {error ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Footer CTA ── */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[s.cta, (!agreed || submitting) && s.ctaOff]}
          onPress={handleConfirm}
          disabled={!agreed || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color={COLORS.carbon} />
              <Text style={s.ctaText}>Confirming…</Text>
            </>
          ) : (
            <Text style={[s.ctaText, !agreed && s.ctaTextOff]}>
              Confirm reservation
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ItemCard({ item, customerType, vatPercent }: { item: CheckoutItem; customerType?: string | null; vatPercent: number | null }) {
  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.itemTop}>
        {item.productImage ? (
          <Image source={{ uri: item.productImage }} style={s.thumb} contentFit="cover" />
        ) : (
          <View style={[s.thumb, s.thumbPlaceholder]}>
            <Feather name="image" size={16} color={COLORS.softGray} />
          </View>
        )}
        <Text style={s.itemName} numberOfLines={2}>{item.productName}</Text>
      </View>

      <View style={s.divider} />

      {/* Dates */}
      <View style={s.itemDates}>
        <DateLine label="Pick-up" value={item.pickupLabel} />
        <DateLine label="Return"  value={item.returnLabel} />
        <Text style={s.durationChip}>
          {item.durationDays} day{item.durationDays !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={s.divider} />

      {/* Qty + pricing */}
      <View style={s.itemPricing}>
        <PricingRow label="Quantity"             value={String(item.quantity)} />
        <PricingRow label="Rate"                 value={`${item.pricePerDay.toLocaleString('en-US')} LAK / day`} />
        <View style={s.pricingRow}>
          <Text style={[s.rowLabel, s.rowLabelMuted]}>Deposit (refundable)</Text>
          <PriceLak lak={item.deposit} customerType={customerType} vatPercent={vatPercent} textStyle={[s.rowValue, s.rowValueMuted]} style={{ alignItems: 'flex-end' }} />
        </View>
      </View>
    </View>
  );
}

function DateLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.dateLine}>
      <Text style={s.dateLineLabel}>{label}</Text>
      <Text style={s.dateLineValue}>{value}</Text>
    </View>
  );
}

// Compact variant used inside item cards (no extra horizontal padding, tighter vertical)
function PricingRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={s.pricingRow}>
      <Text style={[s.rowLabel, muted && s.rowLabelMuted]}>{label}</Text>
      <Text style={[s.rowValue, muted && s.rowValueMuted]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.fg3,
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
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },

  // Content
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg3,
    paddingHorizontal: 4,
    marginBottom: 2,
  },

  // Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },

  // Item card sub-sections
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    lineHeight: 19,
  },
  itemDates: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateLineLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    width: 44,
  },
  dateLineValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  durationChip: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
    marginTop: 4,
  },
  itemPricing: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginHorizontal: 14,
  },

  // Rows (used inside cards)
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
  },
  rowLabelMuted: {
    color: COLORS.fg3,
  },
  rowLabelBold: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  rowNote: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.fg3,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  rowValueBold: {
    fontSize: 15,
    fontWeight: '800',
  },
  rowValueMuted: {
    color: COLORS.fg3,
    fontWeight: '500',
  },

  // Deposit accordion (inside cost breakdown card)
  depositAccordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
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
    marginHorizontal: 14,
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
  totalNote: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    paddingHorizontal: 14,
    paddingBottom: 10,
    marginTop: -4,
  },

  // Coupon selector — compact version of profile/loyalty.tsx's coupon cards
  couponSection: {
    paddingHorizontal: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  couponAppliedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#854F0B',
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
  errorLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },
  cta: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaOff: {
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  ctaTextOff: {
    color: COLORS.fg3,
  },
});
