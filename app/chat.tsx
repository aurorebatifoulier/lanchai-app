import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { InitialAvatar, MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { useChatKeyboard } from '@/components/chat/useChatKeyboard';
import { DateSeparator, buildDaySeparatedList } from '@/components/chat/DateSeparator';
import { MediaViewer } from '@/components/MediaViewer';
import {
  ChatMessage,
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
  const { user } = useAuth();
  const RENTER_ID   = user!.uid;
  const RENTER_NAME = user!.displayName || user!.email || 'Renter';
  const { scrollRef, keyboardShown, handleContentSizeChange } = useChatKeyboard();

  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending || uploading) return;
    setSending(true);
    setInputText('');
    try {
      await sendMessage(RENTER_ID, text, null);
    } catch {
      showError('Could not send your message. Please try again.');
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, uploading]);

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
      const url = await uploadChatVideo(RENTER_ID, localUri);
      await sendMessage(RENTER_ID, null, null, url);
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

        <InitialAvatar initial="L" size={36} />

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>LANCHAI</Text>
          <Text style={styles.headerSubtitle}>Here to help</Text>
        </View>
      </View>
      <View style={styles.headerDivider} />

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
              <MessageBubble key={entry.key} message={entry.message} viewerRole="renter" otherPartyInitial="L" onMediaPress={handleMediaPress} />
            )
          )}
        </ScrollView>

        {/* Inline error banner — appears transiently above the input bar */}
        {chatError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{chatError}</Text>
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
          bottomPadding={keyboardShown ? 8 : insets.bottom + 8}
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
    backgroundColor: COLORS.porcelain,
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
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 1,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.softGray,
  },

  // ── Inline error banner ────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FEE2E2',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.danger,
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
});
