import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { ChatMessage } from '@/lib/chat';
import { VideoLightbox } from './VideoLightbox';

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
}

export function MessageBubble({ message, viewerRole, otherPartyInitial }: MessageBubbleProps) {
  const isOwn = message.senderType === viewerRole;
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
      {!isOwn && <InitialAvatar initial={otherPartyInitial} />}

      <View style={[styles.msgContent, isOwn && styles.msgContentOwn]}>
        {message.videoUrl ? (
          <>
            <TouchableOpacity
              style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleImage]}
              onPress={() => setVideoOpen(true)}
              activeOpacity={0.85}
            >
              <View style={[styles.msgImage, styles.msgVideoPlaceholder]}>
                <View style={styles.playBadge}>
                  <Feather name="play" size={20} color={COLORS.white} />
                </View>
              </View>
            </TouchableOpacity>
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>
              {formatTime(message.createdAt)}
            </Text>
            <VideoLightbox uri={videoOpen ? message.videoUrl : null} onClose={() => setVideoOpen(false)} />
          </>
        ) : message.imageUrl ? (
          <>
            <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleImage]}>
              <Image
                source={{ uri: message.imageUrl }}
                style={styles.msgImage}
                contentFit="cover"
                transition={200}
              />
            </View>
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

const styles = StyleSheet.create({
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
  bubbleOther: {
    backgroundColor: COLORS.softGray200,
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
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Timestamp ──────────────────────────────────────────────────────────
  msgTime: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.fg3,
    marginLeft: 4,
  },
  msgTimeOwn: {
    marginLeft: 0,
    marginRight: 4,
  },
});
