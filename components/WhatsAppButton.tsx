import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
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
}

// Shared WhatsApp contact button. Renders nothing (title included) when
// config/shop.whatsappNumber is empty or invalid, so no screen ever shows a dead link.
export default function WhatsAppButton({
  message,
  title,
  label = 'Message us on WhatsApp',
  style,
}: WhatsAppButtonProps) {
  const shop   = useShopInfo();
  const number = normalizeWhatsappNumber(shop.whatsappNumber ?? '');
  if (!isValidWhatsappNumber(number)) return null;

  const open = () => {
    Linking.openURL(buildWhatsappUrl(number, message)).catch(() => {});
  };

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
  btnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});
