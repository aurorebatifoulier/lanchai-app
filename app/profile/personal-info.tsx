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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { getUserProfile, saveUserProfile } from '@/lib/firestore';
import { getCustomerTypeConfig } from '@/utils/customerType';

function isPhoneValid(p: string): boolean {
  return p.replace(/\D/g, '').length >= 6;
}

type SaveStatus = 'success' | 'error' | null;

export default function PersonalInfoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [address,     setAddress]     = useState('');
  const [touched,     setTouched]     = useState({
    firstName: false, lastName: false, phone: false, whatsapp: false,
  });
  const [customerType, setCustomerType] = useState<string>('tourist');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
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
        setWhatsapp(profile?.whatsapp ?? '');
        setSameAsPhone(profile?.whatsappSameAsPhone ?? false);
        setAddress(profile?.address ?? '');
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
    firstName: firstName.trim()    ? '' : 'First name is required.',
    lastName:  lastName.trim()     ? '' : 'Last name is required.',
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
        firstName:           fn,
        lastName:            ln,
        displayName,
        phoneNumber:         phone.trim(),
        phoneVerified:       false,
        phone:               phone.trim(),
        whatsapp:            waValue,
        whatsappSameAsPhone: sameAsPhone,
        address:             address.trim(),
      });
      await updateProfile(cu, { displayName });

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
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Email — read-only */}
        <Text style={s.fieldLabel}>Email</Text>
        <View style={s.readonlyField}>
          <Text style={s.readonlyValue}>{auth.currentUser?.email ?? '—'}</Text>
        </View>
        <Text style={s.fieldNote}>Contact us to change your email.</Text>

        {/* Account type — read-only, admin-controlled */}
        {(() => {
          const ctc = getCustomerTypeConfig(customerType);
          return (
            <>
              <Text style={s.fieldLabel}>Account type</Text>
              <View style={[s.readonlyField, s.readonlyFieldRow]}>
                <Text style={s.readonlyValue}>{ctc.label}</Text>
                {ctc.depositMessage && (
                  <View style={[s.ctBadge, { backgroundColor: ctc.badgeBg }]}>
                    <Text style={[s.ctBadgeText, { color: ctc.badgeText }]}>
                      {ctc.depositMessage}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={s.fieldNote}>
                {'Set by LANCHAI · affects your deposit. '}
                <Text style={s.fieldNoteLink} onPress={() => router.push('/chat')}>
                  Contact us to update.
                </Text>
              </Text>
            </>
          );
        })()}

        {/* First name */}
        <Text style={s.fieldLabel}>First name</Text>
        <TextInput
          style={[s.input, touched.firstName && !!errors.firstName && s.inputError]}
          value={firstName}
          onChangeText={setFirstName}
          onBlur={() => touch('firstName')}
          onSubmitEditing={() => lastNameRef.current?.focus()}
          placeholder="e.g. Aurore"
          placeholderTextColor={COLORS.fg3}
          autoCapitalize="words"
          returnKeyType="next"
          blurOnSubmit={false}
        />
        <Text style={s.errorText}>{touched.firstName ? errors.firstName : ''}</Text>

        {/* Last name */}
        <Text style={s.fieldLabel}>Last name</Text>
        <TextInput
          ref={lastNameRef}
          style={[s.input, touched.lastName && !!errors.lastName && s.inputError]}
          value={lastName}
          onChangeText={setLastName}
          onBlur={() => touch('lastName')}
          onSubmitEditing={() => phoneRef.current?.focus()}
          placeholder="e.g. Batifoulier"
          placeholderTextColor={COLORS.fg3}
          autoCapitalize="words"
          returnKeyType="next"
          blurOnSubmit={false}
        />
        <Text style={s.errorText}>{touched.lastName ? errors.lastName : ''}</Text>

        {/* Phone */}
        <Text style={s.fieldLabel}>Phone</Text>
        <TextInput
          ref={phoneRef}
          style={[s.input, touched.phone && !!errors.phone && s.inputError]}
          value={phone}
          onChangeText={setPhone}
          onBlur={() => touch('phone')}
          onSubmitEditing={sameAsPhone ? handleSave : () => whatsappRef.current?.focus()}
          placeholder="+856 20 ..."
          placeholderTextColor={COLORS.fg3}
          keyboardType="phone-pad"
          returnKeyType={sameAsPhone ? 'done' : 'next'}
          blurOnSubmit={false}
        />
        <Text style={s.errorText}>{touched.phone ? errors.phone : ''}</Text>

        {/* WhatsApp number */}
        <View style={s.fieldLabelRow}>
          <Text style={s.fieldLabel}>WhatsApp number</Text>
          <Text style={s.fieldLabelOptional}>Optional</Text>
        </View>
        <TextInput
          ref={whatsappRef}
          style={[
            s.input,
            sameAsPhone && s.inputDisabled,
            !sameAsPhone && touched.whatsapp && !!errors.whatsapp && s.inputError,
          ]}
          value={whatsappDisplayed}
          onChangeText={v => { if (!sameAsPhone) setWhatsapp(v); }}
          onBlur={() => { if (!sameAsPhone) touch('whatsapp'); }}
          onSubmitEditing={() => addressRef.current?.focus()}
          editable={!sameAsPhone}
          placeholder="+856 20 ..."
          placeholderTextColor={COLORS.fg3}
          keyboardType="phone-pad"
          returnKeyType="next"
        />
        <Text style={s.errorText}>
          {!sameAsPhone && touched.whatsapp ? errors.whatsapp : ''}
        </Text>

        {/* Same as phone checkbox */}
        <TouchableOpacity
          style={s.checkbox}
          onPress={handleToggleSameAsPhone}
          activeOpacity={0.7}
        >
          <View style={[s.checkboxBox, sameAsPhone && s.checkboxBoxChecked]}>
            {sameAsPhone && <Feather name="check" size={13} color={COLORS.white} />}
          </View>
          <Text style={s.checkboxLabel}>Same as phone number</Text>
        </TouchableOpacity>

        {/* Address */}
        <View style={s.fieldLabelRow}>
          <Text style={s.fieldLabel}>Address</Text>
          <Text style={s.fieldLabelOptional}>Optional</Text>
        </View>
        <TextInput
          ref={addressRef}
          style={s.input}
          value={address}
          onChangeText={setAddress}
          onSubmitEditing={handleSave}
          placeholder="Street, city…"
          placeholderTextColor={COLORS.fg3}
          returnKeyType="done"
          maxLength={200}
        />
        <Text style={s.errorText} />

        {/* Status banner — shown directly above the Save button */}
        {saveStatus === 'success' && (
          <View style={s.bannerSuccess}>
            <Feather name="check-circle" size={16} color="#0F6E56" />
            <Text style={s.bannerSuccessText}>Your profile has been updated.</Text>
          </View>
        )}
        {saveStatus === 'error' && (
          <View style={s.bannerError}>
            <Feather name="alert-circle" size={16} color="#B91C1C" />
            <Text style={s.bannerErrorText}>Could not save. Please try again.</Text>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[s.saveBtn, (!isValid || saving) && s.saveBtnOff]}
          onPress={handleSave}
          disabled={!isValid || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={COLORS.carbon} />
              <Text style={s.saveBtnText}>Saving…</Text>
            </>
          ) : (
            <Text style={s.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
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

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.fg3,
    textTransform: 'uppercase',
  },
  fieldLabelOptional: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.7,
  },

  input: {
    height: 50,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.carbon,
    marginBottom: 4,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  inputDisabled: {
    backgroundColor: COLORS.warmBeige,
    color: COLORS.fg2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.danger,
    minHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  readonlyField: {
    height: 50,
    backgroundColor: COLORS.warmBeige,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 6,
  },
  readonlyValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.fg2,
  },
  fieldNote: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    marginBottom: 20,
  },
  fieldNoteLink: {
    color: COLORS.carbon,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  readonlyFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ctBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -4,
    marginBottom: 24,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
  },

  bannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  bannerSuccessText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F6E56',
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  bannerErrorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#B91C1C',
  },

  saveBtn: {
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnOff: {
    opacity: 0.45,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
});
