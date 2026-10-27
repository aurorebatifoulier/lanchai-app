import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { LOYALTY_COPY } from '@/constants/loyaltyCopy';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { TIER_LABELS, TIER_ORDER, type LoyaltyTierKey, type PaidTier } from '@/lib/loyalty';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import PressScale from '@/components/PressScale';

// Tier-up celebration (validated mockup) — shown once per tier, the first time the app
// sees users.loyaltyTier above users.celebratedTier (mounted in app/(tabs)/_layout.tsx).
// celebratedTier is written by the renter (allow-list: only their CURRENT tier) when the
// modal is closed; the server seeds it with the pre-credit tier on the first credit, and
// an account without it is initialised silently (never celebrates past tiers).
// Confetti: ~36 small Animated views (native driver) — no extra dependency, Expo Go OK.

const rank = (t: LoyaltyTierKey | null) => (t ? TIER_ORDER.indexOf(t) : 0);
const { width: W, height: H } = Dimensions.get('window');
const CONFETTI_COLORS = [SHADES.amber, SHADES.amberMid, SHADES.cream, SHADES.amberSoft];

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    x: Math.random() * W,
    size: 6 + Math.random() * 6,
    delay: Math.random() * 600,
    duration: 1800 + Math.random() * 1200,
    rotate: Math.random() * 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
    progress: new Animated.Value(0),
  })), []);
  useEffect(() => {
    Animated.parallel(pieces.map(p => Animated.timing(p.progress, {
      toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }))).start();
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', left: p.x, top: -20, width: p.size, height: p.round ? p.size : p.size * 0.6,
            borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color,
            opacity: p.progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, H * 0.75] }) },
              { rotate: p.progress.interpolate({ inputRange: [0, 1], outputRange: [`${p.rotate}deg`, `${p.rotate + 540}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function TierUpCelebration() {
  const router = useRouter();
  const { loading, excluded, tier, celebratedTier, config, isResident } = useMyLoyalty();
  const [closedFor, setClosedFor] = useState<LoyaltyTierKey | null>(null);
  const initialised = useRef(false);

  // Accounts without a baseline: set it to the current tier, silently (no retro party).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (loading || excluded || !uid || initialised.current || celebratedTier) return;
    initialised.current = true;
    if (tier !== 'bronze') updateDoc(doc(db, 'users', uid), { celebratedTier: tier }).catch(() => {});
  }, [loading, excluded, tier, celebratedTier]);

  const visible = !loading && !excluded && !!celebratedTier && tier !== 'bronze'
    && rank(tier) > rank(celebratedTier) && closedFor !== tier;
  if (!visible) return null;

  const paid = tier as PaidTier;
  const coupon = config?.couponPercentByTier?.[paid] ?? 0;
  const custom = config?.perksTextByTier?.[paid]?.trim();
  const dep = config?.depositPercentByType;
  const extra = custom
    || (paid === 'platinum' && isResident && dep && dep.residentPlatinum < dep.resident ? '+ a lower deposit' : null);

  const close = (goExplore: boolean) => {
    setClosedFor(tier);
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { celebratedTier: tier }).catch(() => {});
    if (goExplore) router.push('/explore');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Confetti />
          <View style={s.badge}><Feather name="award" size={56} color={SHADES.carbon} /></View>
          <Text style={s.title}>{LOYALTY_COPY.tierUpTitle(TIER_LABELS[tier])}</Text>
          <Text style={s.body}>{LOYALTY_COPY.tierUpBody}</Text>
          {(coupon > 0 || extra) && (
            <View style={s.unlocked}>
              <Text style={s.unlockedLabel}>{LOYALTY_COPY.tierUpUnlocked}</Text>
              {coupon > 0 && <Text style={s.coupon}>{LOYALTY_COPY.tierUpCoupon(coupon)}</Text>}
              {extra ? <Text style={s.extra}>{extra}</Text> : null}
            </View>
          )}
          <PressScale style={[UI.btnPrimary, s.cta]} onPress={() => close(true)} activeOpacity={0.85}>
            <Text style={UI.btnPrimaryText}>{LOYALTY_COPY.tierUpCta}</Text>
          </PressScale>
          <TouchableOpacity onPress={() => close(false)} hitSlop={10} style={{ marginTop: 16 }}>
            <Text style={s.later}>{LOYALTY_COPY.tierUpLater}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Carbon full-screen card + confetti kept; buttons, chips and text sizes aligned with the
// My Account design (components/account/ui.tsx), brand shades only.
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,30,30,0.6)', justifyContent: 'center', padding: 16 },
  sheet: {
    backgroundColor: SHADES.carbon, borderRadius: 24, paddingHorizontal: 24, paddingTop: 44, paddingBottom: 24,
    alignItems: 'center', overflow: 'hidden',
  },
  badge: { width: 120, height: 120, borderRadius: 60, backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: SHADES.cream, marginTop: 22, letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 15, fontWeight: '500', color: 'rgba(250,250,247,0.75)', textAlign: 'center', lineHeight: 22, marginTop: 8 },
  unlocked: { backgroundColor: SHADES.carbonSoft, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', marginTop: 22 },
  unlockedLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(250,250,247,0.7)' },
  coupon: { fontSize: 24, fontWeight: '800', color: SHADES.amber, marginTop: 4 },
  extra: { fontSize: 13, fontWeight: '500', color: 'rgba(250,250,247,0.75)', marginTop: 4, textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: 24 },
  later: { fontSize: 14, fontWeight: '700', color: 'rgba(250,250,247,0.65)' },
});
