import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { DEFAULT_REVIEW_REWARD_POINTS, type LoyaltyConfig } from '@/lib/loyalty';

function fmtDate(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export default function AdminLoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [config,  setConfig]  = useState<LoyaltyConfig | null>(null);

  const [silverThreshold,   setSilverThreshold]   = useState('');
  const [goldThreshold,     setGoldThreshold]     = useState('');
  const [platinumThreshold, setPlatinumThreshold] = useState('');
  const [silverPercent,     setSilverPercent]     = useState('');
  const [goldPercent,       setGoldPercent]       = useState('');
  const [platinumPercent,   setPlatinumPercent]   = useState('');
  const [businessDeposit,          setBusinessDeposit]          = useState('');
  const [residentDeposit,          setResidentDeposit]          = useState('');
  const [residentPlatinumDeposit,  setResidentPlatinumDeposit]  = useState('');
  const [touristDeposit,           setTouristDeposit]           = useState('');
  const [damagedChargePercent,     setDamagedChargePercent]     = useState('');
  const [reviewRewardPoints,       setReviewRewardPoints]       = useState(String(DEFAULT_REVIEW_REWARD_POINTS));

  const [saving,   setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'loyalty'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as LoyaltyConfig;
          setConfig(data);
          setSilverThreshold(String(data.thresholds.silver));
          setGoldThreshold(String(data.thresholds.gold));
          setPlatinumThreshold(String(data.thresholds.platinum));
          setSilverPercent(String(data.couponPercentByTier.silver));
          setGoldPercent(String(data.couponPercentByTier.gold));
          setPlatinumPercent(String(data.couponPercentByTier.platinum));
          setBusinessDeposit(String(data.depositPercentByType.business));
          setResidentDeposit(String(data.depositPercentByType.resident));
          setResidentPlatinumDeposit(String(data.depositPercentByType.residentPlatinum));
          setTouristDeposit(String(data.depositPercentByType.tourist));
          setDamagedChargePercent(String(data.damagedChargePercent ?? 60));
          setReviewRewardPoints(String(data.reviewRewardPoints ?? DEFAULT_REVIEW_REWARD_POINTS));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const nums = [
    silverThreshold, goldThreshold, platinumThreshold,
    silverPercent, goldPercent, platinumPercent,
    businessDeposit, residentDeposit, residentPlatinumDeposit, touristDeposit,
    damagedChargePercent, reviewRewardPoints,
  ].map(v => parseFloat(v));
  const allValid = nums.every(n => !isNaN(n) && n >= 0);
  const thresholdsOrdered =
    !isNaN(nums[0]) && !isNaN(nums[1]) && !isNaN(nums[2]) && nums[0] < nums[1] && nums[1] < nums[2];

  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (!allValid) {
      setSaveError('Enter valid numbers (0 or greater) in every field.');
      return;
    }
    if (!thresholdsOrdered) {
      setSaveError('Thresholds must increase: silver < gold < platinum.');
      return;
    }
    setSaving(true);
    try {
      const newConfig = {
        thresholds: {
          silver: parseFloat(silverThreshold),
          gold: parseFloat(goldThreshold),
          platinum: parseFloat(platinumThreshold),
        },
        couponPercentByTier: {
          silver: parseFloat(silverPercent),
          gold: parseFloat(goldPercent),
          platinum: parseFloat(platinumPercent),
        },
        depositPercentByType: {
          business: parseFloat(businessDeposit),
          resident: parseFloat(residentDeposit),
          residentPlatinum: parseFloat(residentPlatinumDeposit),
          tourist: parseFloat(touristDeposit),
        },
        damagedChargePercent: parseFloat(damagedChargePercent),
        reviewRewardPoints: Math.floor(parseFloat(reviewRewardPoints)),
      };
      await setDoc(doc(db, 'config', 'loyalty'), { ...newConfig, updatedAt: serverTimestamp() }, { merge: true });
      // Omit updatedAt locally — serverTimestamp() is an unresolved sentinel here, not a
      // real Timestamp, so it has no .toDate(). fmtDate(undefined) safely renders '—'
      // until the next real fetch resolves it (same pattern as exchange-rate.tsx).
      setConfig(newConfig as LoyaltyConfig);
      setSaved(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    allValid, thresholdsOrdered, silverThreshold, goldThreshold, platinumThreshold,
    silverPercent, goldPercent, platinumPercent,
    businessDeposit, residentDeposit, residentPlatinumDeposit, touristDeposit,
    damagedChargePercent, reviewRewardPoints,
  ]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Loyalty</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
        ) : (
          <>
            {!config && (
              <View style={s.infoBox}>
                <Feather name="info" size={13} color={COLORS.amber} />
                <Text style={s.infoText}>
                  Loyalty isn&apos;t set up yet. Renters earn 1 point per 10,000 LAK of rental
                  subtotal on every completed (returned) rental. Set tier thresholds and
                  coupon rewards below to activate it.
                </Text>
              </View>
            )}

            <Text style={s.sectionLabel}>Tier thresholds (points)</Text>
            <Text style={s.fieldLabel}>Silver</Text>
            <TextInput
              style={s.input} value={silverThreshold} onChangeText={t => { setSilverThreshold(t); setSaveError(null); }}
              placeholder="e.g. 500" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Gold</Text>
            <TextInput
              style={s.input} value={goldThreshold} onChangeText={t => { setGoldThreshold(t); setSaveError(null); }}
              placeholder="e.g. 1500" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Platinum</Text>
            <TextInput
              style={s.input} value={platinumThreshold} onChangeText={t => { setPlatinumThreshold(t); setSaveError(null); }}
              placeholder="e.g. 3500" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />

            <Text style={s.sectionLabel}>COUPON REWARD PER TIER (% OFF)</Text>
            <Text style={s.fieldLabel}>Silver</Text>
            <TextInput
              style={s.input} value={silverPercent} onChangeText={t => { setSilverPercent(t); setSaveError(null); }}
              placeholder="e.g. 5" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Gold</Text>
            <TextInput
              style={s.input} value={goldPercent} onChangeText={t => { setGoldPercent(t); setSaveError(null); }}
              placeholder="e.g. 10" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Platinum</Text>
            <TextInput
              style={s.input} value={platinumPercent} onChangeText={t => { setPlatinumPercent(t); setSaveError(null); }}
              placeholder="e.g. 15" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />

            <Text style={s.sectionLabel}>DEPOSIT BY CUSTOMER TYPE (%)</Text>
            <Text style={s.fieldLabel}>Business</Text>
            <TextInput
              style={s.input} value={businessDeposit} onChangeText={t => { setBusinessDeposit(t); setSaveError(null); }}
              placeholder="e.g. 0" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Resident (standard)</Text>
            <TextInput
              style={s.input} value={residentDeposit} onChangeText={t => { setResidentDeposit(t); setSaveError(null); }}
              placeholder="e.g. 70" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Resident (platinum tier)</Text>
            <TextInput
              style={s.input} value={residentPlatinumDeposit} onChangeText={t => { setResidentPlatinumDeposit(t); setSaveError(null); }}
              placeholder="e.g. 60" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />
            <Text style={s.fieldLabel}>Tourist</Text>
            <TextInput
              style={s.input} value={touristDeposit} onChangeText={t => { setTouristDeposit(t); setSaveError(null); }}
              placeholder="e.g. 100" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />

            <Text style={s.sectionLabel}>Damage assessment</Text>
            <Text style={s.fieldLabel}>Default &quot;Damaged&quot; charge (% of replacement value)</Text>
            <TextInput
              style={s.input} value={damagedChargePercent} onChangeText={t => { setDamagedChargePercent(t); setSaveError(null); }}
              placeholder="e.g. 60" placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />

            <Text style={s.sectionLabel}>Reviews</Text>
            <Text style={s.fieldLabel}>Points per review (any rating)</Text>
            <TextInput
              style={s.input} value={reviewRewardPoints} onChangeText={t => { setReviewRewardPoints(t); setSaveError(null); }}
              placeholder={`e.g. ${DEFAULT_REVIEW_REWARD_POINTS}`} placeholderTextColor={COLORS.fg3} keyboardType="number-pad"
            />

            {config && <Text style={s.updatedNote}>Updated {fmtDate(config.updatedAt)}</Text>}

            {!!saveError && (
              <View style={s.errBox}>
                <Feather name="alert-circle" size={13} color={COLORS.danger} />
                <Text style={s.errText}>{saveError}</Text>
              </View>
            )}
            {saved && (
              <View style={s.successBox}>
                <Feather name="check-circle" size={13} color={COLORS.success} />
                <Text style={s.successText}>Loyalty settings saved.</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color={COLORS.carbon} />
                : <Text style={s.primaryBtnText}>{config ? 'Save changes' : 'Activate'}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  content: { paddingHorizontal: 20, paddingTop: 24 },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.amberTint,
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.fg2, lineHeight: 17 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.4,
    color: COLORS.fg3, marginTop: 16, marginBottom: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
    marginBottom: 12,
  },

  updatedNote: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 4, marginBottom: 4 },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 12,
  },
  errText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.danger, lineHeight: 17 },

  successBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 12,
  },
  successText: { flex: 1, fontSize: 12, fontWeight: '500', color: '#065F46', lineHeight: 17 },

  primaryBtn: {
    height: 50, borderRadius: 14,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
});
