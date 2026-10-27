import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { useAuth } from '@/contexts/AuthContext';
import { InitialAvatar, formatTime } from '@/components/chat/MessageBubble';
import { Conversation, subscribeToConversations } from '@/lib/chat';

function ConversationRow({ conversation, onPress }: { conversation: Conversation; onPress: () => void }) {
  const unread = conversation.unreadByBusiness > 0;
  const initial = (conversation.renterName || '?').charAt(0).toUpperCase();

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      <InitialAvatar initial={initial} size={44} />

      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
            {conversation.renterName || 'Renter'}
          </Text>
          <Text style={styles.time}>{formatTime(conversation.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {conversation.lastMessage || 'No messages yet'}
          </Text>
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{conversation.unreadByBusiness}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="message-circle" size={28} color={SHADES.carbon} />
      </View>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySub}>Renter messages will show up here in real time.</Text>
    </View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToConversations(
      data => {
        setConversations(data);
        setLoading(false);
      },
      err => {
        console.warn('Inbox subscription error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [isAdmin]);

  // Defensive guard — the tab itself is unlinked from the bar for renters
  // (href: null in app/(tabs)/_layout.tsx), but block direct navigation too.
  if (!isAdmin) {
    return <Redirect href="/" />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Customer messages</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} />
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                router.push({
                  pathname: '/admin-chat/[conversationId]',
                  params: { conversationId: item.id, renterName: item.renterName },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

// My Account design (components/account/ui.tsx): white cards, brand shades only.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: SHADES.carbon, marginTop: 2 },

  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  separator: { height: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SHADES.white, borderRadius: 18, borderWidth: 0.5, borderColor: SHADES.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowText: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: SHADES.carbon },
  nameUnread: { fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 },
  preview: { flex: 1, fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  previewUnread: { color: SHADES.carbon, fontWeight: '600' },
  badge: {
    minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: SHADES.carbon },

  // ── Empty state ────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: SHADES.carbonLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginBottom: 8 },
  emptySub: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 20 },
});
