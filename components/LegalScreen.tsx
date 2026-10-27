import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Markdown from 'react-native-markdown-display';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import { UI, useScreenInsets } from '@/components/account/ui';
import { useShopInfo } from '@/lib/shop';
import { fillLegalPlaceholders } from '@/lib/legalContent';

interface Props {
  title: string;
  content: string;
}

// My Account design (components/account/ui.tsx) — visual only, the texts are untouched.
const MD_STYLES = {
  body: { fontSize: 14, color: SHADES.carbonMuted, lineHeight: 22, backgroundColor: 'transparent' },
  paragraph: { marginTop: 0, marginBottom: 10 },
  heading1: {
    fontSize: 22, fontWeight: '800' as const, color: SHADES.carbon, letterSpacing: -0.4 as number,
    marginTop: 4, marginBottom: 10, lineHeight: 28,
  },
  heading2: { fontSize: 18, fontWeight: '800' as const, color: SHADES.carbon, marginTop: 24, marginBottom: 8, lineHeight: 24 },
  heading3: { fontSize: 15, fontWeight: '700' as const, color: SHADES.carbon, marginTop: 14, marginBottom: 4 },
  strong: { fontWeight: '700' as const, color: SHADES.carbon },
  em: { fontStyle: 'italic' as const },
  link: { color: SHADES.amberDeep, fontWeight: '700' as const },
  blockquote: {
    backgroundColor: SHADES.amberPale, borderLeftWidth: 3, borderLeftColor: SHADES.amber,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginVertical: 8,
  },
  hr: { backgroundColor: SHADES.border, height: 0.5, marginVertical: 18 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: { backgroundColor: SHADES.carbonLight, borderRadius: 4, paddingHorizontal: 4, color: SHADES.carbon, fontSize: 12 },
};

export default function LegalScreen({ title, content }: Props) {
  // Address + WhatsApp come from config/shop, so the legal texts follow Shop settings.
  const shop = useShopInfo();
  const screen = useScreenInsets();
  const router = useRouter();

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{title}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: screen.contentBottom }]}
      >
        <View style={[UI.card, s.card]}>
          <Markdown style={MD_STYLES as never}>{fillLegalPlaceholders(content, shop)}</Markdown>
        </View>
      </ScrollView>
    </View>
  );
}

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
  content: { paddingHorizontal: 16, paddingTop: 16 },
  card: { paddingHorizontal: 18, paddingVertical: 16 },
});
