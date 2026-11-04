import React, { forwardRef, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  type TextInputProps,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { TYPE, SIZES } from '@/constants/typography';
import { AUTH_COPY } from '@/constants/authCopy';
import { COUNTRY_CODES, type CountryCode } from '@/constants/countryCodes';
import { UI, useScreenInsets } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { googleSignInAvailable } from '@/lib/googleSignIn';

// Shared fields of the auth screens (validated mockups): white rounded inputs, password
// with an eye toggle, phone with a country-code picker, "or with email" divider, social
// buttons (Google behind its flag; Apple slot for iOS later), Terms / Privacy line.

export const AuthInput = forwardRef<TextInput, TextInputProps>(function AuthInput({ style, ...rest }, ref) {
  return <TextInput ref={ref} placeholderTextColor={SHADES.carbonFaint} style={[s.input, style]} {...rest} />;
});

export const PasswordField = forwardRef<TextInput, TextInputProps>(function PasswordField(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <View style={s.inputRow}>
      <TextInput
        ref={ref}
        placeholderTextColor={SHADES.carbonFaint}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        style={[s.input, s.inputWithIcon]}
        {...props}
      />
      <TouchableOpacity
        style={s.eye}
        onPress={() => setShown(v => !v)}
        hitSlop={8}
        accessibilityLabel={shown ? AUTH_COPY.signIn.hidePassword : AUTH_COPY.signIn.showPassword}
      >
        <Feather name={shown ? 'eye-off' : 'eye'} size={19} color={SHADES.carbonMuted} />
      </TouchableOpacity>
    </View>
  );
});

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={s.divider}>
      <View style={s.line} />
      <Text style={s.dividerText}>{label}</Text>
      <View style={s.line} />
    </View>
  );
}

/** Continue with Google (only where it works — dev / EAS build) + the Apple slot. */
export function SocialButtons({ onGoogle, busy }: { onGoogle: () => void; busy?: boolean }) {
  if (!googleSignInAvailable()) return null;
  return (
    <View style={{ gap: 10 }}>
      <PressScale style={[s.social, busy && UI.btnDisabled]} onPress={onGoogle} disabled={busy}>
        <MaterialCommunityIcons name="google" size={20} color={SHADES.carbon} />
        <Text style={s.socialText}>{AUTH_COPY.signIn.google}</Text>
      </PressScale>
      {/* Apple sign-in slot — required on iOS later (App Store rule); not implemented yet. */}
    </View>
  );
}

export function TermsLine() {
  const router = useRouter();
  const t = AUTH_COPY.signIn;
  return (
    <Text style={s.terms}>
      {t.termsPrefix}
      <Text style={s.termsLink} onPress={() => router.push('/legal/terms')}>{t.terms}</Text>
      {t.and}
      <Text style={s.termsLink} onPress={() => router.push('/legal/privacy')}>{t.privacy}</Text>
      .
    </Text>
  );
}

/** Country-code button + local number. */
export function PhoneField({ country, onCountry, value, onChangeText, invalid }: {
  country: CountryCode;
  onCountry: (c: CountryCode) => void;
  value: string;
  onChangeText: (v: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.phoneRow}>
      <PressScale style={s.countryBtn} onPress={() => setOpen(true)} accessibilityLabel={AUTH_COPY.signUp.countryTitle}>
        <Text style={s.flag}>{country.flag}</Text>
        <Text style={s.dial}>{`+${country.dial}`}</Text>
        <Feather name="chevron-down" size={15} color={SHADES.carbon} />
      </PressScale>
      <AuthInput
        style={[{ flex: 1 }, invalid && s.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={AUTH_COPY.signUp.phone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
      />
      <CountrySheet visible={open} onClose={() => setOpen(false)} onPick={c => { onCountry(c); setOpen(false); }} />
    </View>
  );
}

function CountrySheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: CountryCode) => void }) {
  const screen = useScreenInsets();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^\+/, '');
    return t ? COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(t) || c.dial.startsWith(t)) : COUNTRY_CODES;
  }, [q]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: screen.bottom + 12 }]}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{AUTH_COPY.signUp.countryTitle}</Text>
          <AuthInput value={q} onChangeText={setQ} placeholder={AUTH_COPY.signUp.countrySearch} autoCorrect={false} style={{ marginTop: 12 }} />
          <FlatList
            style={{ maxHeight: 380, marginTop: 8 }}
            data={list}
            keyExtractor={c => c.iso}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={s.countryRow} onPress={() => onPick(item)} activeOpacity={0.7}>
                <Text style={s.flag}>{item.flag}</Text>
                <Text style={[TYPE.body, { flex: 1, color: SHADES.carbon }]}>{item.name}</Text>
                <Text style={[TYPE.body, { color: SHADES.carbonMuted }]}>{`+${item.dial}`}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const INPUT_H = 50;

const s = StyleSheet.create({
  input: {
    height: INPUT_H, borderRadius: 16, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
    paddingHorizontal: 16, fontSize: 15, fontWeight: '500', color: SHADES.carbon,
  },
  inputError: { borderColor: SHADES.amberText },
  inputRow: { justifyContent: 'center' },
  inputWithIcon: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, height: INPUT_H, justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 0.5, backgroundColor: SHADES.border },
  dividerText: { ...TYPE.secondary, color: SHADES.carbonMuted },
  social: {
    height: SIZES.btn, borderRadius: 16, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  socialText: { ...TYPE.button, color: SHADES.carbon },
  terms: { ...TYPE.small, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center' },
  termsLink: { textDecorationLine: 'underline', color: SHADES.carbonMuted },
  phoneRow: { flexDirection: 'row', gap: 10 },
  countryBtn: {
    height: INPUT_H, borderRadius: 16, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12,
  },
  flag: { fontSize: 18 },
  dial: { ...TYPE.body, fontWeight: '600', color: SHADES.carbon },
  sheetRoot: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 14 },
  sheetTitle: { ...TYPE.sectionTitle, color: SHADES.carbon },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
});
