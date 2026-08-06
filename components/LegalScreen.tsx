import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';

interface Props {
  title: string;
  content: string;
}

const MD_STYLES = {
  body: {
    fontSize: 14,
    color: COLORS.fg2,
    lineHeight: 22,
    backgroundColor: 'transparent',
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
  },
  heading1: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: COLORS.carbon,
    letterSpacing: -0.5 as number,
    marginTop: 8,
    marginBottom: 10,
    lineHeight: 28,
  },
  heading2: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: COLORS.carbon,
    marginTop: 22,
    marginBottom: 6,
    lineHeight: 22,
  },
  heading3: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: COLORS.carbon,
    marginTop: 14,
    marginBottom: 4,
  },
  strong: {
    fontWeight: '700' as const,
    color: COLORS.carbon,
  },
  em: {
    fontStyle: 'italic' as const,
  },
  link: {
    color: COLORS.amber,
    fontWeight: '600' as const,
  },
  blockquote: {
    backgroundColor: '#FEF9E5',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.amber,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginVertical: 8,
  },
  hr: {
    backgroundColor: COLORS.softGray200,
    height: 1,
    marginVertical: 18,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  code_inline: {
    backgroundColor: COLORS.warmBeige,
    borderRadius: 4,
    paddingHorizontal: 4,
    color: COLORS.carbon,
    fontSize: 12,
  },
};

export default function LegalScreen({ title, content }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{title}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Markdown style={MD_STYLES as never}>{content}</Markdown>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
