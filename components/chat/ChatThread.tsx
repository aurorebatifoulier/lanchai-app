import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { DateSeparator, buildDaySeparatedList, type ChatListEntry } from '@/components/chat/DateSeparator';
import type { ChatAbout, ChatMessage } from '@/lib/chat';

// The message list of BOTH chats (renter + admin): an INVERTED FlatList — the newest
// message is the first item and sits at the bottom, so the thread always opens on the
// latest message, even while photos / videos load (no scroll-to-end timing). The
// day-separated list (ascending) is simply reversed: each separator then renders just
// above its day's messages. All messages are loaded (no pagination in lib/chat yet).

export function ChatThread({
  messages, viewerRole, otherPartyInitial, hideAvatar, onMediaPress, onAboutPress, afterMessage, footer,
}: {
  messages: ChatMessage[];
  viewerRole: 'renter' | 'business';
  otherPartyInitial: string;
  hideAvatar?: boolean;
  onMediaPress: (url: string) => void;
  /** Admin: tap "About: …" → the product / rental. */
  onAboutPress?: (about: ChatAbout) => void;
  /** Rendered right under a message (renter: "Read" under the last one). */
  afterMessage?: (m: ChatMessage) => React.ReactNode;
  /** Rendered under the newest message (renter: quick questions). */
  footer?: React.ReactNode;
}) {
  const entries = useMemo(() => [...buildDaySeparatedList(messages)].reverse(), [messages]);

  const renderItem = useCallback(({ item }: { item: ChatListEntry }) => (
    item.kind === 'separator' ? (
      <View style={s.cell}><DateSeparator label={item.label} /></View>
    ) : (
      <View style={s.cell}>
        <MessageBubble
          message={item.message}
          viewerRole={viewerRole}
          otherPartyInitial={otherPartyInitial}
          hideAvatar={hideAvatar}
          onMediaPress={onMediaPress}
          onAboutPress={onAboutPress}
        />
        {afterMessage?.(item.message)}
      </View>
    )
  ), [viewerRole, otherPartyInitial, hideAvatar, onMediaPress, onAboutPress, afterMessage]);

  return (
    <FlatList
      inverted
      data={entries}
      keyExtractor={e => e.key}
      renderItem={renderItem}
      // Inverted: the "header" is at the BOTTOM, under the newest message.
      ListHeaderComponent={footer ? <View style={s.footer}>{footer}</View> : null}
      style={s.list}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      initialNumToRender={20}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1 },
  // Inverted: paddingTop is the visual bottom, paddingBottom the visual top.
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  cell: { paddingVertical: 7 },
  footer: { paddingTop: 4, paddingBottom: 4 },
});
