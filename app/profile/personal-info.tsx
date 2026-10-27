import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, RowGroup, Row, StatusChip, CheckLine, useScreenInsets } from '@/components/account/ui';
import { auth } from '@/lib/auth';
import { getUserProfile, saveUserProfile } from '@/lib/firestore';
import { getCustomerTypeConfig } from '@/utils/customerType';
import PressScale from '@/components/PressScale';

function isPhoneValid(p: string): boolean {
  return p.replace(/\D/g, '').length >= 6;
}

type SaveStatus = 'success' | 'error' | null;

// Spaces don't make a different number: "+856 20 1234 5678" == "+8562012345678".
const normalizePhone = (value: string) => value.replace(/\s+/g, '');

export default function PersonalInfoScreen() {
  const screen = useScreenInsets();
  const router = useRouter();

  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [phone,       setPhone]       = useState('');
  // Phone as stored (normalised) — phoneVerified is only reset when the number
  // actually changes; otherwise it isn't sent at all.
  const [savedPhone,  setSavedPhone]  = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [address,     setAddress]     = useState('');
  const [touched,     setTouched]     = useState({
    firstName: false, lastName: false, phone: false, whatsapp: false,
  });
  const [customerType, setCustomerType] = useState<string>('tourist');
  // Locked once an ID has been checked in person (users.idCheckedVersion set).
  const [nameLocked, setNameLocked] = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  // Opt-out for NON-essential emails only (pickup/return reminders). Confirmations,
  // cancellations, late-return alerts and receipts always go out.
  const [saveStatus,   setSaveStatus]   = useState<SaveStatus>(null);

  const lastNameRef  = useRef<TextInput>(null);
  const phoneRef     = useRef<TextInput>(null);
  const whatsappRef  = useRef<TextInput>(null);
  const addressRef   = useRef<TextInput>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getUserProfile(cu.uid)
      .then(profile => {
        if (profile?.firstName) {
          setFirstName(profile.firstName);
          setLastName(profile.lastName ?? '');
        } else {
          const name = (profile?.displayName ?? cu.displayName ?? '').trim();
          const idx  = name.indexOf(' ');
          setFirstName(idx >= 0 ? name.slice(0, idx) : name);
          setLastName(idx  >= 0 ? name.slice(idx + 1) : '');
        }
        setPhone(profile?.phoneNumber ?? profile?.phone ?? '');
        setSavedPhone(normalizePhone(profile?.phoneNumber ?? profile?.phone ?? ''));
        setWhatsapp(profile?.whatsapp ?? '');
        setSameAsPhone(profile?.whatsappSameAsPhone ?? false);
        setAddress(profile?.address ?? '');
        setNameLocked(profile?.idCheckedVersion != null);
        setCustomerType(profile?.customerType ?? 'tourist');
      })
      .catch(() => {
        const name = (auth.currentUser?.displayName ?? '').trim();
        const idx  = name.indexOf(' ');
        setFirstName(idx >= 0 ? name.slice(0, idx) : name);
        setLastName(idx  >= 0 ? name.slice(idx + 1) : '');
      })
      .finally(() => setLoading(false));
  }, []);

  // Clear auto-hide timer on unmount
  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const whatsappDisplayed = sameAsPhone ? phone : whatsapp;

  // ── Validation ───────────────────────────────────────────────────────────────

  const errors = {
    firstName: nameLocked || firstName.trim() ? '' : 'First name is required.',
    lastName:  nameLocked || lastName.trim()  ? '' : 'Last name is required.',
    phone:     isPhoneValid(phone) ? '' : 'Enter a valid phone number (min 6 digits).',
    whatsapp:  (!sameAsPhone && whatsapp.trim() && !isPhoneValid(whatsapp))
      ? 'Enter a valid WhatsApp number (min 6 digits).'
      : '',
  };
  const isValid = !errors.firstName && !errors.lastName && !errors.phone && !errors.whatsapp;

  function touch(field: keyof typeof touched) {
    setTouched(t => ({ ...t, [field]: true }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const scheduleHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSaveStatus(null), 3000);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleToggleSameAsPhone = () => {
    setSameAsPhone(v => {
      if (!v) setTouched(t => ({ ...t, whatsapp: false }));
      return !v;
    });
  };

  const handleSave = async () => {
    if (!isValid || saving) return;
    const cu = auth.currentUser;
    if (!cu) return;

    setSaveStatus(null);
    setSaving(true);
    try {
      const fn          = firstName.trim();
      const ln          = lastName.trim();
      const displayName = `${fn} ${ln}`.trim();
      const waValue     = sameAsPhone ? phone.trim() : whatsapp.trim();

      await saveUserProfile(cu.uid, {
        ...(nameLocked ? {} : { firstName: fn, lastName: ln, displayName }),
        phoneNumber:         phone.trim(),
        // Staff verify phones in person — a new number needs verifying again.
        ...(normalizePhone(phone) !== savedPhone ? { phoneVerified: false } : {}),
        phone:               phone.trim(),
        whatsapp:            waValue,
        whatsappSameAsPhone: sameAsPhone,
        address:             address.trim(),
      });
      if (!nameLocked) await updateProfile(cu, { displayName });
      setSavedPhone(normalizePhone(phone));

      console.log('[PersonalInfo] Profile saved successfully');
      setSaving(false);
      setSaveStatus('success');
      scheduleHide();
    } catch (err) {
      console.log('[PersonalInfo] Save error:', err);
      setSaving(false);
      setSaveStatus('error');
      scheduleHide();
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, screen.root]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[s.root, screen.root]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Account (read-only) ── */}
        <SectionTitle style={{ marginTop: 16 }}>Account</SectionTitle>
        <View style={[UI.card, UI.cardPadded]}>
          <Text style={UI.fieldLabel}>Email</Text>
          <View style={[UI.input, UI.inputReadonly]}>
            <Text style={UI.inputReadonlyText}>{auth.currentUser?.email ?? '—'}</Text>
          </View>
          <Text style={[UI.small, s.note]}>Contact us to change your email.</Text>

          {/* Account type — read-only, admin-controlled */}
          {(() => {
            const ctc = getCustomerTypeConfig(customerType);
            return (
              <>
                <Text style={[UI.fieldLabel, { marginTop: 16 }]}>Account type</Text>
                <View style={[UI.input, UI.inputReadonly, s.readonlyRow]}>
                  <Text style={UI.inputReadonlyText}>{ctc.label}</Text>
                  {ctc.depositMessage && <StatusChip label={ctc.depositMessage} tone="amber" />}
                </View>
                <Text style={[UI.small, s.note]}>
                  {'Set by LANCHAI · affects your deposit. '}
                  <Text style={s.noteLink} onPress={() => router.push('/chat')}>
                    Contact us to update.
                  </Text>
                </Text>
              </>
            );
          })()}
        </View>

        {/* ── Your details ── */}
        <SectionTitle>Your details</SectionTitle>
        <View style={[UI.card, UI.cardPadded]}>
          {/* Name — read-only once an ID has been checked in person (firestore.rules
              enforces it too); staff can correct it from the ID check. */}
          {nameLocked ? (
            <>
              <Text style={UI.fieldLabel}>Name</Text>
              <View style={[UI.input, UI.inputReadonly]}>
                <Text style={UI.inputReadonlyText}>{`${firstName} ${lastName}`.trim() || '—'}</Text>
              </View>
              <Text style={[UI.small, s.note, { marginBottom: 16 }]}>Your name was checked against your ID. Contact us to change your name.</Text>
            </>
          ) : (
            <>
              {/* First name */}
              <Text style={UI.fieldLabel}>First name</Text>
              <TextInput
                style={[UI.input, touched.firstName && !!errors.firstName && s.inputError]}
                value={firstName}
                onChangeText={setFirstName}
                onBlur={() => touch('firstName')}
                onSubmitEditing={() => lastNameRef.current?.focus()}
                placeholder="e.g. Aurore"
                placeholderTextColor={SHADES.carbonFaint}
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={[UI.errorText, s.fieldError]}>{touched.firstName ? errors.firstName : ''}</Text>

              {/* Last name */}
              <Text style={UI.fieldLabel}>Last name</Text>
              <TextInput
                ref={lastNameRef}
                style={[UI.input, touched.lastName && !!errors.lastName && s.inputError]}
                value={lastName}
                onChangeText={setLastName}
                onBlur={() => touch('lastName')}
                onSubmitEditing={() => phoneRef.current?.focus()}
                placeholder="e.g. Batifoulier"
                placeholderTextColor={SHADES.carbonFaint}
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={[UI.errorText, s.fieldError]}>{touched.lastName ? errors.lastName : ''}</Text>
            </>
          )}

          {/* Phone */}
          <Text style={UI.fieldLabel}>Phone</Text>
          <TextInput
            ref={phoneRef}
            style={[UI.input, touched.phone && !!errors.phone && s.inputError]}
            value={phone}
            onChangeText={setPhone}
            onBlur={() => touch('phone')}
            onSubmitEditing={sameAsPhone ? handleSave : () => whatsappRef.current?.focus()}
            placeholder="+856 20 ..."
            placeholderTextColor={SHADES.carbonFaint}
            keyboardType="phone-pad"
            returnKeyType={sameAsPhone ? 'done' : 'next'}
            blurOnSubmit={false}
          />
          <Text style={[UI.errorText, s.fieldError]}>{touched.phone ? errors.phone : ''}</Text>

          {/* WhatsApp number */}
          <View style={s.labelRow}>
            <Text style={[UI.fieldLabel, { marginBottom: 0 }]}>WhatsApp number</Text>
            <Text style={UI.small}>Optional</Text>
          </View>
          <TextInput
            ref={whatsappRef}
            style={[
              UI.input,
              sameAsPhone && s.inputDisabled,
              !sameAsPhone && touched.whatsapp && !!errors.whatsapp && s.inputError,
            ]}
            value={whatsappDisplayed}
            onChangeText={v => { if (!sameAsPhone) setWhatsapp(v); }}
            onBlur={() => { if (!sameAsPhone) touch('whatsapp'); }}
            onSubmitEditing={() => addressRef.current?.focus()}
            editable={!sameAsPhone}
            placeholder="+856 20 ..."
            placeholderTextColor={SHADES.carbonFaint}
            keyboardType="phone-pad"
            returnKeyType="next"
          />
          <Text style={[UI.errorText, s.fieldError]}>
            {!sameAsPhone && touched.whatsapp ? errors.whatsapp : ''}
          </Text>

          {/* Same as phone checkbox */}
          <TouchableOpacity
            style={s.checkbox}
            onPress={handleToggleSameAsPhone}
            activeOpacity={0.7}
          >
            <View style={[s.checkboxBox, sameAsPhone && s.checkboxBoxChecked]}>
              {sameAsPhone && <Feather name="check" size={13} color={SHADES.cream} />}
            </View>
            <Text style={[UI.body, { color: SHADES.carbon }]}>Same as phone number</Text>
          </TouchableOpacity>

          {/* Address */}
          <View style={s.labelRow}>
            <Text style={[UI.fieldLabel, { marginBottom: 0 }]}>Address</Text>
            <Text style={UI.small}>Optional</Text>
          </View>
          <TextInput
            ref={addressRef}
            style={UI.input}
            value={address}
            onChangeText={setAddress}
            onSubmitEditing={handleSave}
            placeholder="Street, city…"
            placeholderTextColor={SHADES.carbonFaint}
            returnKeyType="done"
            maxLength={200}
          />
        </View>

        {/* Email reminders now live in Notifications (app/profile/notifications.tsx). */}
        <View style={{ marginTop: 16 }}>
          <RowGroup>
            <Row icon={{ name: 'bell' }} title="Notification settings" onPress={() => router.push('/profile/notifications')} />
          </RowGroup>
        </View>

        {/* Save status — a subtle check line / one-line error, right above Save */}
        <View style={s.status}>
          {saveStatus === 'success' && <CheckLine text="Your profile has been updated." />}
          {saveStatus === 'error' && <Text style={UI.errorText}>Could not save. Please try again.</Text>}
        </View>

        {/* Save */}
        <PressScale
          style={[UI.btnPrimary, (!isValid || saving) && UI.btnDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={SHADES.carbon} />
              <Text style={UI.btnPrimaryText}>Saving…</Text>
            </>
          ) : (
            <Text style={UI.btnPrimaryText}>Save</Text>
          )}
        </PressScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Personal info</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
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

  note: { marginTop: 6 },
  noteLink: { color: SHADES.carbon, fontWeight: '700', textDecorationLine: 'underline' },
  readonlyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  inputError: { borderColor: COLORS.danger },
  inputDisabled: { backgroundColor: SHADES.carbonLight, color: SHADES.carbonMuted },
  // Reserved height so an error never shifts the form.
  fieldError: { minHeight: 18, marginTop: 4, marginBottom: 10, paddingHorizontal: 2 },

  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -2, marginBottom: 18 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbonFaint,
    backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
  },
  checkboxBoxChecked: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },

  status: { minHeight: 24, justifyContent: 'center', marginTop: 12, marginBottom: 8 },
});
