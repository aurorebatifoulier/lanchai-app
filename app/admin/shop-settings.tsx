import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import {
  SHOP_FALLBACK,
  saveShopInfo,
  normalizeWhatsappNumber,
  isValidWhatsappNumber,
  type ShopInfo,
} from '@/lib/shop';
import { parseHHMM, buildTimeSlots } from '@/utils/timeSlots';

interface Form {
  name: string;
  addressLine: string;
  city: string;
  hours: string;
  openTime: string;
  closeTime: string;
  lastPickupOffsetMin: string;
  whatsappNumber: string;
}

const toForm = (shop: ShopInfo): Form => ({
  name:                shop.name,
  addressLine:         shop.addressLine,
  city:                shop.city,
  hours:               shop.hours,
  openTime:            shop.openTime,
  closeTime:           shop.closeTime,
  lastPickupOffsetMin: String(shop.lastPickupOffsetMin),
  whatsappNumber:      shop.whatsappNumber,
});

// Returns the first validation error, or null if the form can be saved.
function validate(f: Form): string | null {
  if (!f.name.trim() || !f.addressLine.trim() || !f.city.trim() || !f.hours.trim()) {
    return 'Shop name, address, city and opening hours text are all required.';
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

export default function AdminShopSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading,    setLoading]    = useState(true);
  const [configured, setConfigured] = useState(false);
  const [form,       setForm]       = useState<Form>(toForm(SHOP_FALLBACK));
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'shop'))
      .then(snap => {
        if (snap.exists()) {
          setConfigured(true);
          setForm(toForm({ ...SHOP_FALLBACK, ...(snap.data() as Partial<ShopInfo>) }));
        }
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
        whatsappNumber:      normalizeWhatsappNumber(form.whatsappNumber),
      });
      setForm(prev => ({ ...prev, whatsappNumber: normalizeWhatsappNumber(prev.whatsappNumber) }));
      setConfigured(true);
      setSaved(true);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form]);

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

  section: {
    marginTop: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },

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
