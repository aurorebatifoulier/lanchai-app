import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import { UI, useScreenInsets } from '@/components/account/ui';
import { useAuth } from '@/contexts/AuthContext';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatMark, ContextCard, QuickQuestions, ReplyLine, ReadMark } from '@/components/chat/ChatHeaderParts';
import { CHAT_COPY } from '@/constants/chatCopy';
import { getProduct, getReservationById } from '@/lib/firestore';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { useChatKeyboard } from '@/components/chat/useChatKeyboard';
import { DateSeparator, buildDaySeparatedList } from '@/components/chat/DateSeparator';
import { MediaViewer } from '@/components/MediaViewer';
import {
  ChatMessage,
  type ChatAbout,
  initConversation,
  markConversationReadByRenter,
  sendMessage,
  subscribeToMessages,
  uploadChatImage,
  uploadChatVideo,
} from '@/lib/chat';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const screen = useScreenInsets();
  const { user } = useAuth();
  const RENTER_ID   = user!.uid;
  const RENTER_NAME = user!.displayName || user!.email || 'Renter';
  const { scrollRef, keyboardShown, handleContentSizeChange } = useChatKeyboard();

  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  // ?productId= / ?rentalId= → pinned "About" card; the first message sent from here
  // carries `about` so staff see what it's about.
  const { productId, rentalId } = useLocalSearchParams<{ productId?: string; rentalId?: string }>();
  const [context, setContext] = useState<(ChatAbout & { image: string | null; category: string | null }) | null>(null);
  const aboutSent = useRef(false);
  // Read on EVERY focus (the chat may already be mounted and reopened from another
  // product / rental): new params → new card, no params → no card.
  const loadContext = useCallback(() => {
    const pid = productId ? String(productId) : null;
    const rid = rentalId ? String(rentalId) : null;
    if (!pid && !rid) { setContext(null); return; }
    const key = pid ? `product:${pid}` : `rental:${rid}`;
    setContext(prev => (prev && `${prev.kind}:${prev.id}` === key ? prev : null));
    aboutSent.current = false;
    if (pid) {
      getProduct(pid)
        .then(p => { if (p) setContext({ kind: 'product', id: p.id, name: p.name, image: p.images?.[0] ?? null, category: p.category ?? null }); })
        .catch(() => {});
    } else if (rid) {
      getReservationById(rid)
        .then(r => { if (r) setContext({ kind: 'rental', id: r.id, name: r.productName, image: r.productImage ?? null, category: null }); })
        .catch(() => {});
    }
  }, [productId, rentalId]);
  useFocusEffect(loadContext);
  const [sending,   setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setChatError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setChatError(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, []);

  // Init conversation (creates doc + welcome message on first visit)
  useEffect(() => {
    initConversation(RENTER_ID, RENTER_NAME).catch(() => {
      // Conversation may already exist or network error — subscription handles display
    });
  }, []);

  // Opening the chat clears the renter's own unread badge.
  useEffect(() => {
    markConversationReadByRenter(RENTER_ID).catch(() => {});
  }, []);

  // Real-time message subscription
  useEffect(() => {
    const unsub = subscribeToMessages(
      RENTER_ID,
      setMessages,
      err => console.warn('Chat subscription error:', err),
    );
    return unsub;
  }, []);

  // ── Sending ─────────────────────────────────────────────────────────────────

  const sendText = useCallback(async (raw: string, fromInput: boolean) => {
    const text = raw.trim();
    if (!text || sending || uploading) return;
    setSending(true);
    if (fromInput) setInputText('');
    const about = context && !aboutSent.current
      ? { kind: context.kind, id: context.id, name: context.name }
      : null;
    try {
      await sendMessage(RENTER_ID, text, null, null, about ? { about } : {});
      if (about) aboutSent.current = true;
    } catch {
      showError('Could not send your message. Please try again.');
      if (fromInput) setInputText(text);
    } finally {
      setSending(false);
    }
  }, [sending, uploading, context, RENTER_ID, showError]);
  const handleSend = useCallback(() => sendText(inputText, true), [sendText, inputText]);

  const handlePickImage = useCallback(async () => {
    if (sending || uploading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Photo access denied. Please allow it in your device settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const url = await uploadChatImage(RENTER_ID, result.assets[0].uri);
      await sendMessage(RENTER_ID, null, url);
    } catch {
      showError('Could not upload the photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [sending, uploading, showError]);

  const uploadAndSendVideo = useCallback(async (localUri: string) => {
    setUploading(true);
    try {
      const { url, thumbUrl } = await uploadChatVideo(RENTER_ID, localUri);
      await sendMessage(RENTER_ID, null, null, url, { videoThumbUrl: thumbUrl });
    } catch (err: any) {
      console.error('[handleRecordVideo/handlePickVideo] video upload failed:', err);
      showError(
        err?.message === 'VIDEO_TOO_LARGE'
          ? 'This video is too large — please choose a shorter clip or record one instead.'
          : 'Could not upload the video. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  }, [showError]);

  const handleRecordVideo = useCallback(async () => {
    if (sending || uploading) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError('Camera access denied. Please allow it in your device settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: 0.6,
    });

    if (result.canceled || result.assets.length === 0) return;
    await uploadAndSendVideo(result.assets[0].uri);
  }, [sending, uploading, showError, uploadAndSendVideo]);

  const handlePickVideo = useCallback(async () => {
    if (sending || uploading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Video access denied. Please allow it in your device settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
    });

    if (result.canceled || result.assets.length === 0) return;
    await uploadAndSendVideo(result.assets[0].uri);
  }, [sending, uploading, showError, uploadAndSendVideo]);

  // ── Day-separated render list ──────────────────────────────────────────────

  const listEntries = useMemo(() => buildDaySeparatedList(messages), [messages]);
  const hasRenterMessage = messages.some(m => m.senderType === 'renter');
  // "Read" under the LAST renter message, once LANCHAI has read it.
  const lastReadRenterId = useMemo(() => {
    const mine = messages.filter(m => m.senderType === 'renter');
    const last = mine[mine.length - 1];
    return last?.read ? last.id : null;
  }, [messages]);

  // ── Fullscreen media viewer ──────────────────────────────────────────────────
  // Lives at screen level, not inside MessageBubble — prev/next navigation needs
  // the whole conversation's media, which a single bubble has no visibility into.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const media = useMemo(
    () => messages
      .filter(m => m.imageUrl || m.videoUrl)
      .map(m => ({
        url: (m.imageUrl ?? m.videoUrl)!,
        type: m.imageUrl ? ('image' as const) : ('video' as const),
      })),
    [messages],
  );
  const handleMediaPress = useCallback((url: string) => {
    const idx = media.findIndex(m => m.url === url);
    if (idx !== -1) setViewerIndex(idx);
  }, [media]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} variant="bare" size={22} boxSize={36} />

        <ChatMark size={44} />

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{CHAT_COPY.title}</Text>
          <ReplyLine />
        </View>
      </View>
      <View style={styles.headerDivider} />

      {/* Pinned "About" card — outside the message list, which auto-scrolls to the
          newest message (inside it, the card scrolled out of view). */}
      {context && (
        <View style={styles.contextPin}>
          <ContextCard
            name={context.name}
            image={context.image}
            category={context.category}
            onView={() => router.push((context.kind === 'product' ? `/product/${context.id}` : `/rentals/${context.id}`) as never)}
          />
        </View>
      )}

      {/* Messages + input inside KAV.
          keyboardVerticalOffset = insets.top because SafeAreaView applies paddingTop
          as an internal inset, so the KAV's onLayout frame.y is parent-relative
          (starts after the safe-area padding) while keyboard.screenY is absolute
          from the screen top. The offset bridges that gap on both platforms. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={handleContentSizeChange}
        >
          {listEntries.map(entry =>
            entry.kind === 'separator' ? (
              <DateSeparator key={entry.key} label={entry.label} />
            ) : (
              <React.Fragment key={entry.key}>
                <MessageBubble message={entry.message} viewerRole="renter" otherPartyInitial="L" hideAvatar onMediaPress={handleMediaPress} />
                {entry.message.id === lastReadRenterId && <ReadMark />}
              </React.Fragment>
            )
          )}
          {/* Quick questions until the renter has written something. */}
          {!hasRenterMessage && <QuickQuestions onAsk={q => sendText(q, false)} />}
        </ScrollView>

        {/* Inline error banner — appears transiently above the input bar */}
        {chatError ? (
          <View style={styles.errorBanner}>
            <Text style={UI.errorText}>{chatError}</Text>
          </View>
        ) : null}

        {/* Input bar — bottom inset only when keyboard is hidden; when the
            keyboard is shown the KAV already accounts for the bottom space. */}
        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onPickImage={handlePickImage}
          onRecordVideo={handleRecordVideo}
          onPickVideo={handlePickVideo}
          sending={sending}
          uploading={uploading}
          // The input bar is the fixed bottom bar: it sits above the system bar itself
          // (the screen root has no bottom inset here).
          bottomPadding={keyboardShown ? 8 : screen.bottom + 8}
        />
      </KeyboardAvoidingView>

      <MediaViewer media={media} openIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  flex: {
    flex: 1,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: SHADES.white,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.carbon,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    marginTop: 1,
  },
  headerDivider: {
    height: 0.5,
    backgroundColor: SHADES.border,
  },

  // ── Inline error banner ────────────────────────────────────────────────────
  // One-line error (no red background), right above the input bar.
  errorBanner: {
    backgroundColor: SHADES.white,
    borderTopWidth: 0.5,
    borderTopColor: SHADES.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  // ── Message list ───────────────────────────────────────────────────────────
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 14,
  },
  contextPin: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: COLORS.porcelain },
});
