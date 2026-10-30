import React, { useState, useEffect, useCallback } from 'react';
import { DEFAULT_AUTO_REPLY } from '@/functions/src/shared/shop';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Switch,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { UI } from '@/components/account/ui';
import { getHomeConfig, saveHomeConfig, DEFAULT_BUDGET_THRESHOLD_LAK, BUDGET_THRESHOLD_LIMITS } from '@/lib/homeConfig';
import {
  SHOP_FALLBACK,
  saveShopInfo,
  normalizeWhatsappNumber,
  isValidWhatsappNumber,
  type ShopInfo,
} from '@/lib/shop';
import { DEFAULT_LATE_GRACE_HOURS } from '@/functions/src/shared/latePenalty';
import { parseHHMM, buildTimeSlots } from '@/utils/timeSlots';
import { getGraceHours, saveGraceHours } from '@/lib/latePolicy';
import EmailSettingsSection from '@/components/EmailSettingsSection';
import { getFeatureFlags, saveFeatureFlag, FEATURE_DEFAULTS, type FeatureFlags } from '@/lib/features';
import { getRetentionConfig, saveRetentionConfig, RETENTION_DEFAULTS } from '@/lib/residency';

interface Form {
  name: string;
  addressLine: string;
  city: string;
  hours: string;
  openTime: string;
  closeTime: string;
  lastPickupOffsetMin: string;
  whatsappNumber: string;
  paymentMethods: string;
  autoReplyText: string;
  /** "17.950063, 102.622828" — empty = Get directions falls back to the address search. */
  coordinates: string;
  graceHours: string;
}

/** "lat, lng" → numbers, or null when invalid. Bounds: Laos (with a margin). */
function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (latitude < 13.5 || latitude > 23 || longitude < 100 || longitude > 108) return null;
  return { latitude, longitude };
}

const toForm = (shop: ShopInfo, graceHours: number): Form => ({
  name:                shop.name,
  addressLine:         shop.addressLine,
  city:                shop.city,
  hours:               shop.hours,
  openTime:            shop.openTime,
  closeTime:           shop.closeTime,
  lastPickupOffsetMin: String(shop.lastPickupOffsetMin),
  whatsappNumber:      shop.whatsappNumber,
  paymentMethods:      shop.paymentMethods,
  autoReplyText:       shop.autoReplyText ?? DEFAULT_AUTO_REPLY,
  coordinates:         shop.latitude != null && shop.longitude != null ? `${shop.latitude}, ${shop.longitude}` : '',
  graceHours:          String(graceHours),
});

// Returns the first validation error, or null if the form can be saved.
function validate(f: Form): string | null {
  if (!f.name.trim() || !f.addressLine.trim() || !f.city.trim() || !f.hours.trim() || !f.paymentMethods.trim()) {
    return 'Shop name, address, city, opening hours text and payment methods are all required.';
  }
  const open  = parseHHMM(f.openTime);
  const close = parseHHMM(f.closeTime);
  if (open == null || close == null) return 'Opening and closing times must use the HH:MM format (e.g. 09:00).';
  if (close <= open) return 'Closing time must be after opening time.';
  const offset = Number(f.lastPickupOffsetMin);
  if (!Number.isInteger(offset) || offset < 0) return 'Last pick-up offset must be a whole number of minutes (0 or more).';
  if (close - offset < open) return 'Last pick-up offset is longer than the opening hours — no slot would be left.';
  const wa = normalizeWhatsappNumber(f.whatsappNumber);
  if (wa && !isValidWhatsappNumber(wa)) {
    return 'WhatsApp number must be in international format with the country code, e.g. 8562012345678.';
  }
  if (f.coordinates.trim() && !parseCoordinates(f.coordinates)) {
    return 'Map coordinates must be "latitude, longitude" in Laos, e.g. 17.950063, 102.622828 (copy them from Google Maps).';
  }
  const grace = Number(f.graceHours);
  if (f.graceHours.trim() === '' || !Number.isFinite(grace) || grace < 0 || grace >= 24) {
    return 'Grace period must be a number of hours from 0 to less than 24 (e.g. 2).';
  }
  return null;
}

function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  editable: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.fg3}
        keyboardType={keyboardType}
        autoCapitalize="none"
        editable={editable}
      />
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

