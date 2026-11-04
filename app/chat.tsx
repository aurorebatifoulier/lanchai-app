import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  AppState,
} from 'react-native';
import { Text } from '@/components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import { UI, useScreenInsets } from '@/components/account/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ChatThread } from '@/components/chat/ChatThread';
import { ChatMark, ContextCard, QuickQuestions, ReplyLine, ReadMark, PendingMark } from '@/components/chat/ChatHeaderParts';
import { CHAT_COPY } from '@/constants/chatCopy';
import { getProduct, getReservationById } from '@/lib/firestore';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { useChatKeyboard } from '@/components/chat/useChatKeyboard';
import { MediaViewer } from '@/components/MediaViewer';
import {
  ChatMessage,
  type ChatAbout,
  type MessageExtra,
  initConversation,
  markConversationReadByRenter,
  newClientMessageId,
  sendMessage,
  subscribeToMessages,
  uploadChatImage,
  uploadChatVideo,
} from '@/lib/chat';
import { productThumb } from '@/utils/productImage';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const screen = useScreenInsets();
  const { user } = useAuth();
  // The route is account-gated (app/_layout.tsx); '' only for the instant a sign-out
  // unmounts this screen — every write below checks it.
  const RENTER_ID   = user?.uid ?? '';
  const RENTER_NAME = user?.displayName || user?.email || 'Renter';
  const { keyboardShown } = useChatKeyboard();

  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  // ?productId= / ?rentalId= → pinned "About" card; the first message sent from here
  // carries `about` so staff see what it's about.
  // ?ask= (My rentals "Extend") prefills the input — never sent automatically.
  const { productId, rentalId, ask } = useLocalSearchParams<{ productId?: string; rentalId?: string; ask?: string }>();
  const [context, setContext] = useState<(ChatAbout & { image: string | null; category: string | null }) | null>(null);
  const aboutSent = useRef(false);
  // Read on EVERY focus (the chat may already be mounted and reopened from another
  // product / rental): new params → new card, no params → no card.
  const loadContext = useCallback(() => {
    const pid = productId ? String(productId) : null;
    const rid = rentalId ? String(rentalId) : null;
    if (ask) setInputText(String(ask).slice(0, 500));
    if (!pid && !rid) { setContext(null); return; }
    const key = pid ? `product:${pid}` : `rental:${rid}`;
    setContext(prev => (prev && `${prev.kind}:${prev.id}` === key ? prev : null));
    aboutSent.current = false;
    if (pid) {
      getProduct(pid)
        .then(p => { if (p) setContext({ kind: 'product', id: p.id, name: p.name, image: productThumb(p), category: p.category ?? null }); })
        .catch(() => {});
    } else if (rid) {
      getReservationById(rid)
        .then(r => { if (r) setContext({ kind: 'rental', id: r.id, name: r.productName, image: r.productImage ?? null, category: null }); })
        .catch(() => {});
    }
  }, [productId, rentalId, ask]);
  useFocusEffect(loadContext);
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

  // Init conversation (creates doc + welcome message on first visit, one transaction).
  // Retried on every focus while it hasn't succeeded; sendMessage also creates the
  // conversation itself if it's still missing, so a first message never gets lost.
  const convReady = useRef(false);
  const ensureConversation = useCallback(() => {
    if (convReady.current || !RENTER_ID) return;
    initConversation(RENTER_ID, RENTER_NAME)
      .then(() => { convReady.current = true; })
      .catch(() => {});
  }, [RENTER_ID, RENTER_NAME]);
  useFocusEffect(ensureConversation);

  // Opening the chat clears the renter's own unread badge.
  useEffect(() => {
    if (RENTER_ID) markConversationReadByRenter(RENTER_ID).catch(() => {});
  }, [RENTER_ID]);

  // Real-time message subscription
  useEffect(() => {
    if (!RENTER_ID) return;
    const unsub = subscribeToMessages(
      RENTER_ID,
      setMessages,
      err => console.warn('Chat subscription error:', err),
    );
    return unsub;
  }, [RENTER_ID]);

  // ── Sending (queue + retry) ─────────────────────────────────────────────────
  // Every message gets a client id BEFORE it's sent and shows at once in the thread
  // ("Sending…"). sendMessage writes it under that id in one transaction (conversation
  // created if missing), so a retry can never duplicate it. A failure keeps it in the
  // thread as "Not sent · Retry" (tap) — also retried automatically when the app comes
  // back to the foreground. Pending lines live in this screen only (not persisted).
  type Pending = {
    clientId: string; text: string | null; imageUrl: string | null; videoUrl: string | null;
    extra: MessageExtra; status: 'sending' | 'failed';
  };
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;

  const deliver = useCallback(async (p: Pending) => {
    if (!RENTER_ID) return;
    setPending(list => list.map(x => (x.clientId === p.clientId ? { ...x, status: 'sending' } : x)));
    try {
      await sendMessage(RENTER_ID, p.text, p.imageUrl, p.videoUrl, { ...p.extra, clientId: p.clientId, renterName: RENTER_NAME });
      convReady.current = true;
      setPending(list => list.filter(x => x.clientId !== p.clientId));
    } catch {
      setPending(list => list.map(x => (x.clientId === p.clientId ? { ...x, status: 'failed' } : x)));
    }
  }, [RENTER_ID, RENTER_NAME]);

  const enqueue = useCallback((msg: Omit<Pending, 'clientId' | 'status'>) => {
    const p: Pending = { ...msg, clientId: newClientMessageId(), status: 'sending' };
    setPending(list => [...list, p]);
    return deliver(p);
  }, [deliver]);

  const retry = useCallback((clientId: string) => {
    const p = pendingRef.current.find(x => x.clientId === clientId);
    if (p && p.status === 'failed') deliver(p);
  }, [deliver]);

  // Back in the foreground → retry every failed message (in order).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      ensureConversation();
      pendingRef.current.filter(p => p.status === 'failed').forEach(p => { deliver(p); });
    });
    return () => sub.remove();
  }, [deliver, ensureConversation]);

  const sendText = useCallback((raw: string, fromInput: boolean) => {
    const text = raw.trim();
    if (!text || !RENTER_ID) return;
    if (fromInput) setInputText('');
    setSentThisSession(true);
    const about = context && !aboutSent.current
      ? { kind: context.kind, id: context.id, name: context.name }
      : null;
    // The context goes with the first message only — also on its retries.
    if (about) aboutSent.current = true;
    enqueue({ text, imageUrl: null, videoUrl: null, extra: about ? { about } : {} });
  }, [context, RENTER_ID, enqueue]);
  const handleSend = useCallback(() => sendText(inputText, true), [sendText, inputText]);

  const handlePickImage = useCallback(async () => {
    if (uploading) return;

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
      // Uploaded → the message itself goes through the queue (Retry keeps the same file).
      enqueue({ text: null, imageUrl: url, videoUrl: null, extra: {} });
    } catch {
      showError('Could not upload the photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [uploading, showError, RENTER_ID, enqueue]);

  const uploadAndSendVideo = useCallback(async (localUri: string) => {
    setUploading(true);
    try {
      const { url, thumbUrl } = await uploadChatVideo(RENTER_ID, localUri);
      enqueue({ text: null, imageUrl: null, videoUrl: url, extra: { videoThumbUrl: thumbUrl } });
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
  }, [showError, RENTER_ID, enqueue]);

  const handleRecordVideo = useCallback(async () => {
    if (uploading) return;

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
  }, [uploading, showError, uploadAndSendVideo]);

  const handlePickVideo = useCallback(async () => {
    if (uploading) return;

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
  }, [uploading, showError, uploadAndSendVideo]);

  // ── Day-separated render list ──────────────────────────────────────────────

  // Server messages + the ones still pending (deduped as soon as the snapshot has them).
  const shown = useMemo(() => {
    if (pending.length === 0) return messages;
    const ids = new Set(messages.map(m => m.id));
    const extra: ChatMessage[] = pending
      .filter(p => !ids.has(p.clientId))
      .map(p => ({
        id: p.clientId, senderId: RENTER_ID, senderType: 'renter', text: p.text,
        imageUrl: p.imageUrl, videoUrl: p.videoUrl, videoThumbUrl: p.extra.videoThumbUrl,
        about: p.extra.about, createdAt: null, read: false,
      }));
    return extra.length ? [...messages, ...extra] : messages;
  }, [messages, pending, RENTER_ID]);
  const pendingStatus = useMemo(() => new Map(pending.map(p => [p.clientId, p.status])), [pending]);

  const hasRenterMessage = messages.some(m => m.senderType === 'renter');
  // Quick questions: an empty conversation, or any chat opened with a context card —
  // contextual ones for a product / rental. Hidden once the renter sends a message here.
  const [sentThisSession, setSentThisSession] = useState(false);
  const showQuick = !sentThisSession && (!hasRenterMessage || !!context);
  const quickQuestions = context?.kind === 'product' ? CHAT_COPY.quickProduct
    : context?.kind === 'rental' ? CHAT_COPY.quickRental
    : CHAT_COPY.quick;
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
        <ChatThread
          messages={shown}
          viewerRole="renter"
          otherPartyInitial="L"
          hideAvatar
          onMediaPress={handleMediaPress}
          afterMessage={m => {
            const st = pendingStatus.get(m.id);
            if (st && !m.createdAt) return <PendingMark failed={st === 'failed'} onRetry={() => retry(m.id)} />;
            return m.id === lastReadRenterId ? <ReadMark /> : null;
          }}
          footer={showQuick ? <QuickQuestions questions={quickQuestions} onAsk={q => sendText(q, false)} /> : null}
        />

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
          sending={false}
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
