import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { InitialAvatar, MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { useSavedReplies } from '@/lib/savedReplies';
import { SHADES } from '@/constants/brandShades';
import { useChatKeyboard } from '@/components/chat/useChatKeyboard';
import { DateSeparator, buildDaySeparatedList } from '@/components/chat/DateSeparator';
import { MediaViewer } from '@/components/MediaViewer';
import {
  ChatMessage,
  getConversation,
  markConversationReadByBusiness,
  sendBusinessMessage,
  subscribeToMessages,
  uploadChatImage,
  uploadChatVideo,
} from '@/lib/chat';

export default function AdminChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, user } = useAuth();
  const { conversationId, renterName: renterNameParam } = useLocalSearchParams<{
    conversationId: string;
    renterName?: string;
  }>();
  const ADMIN_ID = user!.uid;
  const { scrollRef, keyboardShown, handleContentSizeChange } = useChatKeyboard();

  const [renterName, setRenterName] = useState(renterNameParam ?? '');
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [inputText,  setInputText]  = useState('');
  const savedReplies = useSavedReplies();
  const [sending,    setSending]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [chatError,  setChatError]  = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setChatError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setChatError(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, []);

  // Fallback when the thread is opened without a renterName param (e.g. deep link).
  useEffect(() => {
    if (renterNameParam) return;
    getConversation(conversationId).then(conv => setRenterName(conv?.renterName || 'Renter'));
  }, [conversationId]);

  // Opening the thread clears the inbox unread badge for this conversation.
  useEffect(() => {
    markConversationReadByBusiness(conversationId).catch(() => {});
  }, [conversationId]);

  // Real-time message subscription — same path admin and renter both read.
  useEffect(() => {
    const unsub = subscribeToMessages(
      conversationId,
      setMessages,
      err => console.warn('Admin chat subscription error:', err),
    );
    return unsub;
  }, [conversationId]);

  // ── Sending ─────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending || uploading) return;
    setSending(true);
    setInputText('');
    try {
      await sendBusinessMessage(conversationId, ADMIN_ID, text, null);
    } catch {
      showError('Could not send your reply. Please try again.');
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, uploading, conversationId]);

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
      const url = await uploadChatImage(conversationId, result.assets[0].uri);
      await sendBusinessMessage(conversationId, ADMIN_ID, null, url);
    } catch {
      showError('Could not upload the photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [sending, uploading, conversationId, showError]);

  const uploadAndSendVideo = useCallback(async (localUri: string) => {
    setUploading(true);
    try {
      const { url, thumbUrl } = await uploadChatVideo(conversationId, localUri);
      await sendBusinessMessage(conversationId, ADMIN_ID, null, null, url, { videoThumbUrl: thumbUrl });
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
  }, [conversationId, showError]);

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

  // Defensive guard — renters can never reach this route (the Inbox tab is
  // unlinked for them, and firestore.rules block reading/writing any
  // conversation that isn't their own), but block direct navigation too.
  if (!isAdmin) {
    return <Redirect href="/" />;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} variant="bare" size={22} boxSize={36} />

        <InitialAvatar initial={(renterName || '?').charAt(0).toUpperCase()} size={36} />

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{renterName || 'Renter'}</Text>
          <Text style={styles.headerSubtitle}>Renter</Text>
        </View>
      </View>
      <View style={styles.headerDivider} />

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
              <MessageBubble
                key={entry.key}
                message={entry.message}
                viewerRole="business"
                otherPartyInitial={(renterName || '?').charAt(0).toUpperCase()}
                onMediaPress={handleMediaPress}
              />
            )
          )}
        </ScrollView>

        {chatError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{chatError}</Text>
          </View>
        ) : null}

        {/* Saved replies — one tap inserts the text (Admin → Saved replies). */}
        {!!savedReplies?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.savedRow} contentContainerStyle={styles.savedRowContent} keyboardShouldPersistTaps="handled">
            {savedReplies.map(r => (
              <TouchableOpacity key={r.id} style={styles.savedChip} activeOpacity={0.8}
                onPress={() => setInputText(prev => (prev.trim() ? `${prev.trim()} ${r.text}` : r.text))}>
                <Text style={styles.savedChipText} numberOfLines={1}>{r.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
    </View>
  );
}

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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
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
  savedRow: { flexGrow: 0, borderTopWidth: 0.5, borderTopColor: SHADES.border, backgroundColor: SHADES.white },
  savedRowContent: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  savedChip: { maxWidth: 220, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.cream },
  savedChipText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
});
