import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/Colors';

// 1:1 square frame — cards display at ~1.15-1.17:1, so resizeMode="cover"
// trims ~8% top/bottom. Acceptable for product listings.
const FRAME = 300;
const CORNER = 22;  // bracket arm length
const CORNER_W = 3; // bracket line thickness

export type CropScreenProps = {
  imageUri: string;
  queueIndex: number;  // 0-based
  queueTotal: number;
  onConfirm: (uri: string) => void;
  onCancel: () => void;
};

export default function CropScreen({
  imageUri,
  queueIndex,
  queueTotal,
  onConfirm,
  onCancel,
}: CropScreenProps) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── Shared values (UI thread) ─────────────────────────────────────────────
  const imgNatW  = useSharedValue(FRAME);
  const imgNatH  = useSharedValue(FRAME);
  const scale    = useSharedValue(1);
  const tx       = useSharedValue(0);
  const ty       = useSharedValue(0);
  const savedS   = useSharedValue(1);
  const savedTx  = useSharedValue(0);
  const savedTy  = useSharedValue(0);
  const initScale = useSharedValue(1); // minimum scale (image fills frame)

  // ── JS state ──────────────────────────────────────────────────────────────
  const [displayW,   setDisplayW]   = useState(FRAME);
  const [displayH,   setDisplayH]   = useState(FRAME);
  const [visible,    setVisible]    = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [atMin,      setAtMin]      = useState(true);
  const [atMax,      setAtMax]      = useState(false);
  const [zoomLabel,  setZoomLabel]  = useState('1.0×');

  // Sync scale → JS thread so zoom buttons can show disabled state + live label
  useAnimatedReaction(
    () => ({ s: scale.value, initS: initScale.value }),
    ({ s, initS }) => {
      runOnJS(setAtMin)(s <= initS + 0.001);
      runOnJS(setAtMax)(s >= 4.999);
      const frac = initS > 0 ? s / initS : 1;
      runOnJS(setZoomLabel)(frac.toFixed(1) + '×');
    },
  );

  // ── onLoad: compute initial scale so the image fills the frame ────────────
  const handleLoad = useCallback((e: ImageLoadEventData) => {
    const w = e.source.width;
    const h = e.source.height;
    if (!w || !h) { setVisible(true); return; }

    // initS ensures the smaller dimension exactly fills FRAME
    const initS = Math.max(FRAME / w, FRAME / h);

    imgNatW.value      = w;
    imgNatH.value      = h;
    scale.value        = initS;
    savedS.value       = initS;
    initScale.value    = initS;
    tx.value           = 0;
    ty.value           = 0;

    setDisplayW(w);
    setDisplayH(h);
    setVisible(true);
  }, []);

  // ── Gestures ──────────────────────────────────────────────────────────────

  // Pinch: scale is clamped to [initS, 5×]
  // Translation is re-clamped after scale changes so the image always covers
  // the frame (no empty space visible inside the crop rectangle).
  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedS.value = scale.value;
    })
    .onUpdate(e => {
      const initS = Math.max(FRAME / imgNatW.value, FRAME / imgNatH.value);
      const s = Math.max(initS, Math.min(5, savedS.value * e.scale));
      scale.value = s;

      const maxX = Math.max(0, (imgNatW.value * s - FRAME) / 2);
      const maxY = Math.max(0, (imgNatH.value * s - FRAME) / 2);
      if (tx.value >  maxX) tx.value =  maxX;
      if (tx.value < -maxX) tx.value = -maxX;
      if (ty.value >  maxY) ty.value =  maxY;
      if (ty.value < -maxY) ty.value = -maxY;
    });

  // Pan: translation clamped so image edges never go inside the frame.
  // maxT formula: (scaledDim - FRAME) / 2 — the "slack" on each side.
  const pan = Gesture.Pan()
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate(e => {
      const maxX = Math.max(0, (imgNatW.value * scale.value - FRAME) / 2);
      const maxY = Math.max(0, (imgNatH.value * scale.value - FRAME) / 2);
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

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  // Step = +20% of current scale (×1.2 in / ÷1.2 out) — symmetric and natural.
  // Animates scale with withTiming(200ms); re-clamps tx/ty instantly to target bounds.
  const handleZoomIn = useCallback(() => {
    const current = scale.value;
    const next = Math.min(5, current * 1.2);
    if (next <= current + 0.001) return;
    scale.value = withTiming(next, { duration: 200 });
    const maxX = Math.max(0, (imgNatW.value * next - FRAME) / 2);
    const maxY = Math.max(0, (imgNatH.value * next - FRAME) / 2);
    if (tx.value >  maxX) tx.value =  maxX;
    if (tx.value < -maxX) tx.value = -maxX;
    if (ty.value >  maxY) ty.value =  maxY;
    if (ty.value < -maxY) ty.value = -maxY;
  }, [scale, tx, ty, imgNatW, imgNatH]);

  const handleZoomOut = useCallback(() => {
    const initS = initScale.value;
    const current = scale.value;
    const next = Math.max(initS, current / 1.2);
    if (next >= current - 0.001) return;
    scale.value = withTiming(next, { duration: 200 });
    const maxX = Math.max(0, (imgNatW.value * next - FRAME) / 2);
    const maxY = Math.max(0, (imgNatH.value * next - FRAME) / 2);
    if (tx.value >  maxX) tx.value =  maxX;
    if (tx.value < -maxX) tx.value = -maxX;
    if (ty.value >  maxY) ty.value =  maxY;
    if (ty.value < -maxY) ty.value = -maxY;
  }, [scale, tx, ty, imgNatW, imgNatH, initScale]);

  // ── Confirm: compute crop rect → manipulateAsync → pass cropped URI ────────
  //
  // Coordinate derivation (frame-space → original image pixels):
  //
  //   The Animated.View is centered on screen (W/2, H/2).
  //   Transforms are: translate(tx, ty) then scale(s), applied from element center.
  //   → image center in screen coords = (W/2 + tx, H/2 + ty)
  //
  //   Distance from image left edge to frame left edge (rendered pixels):
  //     = (imgNatW * s) / 2 - FRAME / 2 - tx
  //
  //   Convert to original image pixels (÷ s):
  //     originX = imgNatW / 2 - FRAME / (2 * s) - tx / s
  //     originY = imgNatH / 2 - FRAME / (2 * s) - ty / s
  //     cropW   = FRAME / s
  //     cropH   = FRAME / s
  //
  const handleConfirm = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      const s    = scale.value;
      const natW = imgNatW.value;
      const natH = imgNatH.value;
      const panX = tx.value;
      const panY = ty.value;

      const cropSide = FRAME / s;
      const rawX = natW / 2 - FRAME / (2 * s) - panX / s;
      const rawY = natH / 2 - FRAME / (2 * s) - panY / s;

      // Round to integers — manipulateAsync requires integer pixel coordinates
      const originX = Math.round(rawX);
      const originY = Math.round(rawY);
      const cropW   = Math.round(cropSide);
      const cropH   = Math.round(cropSide);

      // Clamp to image bounds (guards against floating-point edge drift)
      const safeX = Math.max(0, Math.min(natW - 1, originX));
      const safeY = Math.max(0, Math.min(natH - 1, originY));
      const safeW = Math.max(1, Math.min(natW - safeX, cropW));
      const safeH = Math.max(1, Math.min(natH - safeY, cropH));

      const result = await manipulateAsync(
        imageUri,
        [
          { crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } },
          { resize: { width: 1600 } },
        ],
        { compress: 0.7, format: SaveFormat.JPEG },
      );

      onConfirm(result.uri);
    } catch {
      // If manipulation fails (corrupted file, extreme coords), fall back to original
      onConfirm(imageUri);
    } finally {
      setConfirming(false);
    }
  }, [confirming, imageUri, onConfirm, scale, tx, ty, imgNatW, imgNatH]);

  // ── Frame geometry ────────────────────────────────────────────────────────
  const frameTop  = (H - FRAME) / 2;
  const frameLeft = (W - FRAME) / 2;
  const headerPT  = insets.top > 0 ? insets.top + 8 : (Platform.OS === 'android' ? 40 : 16);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[s.root, { width: W, height: H }]}>

        {/* ── Image + gesture layer ──────────────────────────────────────── */}
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { opacity: visible ? 1 : 0 }]}>
              <Animated.View
                style={[
                  s.imgWrap,
                  {
                    width:  displayW,
                    height: displayH,
                    left:   (W - displayW) / 2,
                    top:    (H - displayH) / 2,
                  },
                  animStyle,
                ]}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: displayW, height: displayH }}
                  contentFit="fill"
                  onLoad={handleLoad}
                />
              </Animated.View>
            </View>
          </View>
        </GestureDetector>

        {/* ── Dim overlay — 4 strips around the frame ───────────────────── */}
        <View pointerEvents="none" style={[s.dim, { top: 0, left: 0, right: 0, height: frameTop }]} />
        <View pointerEvents="none" style={[s.dim, { top: frameTop + FRAME, left: 0, right: 0, bottom: 0 }]} />
        <View pointerEvents="none" style={[s.dim, { top: frameTop, left: 0, width: frameLeft, height: FRAME }]} />
        <View pointerEvents="none" style={[s.dim, { top: frameTop, right: 0, width: W - frameLeft - FRAME, height: FRAME }]} />

        {/* ── Crop frame — corner bracket overlay ───────────────────────── */}
        <View pointerEvents="none" style={[s.frameBox, { top: frameTop, left: frameLeft }]}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
        </View>

        {/* ── Zoom controls — between frame and footer ──────────────────── */}
        <View style={[s.zoomRow, { top: frameTop + FRAME + 28 }]}>
          <TouchableOpacity
            style={[s.zoomBtn, atMin && s.zoomBtnDisabled]}
            onPress={handleZoomOut}
            disabled={atMin}
            activeOpacity={0.7}
          >
            <Text style={s.zoomBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={s.zoomLabelText}>{zoomLabel}</Text>
          <TouchableOpacity
            style={[s.zoomBtn, atMax && s.zoomBtnDisabled]}
            onPress={handleZoomIn}
            disabled={atMax}
            activeOpacity={0.7}
          >
            <Text style={s.zoomBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View pointerEvents="none" style={[s.header, { paddingTop: headerPT }]}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>Crop photo</Text>
            {queueTotal > 1 && (
              <View style={s.queuePill}>
                <Text style={s.queuePillText}>{queueIndex + 1} / {queueTotal}</Text>
              </View>
            )}
          </View>
          <Text style={s.headerHint}>Pinch to zoom · drag to reposition</Text>
        </View>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.confirmBtn, confirming && s.confirmBtnBusy]}
            onPress={handleConfirm}
            disabled={confirming}
            activeOpacity={0.85}
          >
            {confirming ? (
              <ActivityIndicator size="small" color={COLORS.carbon} />
            ) : (
              <Text style={s.confirmText}>Use photo</Text>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </GestureHandlerRootView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  imgWrap: {
    position: 'absolute',
  },

  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  // Frame: no border, only corner brackets so the view inside looks open
  frameBox: {
    position: 'absolute',
    width: FRAME,
    height: FRAME,
  },

  // Corner brackets — each is an L-shape formed by two border edges
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W,
    borderColor: COLORS.white,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_W, borderRightWidth: CORNER_W,
    borderColor: COLORS.white,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W,
    borderColor: COLORS.white,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W,
    borderColor: COLORS.white,
  },

  // Zoom controls
  zoomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: COLORS.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnDisabled: {
    opacity: 0.28,
  },
  zoomBtnText: {
    fontSize: 24,
    fontWeight: '300',
    color: COLORS.white,
    lineHeight: 28,
    includeFontPadding: false,
  },
  zoomLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    minWidth: 40,
    textAlign: 'center',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  queuePill: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  queuePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  headerHint: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  confirmBtn: {
    flex: 2,
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnBusy: {
    opacity: 0.65,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
