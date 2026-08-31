import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system';
import { COLORS } from '@/constants/Colors';

export type MediaItemType = 'image' | 'video';

export interface MediaItem {
  url: string;
  type: MediaItemType;
}

export interface MediaViewerProps {
  media: MediaItem[];
  /** Index into `media` to open at. null = closed. */
  openIndex: number | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * Reusable fullscreen media viewer — pinch-to-zoom for images, native playback
 * controls for videos, tap-driven prev/next between items, and a download-to-device
 * action. Deliberately generic (not claims-specific) so it can be reused elsewhere
 * (e.g. chat) later. Receives media directly as a prop from already-loaded
 * in-memory state — never pass Storage URLs through expo-router params, they don't
 * survive the round trip in this app.
 */
export function MediaViewer({ media: mediaProp, openIndex, onClose }: MediaViewerProps) {
  // Defensive — this component is meant to be reusable from any caller, so don't
  // trust `media` to always be a real array even though the prop type says so.
  const media = mediaProp ?? [];
  const { width: W, height: H } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (openIndex != null) setIndex(openIndex);
  }, [openIndex]);

  const current = media[index] ?? null;

  // ── Zoom (image slides only) ────────────────────────────────────────────────
  const scale   = useSharedValue(1);
  const tx      = useSharedValue(0);
  const ty      = useSharedValue(0);
  const savedS  = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [dispW, setDispW] = useState(W);
  const [dispH, setDispH] = useState(H);

  // Reset zoom/pan whenever the displayed item changes.
  useEffect(() => {
    scale.value = 1; tx.value = 0; ty.value = 0;
    savedS.value = 1; savedTx.value = 0; savedTy.value = 0;
    setDispW(W); setDispH(H);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // CONTAIN semantics (whole image visible at rest) — unlike CropScreen's COVER/fill
  // semantics for a fixed crop frame. 1x scale IS this fitted size, not a computed
  // frame-fill ratio.
  const handleLoad = useCallback((e: ImageLoadEventData) => {
    const w = e.source.width;
    const h = e.source.height;
    if (!w || !h) return;
    const fit = Math.min(W / w, H / h);
    setDispW(w * fit);
    setDispH(h * fit);
  }, [W, H]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedS.value = scale.value;
    })
    .onUpdate(e => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedS.value * e.scale));
      scale.value = s;
      const maxX = Math.max(0, (dispW * s - W) / 2);
      const maxY = Math.max(0, (dispH * s - H) / 2);
      if (tx.value >  maxX) tx.value =  maxX;
      if (tx.value < -maxX) tx.value = -maxX;
      if (ty.value >  maxY) ty.value =  maxY;
      if (ty.value < -maxY) ty.value = -maxY;
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate(e => {
      const maxX = Math.max(0, (dispW * scale.value - W) / 2);
      const maxY = Math.max(0, (dispH * scale.value - H) / 2);
      tx.value = Math.max(-maxX, Math.min(maxX, savedTx.value + e.translationX));
      ty.value = Math.max(-maxY, Math.min(maxY, savedTy.value + e.translationY));
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ── Video (current item only — swapping the source prop while mounted swaps
  // playback, so prev/next between video items just works) ─────────────────────
  const videoUri = current?.type === 'video' ? current.url : null;
  const player = useVideoPlayer(videoUri, p => {
    p.loop = false;
    p.play();
  });

  // ── Download ─────────────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!downloadMsg) return;
    const t = setTimeout(() => setDownloadMsg(null), 3000);
    return () => clearTimeout(t);
  }, [downloadMsg]);

  const handleDownload = useCallback(async () => {
    if (!current || downloading) return;
    setDownloading(true);
    setDownloadMsg(null);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setDownloadMsg({ text: 'Photo/video access denied. Please allow it in your device settings.', kind: 'error' });
        return;
      }
      const dest = new Directory(Paths.cache);
      const file = await File.downloadFileAsync(current.url, dest, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(file.uri);
      setDownloadMsg({ text: 'Saved to your device.', kind: 'success' });
    } catch {
      setDownloadMsg({ text: 'Download failed. Please try again.', kind: 'error' });
    } finally {
      setDownloading(false);
    }
  }, [current, downloading]);

  return (
    <Modal
      visible={openIndex != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        {current?.type === 'image' && (
          <GestureDetector gesture={gesture}>
            <View style={StyleSheet.absoluteFillObject}>
              <Animated.View
                style={[
                  s.imgWrap,
                  { width: dispW, height: dispH, left: (W - dispW) / 2, top: (H - dispH) / 2 },
                  animStyle,
                ]}
              >
                <Image
                  source={{ uri: current.url }}
                  style={{ width: dispW, height: dispH }}
                  contentFit="contain"
                  onLoad={handleLoad}
                />
              </Animated.View>
            </View>
          </GestureDetector>
        )}

        {current?.type === 'video' && (
          <VideoView style={s.video} player={player} nativeControls contentFit="contain" />
        )}

        {media.length > 1 && (
          <>
            <TouchableOpacity
              style={[s.navBtn, s.navBtnLeft, index === 0 && s.navBtnDisabled]}
              onPress={() => index > 0 && setIndex(i => i - 1)}
              disabled={index === 0}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="chevron-left" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.navBtn, s.navBtnRight, index === media.length - 1 && s.navBtnDisabled]}
              onPress={() => index < media.length - 1 && setIndex(i => i + 1)}
              disabled={index === media.length - 1}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="chevron-right" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <View style={s.counterPill}>
              <Text style={s.counterText}>{index + 1} / {media.length}</Text>
            </View>
          </>
        )}

        <View style={s.topBar}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={handleDownload}
            disabled={downloading}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {downloading
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Feather name="download" size={20} color={COLORS.white} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {downloadMsg && (
          <View style={[s.msgBanner, downloadMsg.kind === 'error' && s.msgBannerError]}>
            <Text style={s.msgBannerText}>{downloadMsg.text}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  imgWrap: {
    position: 'absolute',
  },
  video: {
    width: '100%',
    height: '100%',
  },

  navBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnLeft: { left: 16 },
  navBtnRight: { right: 16 },
  navBtnDisabled: { opacity: 0.3 },

  counterPill: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },

  topBar: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  msgBanner: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(46,139,87,0.92)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  msgBannerError: {
    backgroundColor: 'rgba(200,65,44,0.92)',
  },
  msgBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
});