// Launch flags (config/features) — saved on toggle, independent of the form's Save.
function FeatureFlagsSection() {
  const [flags, setFlags] = useState<FeatureFlags>(FEATURE_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getFeatureFlags().then(setFlags); }, []);
  const toggle = (key: keyof FeatureFlags, value: boolean) => {
    setFlags(f => ({ ...f, [key]: value }));
    setError(null);
    saveFeatureFlag(key, value).catch(() => {
      setFlags(f => ({ ...f, [key]: !value }));
      setError('Could not update. Please try again.');
    });
  };
  const rows: { key: keyof FeatureFlags; title: string; sub: string }[] = [
    { key: 'businessAccounts', title: 'Business accounts', sub: 'Shows the Individual / Business choice at sign-up and login. Existing business accounts keep working either way.' },
    { key: 'newsletter', title: 'News and offers opt-in', sub: 'Shows the newsletter consent toggle on the Notifications screen.' },
  ];
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Features</Text>
      {rows.map(r => (
        <View key={r.key} style={s.flagRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.flagTitle}>{r.title}</Text>
            <Text style={s.hint}>{r.sub}</Text>
          </View>
          <Switch
            value={flags[r.key]}
            onValueChange={v => toggle(r.key, v)}
            trackColor={{ false: COLORS.softGray200, true: COLORS.amber }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}
      {error && <Text style={s.flagError}>{error}</Text>}
    </View>
  );
}

// Retention of ID / residency documents (config/residency) — read by the daily
// documentRetentionDaily job. Own Save, independent of the shop form.
function RetentionSection() {
  const [days, setDays] = useState(String(RETENTION_DEFAULTS.proofRetentionDays));
  const [months, setMonths] = useState(String(RETENTION_DEFAULTS.idRetentionMonths));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getRetentionConfig().then(c => { setDays(String(c.proofRetentionDays)); setMonths(String(c.idRetentionMonths)); });
  }, []);
  const save = async () => {
    const d = Number(days);
    const m = Number(months);
    if (!Number.isInteger(d) || d < 1 || d > 365 || !Number.isInteger(m) || m < 1 || m > 60) {
      setError('Days: 1 to 365. Months: 1 to 60.');
      return;
    }
    setError(null);
    setStatus('saving');
    try {
      await saveRetentionConfig({ proofRetentionDays: d, idRetentionMonths: m });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Document retention</Text>
      <Field
        label="Proof of residence and declined documents (days)"
        hint="Deleted this many days after our decision. A never-rented renter's ID follows the same delay after upload."
        value={days}
        onChangeText={t => { setDays(t); setStatus('idle'); }}
        keyboardType="number-pad"
        editable={status !== 'saving'}
      />
      <Field
        label="ID document after the last rental (months)"
        hint="Kept while a rental is in progress, then deleted this many months after the last one. Nothing is deleted while a rental, balance, non-return, no-show or claim is open."
        value={months}
        onChangeText={t => { setMonths(t); setStatus('idle'); }}
        keyboardType="number-pad"
        editable={status !== 'saving'}
      />
      {error && <Text style={s.flagError}>{error}</Text>}
      {status === 'error' && <Text style={s.flagError}>Could not save. Please try again.</Text>}
      <TouchableOpacity style={s.retentionBtn} onPress={save} disabled={status === 'saving'} activeOpacity={0.85}>
        <Text style={s.retentionBtnText}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save retention'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Home settings (config/home) — the "Under X LAK a day" section. Own Save.
function HomeSection() {
  const [threshold, setThreshold] = useState(String(DEFAULT_BUDGET_THRESHOLD_LAK));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getHomeConfig().then(c => setThreshold(String(c.budgetThresholdLak)));
  }, []);
  const save = async () => {
    const v = Number(threshold.replace(/[\s,]/g, ''));
    if (!Number.isInteger(v) || v < BUDGET_THRESHOLD_LIMITS.min || v > BUDGET_THRESHOLD_LIMITS.max) {
      setError(`Between ${BUDGET_THRESHOLD_LIMITS.min.toLocaleString('en-US')} and ${BUDGET_THRESHOLD_LIMITS.max.toLocaleString('en-US')} LAK.`);
      return;
    }
    setError(null);
    setStatus('saving');
    try {
      await saveHomeConfig({ budgetThresholdLak: v });
      setThreshold(String(v));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Home</Text>
      <Field
        label="Budget section threshold (LAK per day)"
        hint={'Home shows "Under {this} LAK a day" with products whose 1-day price is at or below it.'}
        value={threshold}
        onChangeText={t => { setThreshold(t); setStatus('idle'); }}
        keyboardType="number-pad"
        editable={status !== 'saving'}
      />
      {error && <Text style={s.flagError}>{error}</Text>}
      {status === 'error' && <Text style={s.flagError}>Could not save. Please try again.</Text>}
      <TouchableOpacity style={s.retentionBtn} onPress={save} disabled={status === 'saving'} activeOpacity={0.85}>
        <Text style={s.retentionBtnText}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save home settings'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AdminShopSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading,    setLoading]    = useState(true);
  const [configured, setConfigured] = useState(false);
  const [form,       setForm]       = useState<Form>(toForm(SHOP_FALLBACK, DEFAULT_LATE_GRACE_HOURS));
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [saved,      setSaved]      = useState(false);
  // Weekly closing days (0 = Sunday), Vientiane — the Home "Open now" line only.
  const [closedDays, setClosedDays] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([getDoc(doc(db, 'config', 'shop')), getGraceHours()])
      .then(([snap, graceHours]) => {
        if (snap.exists()) setConfigured(true);
        const cd = snap.exists() ? (snap.data() as Partial<ShopInfo>).closedDays : undefined;
        setClosedDays(Array.isArray(cd) ? cd.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : []);
        setForm(toForm(
          snap.exists() ? { ...SHOP_FALLBACK, ...(snap.data() as Partial<ShopInfo>) } : SHOP_FALLBACK,
          graceHours,
        ));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof Form) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError(null);
    setSaved(false);
  };

  const formError = validate(form);
  const slots = formError ? null : buildTimeSlots(form.openTime, form.closeTime, Number(form.lastPickupOffsetMin));

  const handleSave = useCallback(async () => {
    const err = validate(form);
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      await saveShopInfo({
        name:                form.name.trim(),
        addressLine:         form.addressLine.trim(),
        city:                form.city.trim(),
        hours:               form.hours.trim(),
        openTime:            form.openTime.trim(),
        closeTime:           form.closeTime.trim(),
        lastPickupOffsetMin: Number(form.lastPickupOffsetMin),
        closedDays:          [...closedDays].sort((a, b) => a - b),
        whatsappNumber:      normalizeWhatsappNumber(form.whatsappNumber),
        paymentMethods:      form.paymentMethods.trim(),
        autoReplyText:       form.autoReplyText.trim() || DEFAULT_AUTO_REPLY,
        // Exact pin for "Get directions" (app + emails, shared mapsUrl); cleared → address search.
        ...(parseCoordinates(form.coordinates)
          ?? ({ latitude: deleteField(), longitude: deleteField() } as unknown as { latitude: number; longitude: number })),
      });
      await saveGraceHours(Number(form.graceHours));
      setForm(prev => ({ ...prev, whatsappNumber: normalizeWhatsappNumber(prev.whatsappNumber) }));
      setConfigured(true);
      setSaved(true);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form, closedDays]);

  const toggleDay = (d: number) => {
    setClosedDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
    setError(null);
    setSaved(false);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Shop settings</Text>
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
            {!configured && (
              <View style={s.infoBox}>
                <Feather name="info" size={13} color={COLORS.amber} />
                <Text style={s.infoText}>
                  Not set yet — the app is currently showing the default values below.
                  Save once to make them official.
                </Text>
              </View>
            )}

            <Text style={s.sectionLabel}>Shop</Text>
            <Field label="Shop name" value={form.name} onChangeText={set('name')} editable={!saving} />
            <Field label="Address" value={form.addressLine} onChangeText={set('addressLine')} editable={!saving} />
            <Field label="City" value={form.city} onChangeText={set('city')} editable={!saving} />
            <Field
              label="Opening hours (display text)"
              hint="Shown to renters as-is, e.g. “Daily 9:00–20:00”. Keep it consistent with the times below."
              value={form.hours}
              onChangeText={set('hours')}
              editable={!saving}
            />
            <Field
              label="Map coordinates (Get directions)"
              hint="Latitude, longitude — in Google Maps, long-press the shop's pin and copy the numbers shown (e.g. 17.950063, 102.622828). Empty = search by address."
              placeholder="17.950063, 102.622828"
              value={form.coordinates}
              onChangeText={set('coordinates')}
              keyboardType="numbers-and-punctuation"
              editable={!saving}
            />
            <Field
              label="Payment methods (shown in emails)"
              hint="Listed under “What to bring” in booking emails. Keep it consistent with the Terms of service."
              value={form.paymentMethods}
              onChangeText={set('paymentMethods')}
              editable={!saving}
            />
            <Field
              label="Chat auto-reply when closed"
              hint="Sent once per closed period when a renter writes outside opening hours. {open time} becomes “9:00”, “tomorrow at 9:00” or “Monday at 9:00”."
              value={form.autoReplyText}
              onChangeText={set('autoReplyText')}
              editable={!saving}
            />

            <View style={s.section}>
              <Text style={s.sectionLabel}>Pick-up and return slots</Text>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Opens at"
                    placeholder="09:00"
                    value={form.openTime}
                    onChangeText={set('openTime')}
                    keyboardType="numbers-and-punctuation"
                    editable={!saving}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Closes at"
                    placeholder="20:00"
                    value={form.closeTime}
                    onChangeText={set('closeTime')}
                    keyboardType="numbers-and-punctuation"
                    editable={!saving}
                  />
                </View>
              </View>
              <Field
                label="Last pick-up before closing (minutes)"
                placeholder="30"
                value={form.lastPickupOffsetMin}
                onChangeText={set('lastPickupOffsetMin')}
                keyboardType="number-pad"
                editable={!saving}
              />
              <Text style={s.preview}>
                {slots && slots.length > 0
                  ? `Renters can pick ${slots[0]} to ${slots[slots.length - 1]}, every 30 min (${slots.length} slots).`
                  : 'Fix the times above to preview the slots.'}
              </Text>
              <Text style={[s.fieldLabel, { marginTop: 14 }]}>Closed days</Text>
              <View style={s.dayRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, d) => {
                  const on = closedDays.includes(d);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[UI.choice, on && UI.choiceOn]}
                      onPress={() => toggleDay(d)}
                      disabled={saving}
                      activeOpacity={0.75}
                    >
                      <Text style={[UI.choiceText, on && UI.choiceTextOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.hint}>
                Only drives the Home &quot;Open now / Closed today&quot; line. It does not block bookings on those days.
              </Text>
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>WhatsApp</Text>
              <Field
                label="WhatsApp number"
                hint="International format with country code, no “+” needed, e.g. 8562012345678. Leave empty to hide every WhatsApp button in the app."
                placeholder="856XXXXXXXXXX"
                value={form.whatsappNumber}
                onChangeText={set('whatsappNumber')}
                keyboardType="phone-pad"
                editable={!saving}
              />
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>Late returns</Text>
              <Field
                label="Grace period (hours)"
                hint="Internal only — never shown to renters. Within this delay after the scheduled return time, no late penalty is suggested. Tiers (1 / 1.5 / 2 days) are still counted from the scheduled return time."
                placeholder="2"
                value={form.graceHours}
                onChangeText={set('graceHours')}
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>

            {!!error && (
              <View style={s.errBox}>
                <Feather name="alert-circle" size={13} color={COLORS.danger} />
                <Text style={s.errText}>{error}</Text>
              </View>
            )}
            {saved && (
              <View style={s.successBox}>
                <Feather name="check-circle" size={13} color={COLORS.success} />
                <Text style={s.successText}>Shop settings saved.</Text>
              </View>
            )}

            <TouchableOpacity style={s.primaryBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving
                ? <ActivityIndicator size="small" color={COLORS.carbon} />
                : <Text style={s.primaryBtnText}>Save</Text>}
            </TouchableOpacity>

            <FeatureFlagsSection />

            <HomeSection />
            <RetentionSection />

            <EmailSettingsSection />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flagRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  flagTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  flagError: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginBottom: 8 },
  retentionBtn: {
    height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.carbon, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  retentionBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.carbon },
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

  section: {
    marginTop: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
  },
  hint: { fontSize: 11.5, fontWeight: '500', color: COLORS.fg3, marginTop: 5, lineHeight: 16 },
  preview: { fontSize: 12, fontWeight: '600', color: COLORS.fg2, marginBottom: 4 },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginTop: 16,
  },
  errText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.danger, lineHeight: 17 },

  successBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12, marginTop: 16,
  },
  successText: { flex: 1, fontSize: 12, fontWeight: '500', color: '#065F46', lineHeight: 17 },

  primaryBtn: {
    height: 50, borderRadius: 14,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 20,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
});
