import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import {
  useShopInfo,
  buildWhatsappUrl,
  normalizeWhatsappNumber,
  isValidWhatsappNumber,
} from '@/lib/shop';

const WHATSAPP_GREEN = '#25D366';

interface WhatsAppButtonProps {
  /** Pre-filled message text (URL-encoded for you). */
  message?: string;
  /** Optional prompt line shown above the button, e.g. "Didn't find your answer?". */
  title?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
  /** 'row' = My Account palette row (white card, amber icon circle, chevron, no green). */
  variant?: 'button' | 'row';
  /** Row variant only: grey line under the label. */
  sub?: string;
}

// Shared WhatsApp contact button. Renders nothing (title included) when
// config/shop.whatsappNumber is empty or invalid, so no screen ever shows a dead link.
export default function WhatsAppButton({
  message,
  title,
  label = 'Message us on WhatsApp',
  style,
  variant = 'button',
  sub,
}: WhatsAppButtonProps) {
  const shop   = useShopInfo();
  const number = normalizeWhatsappNumber(shop.whatsappNumber ?? '');
  if (!isValidWhatsappNumber(number)) return null;

  const open = () => {
    Linking.openURL(buildWhatsappUrl(number, message)).catch(() => {});
  };

  if (variant === 'row') {
    return (
      <View style={[s.wrap, style]}>
        {!!title && <Text style={s.title}>{title}</Text>}
        <TouchableOpacity
          style={[UI.card, s.row]}
          onPress={open}
          activeOpacity={0.75}
          accessibilityRole="link"
          accessibilityLabel={label}
        >
          <View style={s.rowIcon}><Ionicons name="logo-whatsapp" size={18} color={SHADES.amberDeep} /></View>
          <View style={{ flex: 1 }}>
            <Text style={UI.title}>{label}</Text>
            {!!sub && <Text style={UI.subtitle}>{sub}</Text>}
          </View>
          <Feather name="chevron-right" size={16} color={SHADES.carbonFaint} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.wrap, style]}>
      {!!title && <Text style={s.title}>{title}</Text>}
      <TouchableOpacity
        style={s.btn}
        onPress={open}
        activeOpacity={0.75}
        accessibilityRole="link"
        accessibilityLabel={label}
      >
        <Ionicons name="logo-whatsapp" size={17} color={WHATSAPP_GREEN} />
        <Text style={s.btnText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg3,
    textAlign: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  // Amber = main contact (My Account icon rule).
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: SHADES.amberLight, alignItems: 'center', justifyContent: 'center' },
  btnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});
