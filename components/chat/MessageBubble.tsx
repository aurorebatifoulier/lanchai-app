import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { ChatMessage } from '@/lib/chat';
import { CHAT_COPY } from '@/constants/chatCopy';

const BUBBLE_RADIUS = 16;

export function formatTime(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function InitialAvatar({ initial, size = 28 }: { initial: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  /** Whose screen this is rendered on — used to decide which side a message lands on. */
  viewerRole: 'renter' | 'business';
  /** Initial shown in the avatar for the other party's messages. */
  otherPartyInitial: string;
  /** Called with the tapped image/video URL — the parent screen owns the fullscreen
   * viewer (MediaViewer) since it needs the full conversation's media list for
   * prev/next navigation, which a single bubble has no visibility into. */
  onMediaPress: (url: string) => void;
  /** Renter chat: no avatar next to LANCHAI's bubbles (the header carries the mark). */
  hideAvatar?: boolean;
}

export function MessageBubble({ message, viewerRole, otherPartyInitial, onMediaPress, hideAvatar }: MessageBubbleProps) {
  const isOwn = message.senderType === viewerRole;

  return (
    <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
      {!isOwn && !hideAvatar && <InitialAvatar initial={otherPartyInitial} />}

      <View style={[styles.msgContent, isOwn && styles.msgContentOwn]}>
        {!!message.about && <Text style={[styles.aboutLine, isOwn && styles.msgTimeOwn]}>{CHAT_COPY.aboutLine(message.about.name)}</Text>}
        {message.videoUrl || message.imageUrl ? (
          <>
            <MediaTile message={message} onOpen={onMediaPress} />
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>
              {formatTime(message.createdAt)}
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
              <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                {message.text}
              </Text>
            </View>
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>
              {formatTime(message.createdAt)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

// Photo / video tile — never an empty dark block: a video shows its poster frame (or a
// light "Video · Tap to play" card for older videos without one); a photo that can't
// load shows a light frame with "Tap to retry" (remounts the image).
function MediaTile({ message, onOpen }: { message: ChatMessage; onOpen: (url: string) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isVideo = !!message.videoUrl;
  const url = (message.videoUrl ?? message.imageUrl)!;
  const poster = isVideo ? message.videoThumbUrl ?? null : message.imageUrl;

  if (failed && !isVideo) {
    return (
      <TouchableOpacity style={[styles.msgImage, styles.mediaFallback]} activeOpacity={0.8}
        onPress={() => { setFailed(false); setAttempt(a => a + 1); }}>
        <Feather name="image" size={22} color={SHADES.carbonMuted} />
        <Text style={styles.mediaFallbackText}>{CHAT_COPY.photoFailed}</Text>
      </TouchableOpacity>
    );
  }
  if (isVideo && (!poster || failed)) {
    return (
      <TouchableOpacity style={[styles.msgImage, styles.mediaFallback]} activeOpacity={0.8} onPress={() => onOpen(url)}>
        <View style={styles.playBadgeLight}><Feather name="play" size={18} color={SHADES.carbon} /></View>
        <Text style={styles.mediaFallbackText}>{CHAT_COPY.videoTap}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={[styles.msgImage, styles.mediaFrame]} activeOpacity={0.85} onPress={() => onOpen(url)}>
      <Image
        key={attempt}
        source={{ uri: poster! }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={200}
        onError={() => setFailed(true)}
      />
      {isVideo && <View style={styles.playBadge}><Feather name="play" size={20} color={COLORS.white} /></View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  aboutLine: { fontSize: 12, fontWeight: '600', color: SHADES.amberText, marginBottom: 3 },
  mediaFrame: { overflow: 'hidden', backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  mediaFallback: {
    backgroundColor: SHADES.amberPale, borderWidth: 0.5, borderColor: SHADES.border,
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 3,
  },
  mediaFallbackText: { fontSize: 13, fontWeight: '600', color: SHADES.carbonMuted },
  playBadgeLight: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: SHADES.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: SHADES.border,
  },
  // ── Avatar ─────────────────────────────────────────────────────────────
  avatar: {
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontWeight: '800',
    color: COLORS.porcelain,
    letterSpacing: 0.5,
  },

  // ── Message rows ───────────────────────────────────────────────────────
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowOwn: {
    flexDirection: 'row-reverse',
  },
  msgContent: {
    maxWidth: '76%',
  },
  msgContentOwn: {
    alignItems: 'flex-end',
  },

  // ── Bubbles ────────────────────────────────────────────────────────────
  bubble: {
    borderRadius: BUBBLE_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 3,
  },
  bubbleImage: {
    padding: 0,
    overflow: 'hidden',
  },
  // Incoming: white card bubble (My Account cards), outgoing: carbon.
  bubbleOther: {
    backgroundColor: SHADES.white,
    borderWidth: 0.5,
    borderColor: SHADES.border,
    borderTopLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: COLORS.carbon,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: COLORS.porcelain,
  },

  // ── Image in bubble ────────────────────────────────────────────────────
  msgImage: {
    width: 220,
    height: 165,
    borderRadius: BUBBLE_RADIUS,
  },

  // ── Video placeholder + play overlay ──────────────────────────────────
  msgVideoPlaceholder: {
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,30,30,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Timestamp ──────────────────────────────────────────────────────────
  msgTime: {
    fontSize: 10,
    fontWeight: '500',
    color: SHADES.carbonMuted,
    marginLeft: 4,
  },
  msgTimeOwn: {
    marginLeft: 0,
    marginRight: 4,
  },
});
