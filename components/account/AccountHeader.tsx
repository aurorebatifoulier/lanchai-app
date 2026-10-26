import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Defs, Mask, Path, Polygon } from 'react-native-svg';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { vteMinutesOfDay } from '@/functions/src/shared/dates';

// My Account header (validated mockup): white band, avatar with a thin amber ring (photo
// button kept), greeting by Vientiane time + first name, tier chip + status chip, and a
// subtle decor (dashed "flight path" drawing itself to a tiny amber hexagon + 4 floating
// item bubbles). The decor lives in its OWN right-hand column (width scaled to the
// screen) that the text column never enters — it can't overlap the greeting, name or
// chips on any width. Brand shades only. Motion is skipped with "reduce motion".

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Drawn in a 250 × 170 box, scaled to the decor column.
const BASE_W = 250;
const BASE_H = 170;
const PATH = 'M 18 150 C 60 150, 40 95, 80 82 S 120 30, 160 40 S 210 70, 236 22';
const PATH_LEN = 420; // ≥ the path's length — only drives the drawing speed

const BUBBLES: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; x: number; y: number; bg: string; fg: string; rot: string }[] = [
  { icon: 'tent', x: 60, y: 92, bg: SHADES.amberLight, fg: SHADES.amberDeep, rot: '-8deg' },
  { icon: 'speaker', x: 92, y: 24, bg: SHADES.carbonLight, fg: SHADES.carbon, rot: '6deg' },
  { icon: 'hammer-wrench', x: 198, y: 68, bg: SHADES.amberMid, fg: SHADES.carbon, rot: '-6deg' },
  { icon: 'bike', x: 184, y: 128, bg: SHADES.carbon, fg: SHADES.amber, rot: '5deg' },
];

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Decor column width: ~26% of the screen, between 84 and 130 px (narrow phones keep
 *  ≥ ~125 px for the text column; chips wrap rather than overlap). */
const decorWidth = (screenW: number) => Math.round(Math.min(130, Math.max(84, screenW * 0.26)));

function Decor({ width }: { width: number }) {
  const reduce = useReduceMotion();
  const k = width / BASE_W;
  const height = Math.round(BASE_H * k);
  const bubble = Math.max(24, Math.round(36 * k));
  const draw = useRef(new Animated.Value(PATH_LEN)).current;
  const floats = useMemo(() => BUBBLES.map(() => new Animated.Value(0)), []);

  useEffect(() => {
    if (reduce) { draw.setValue(0); return; }
    draw.setValue(PATH_LEN);
    Animated.timing(draw, { toValue: 0, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const loops = floats.map((v, i) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1800 + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1800 + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [reduce, draw, floats]);

  return (
    <View pointerEvents="none" style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${BASE_W} ${BASE_H}`}>
        <Defs>
          <Mask id="reveal">
            <AnimatedPath d={PATH} stroke="#fff" strokeWidth={8} fill="none" strokeDasharray={[PATH_LEN, PATH_LEN]} strokeDashoffset={draw} />
          </Mask>
        </Defs>
        <Path d={PATH} stroke={SHADES.amberMid} strokeWidth={2 / k} strokeDasharray={[4 / k, 6 / k]} strokeLinecap="round" fill="none" mask="url(#reveal)" />
        <Polygon points="236,12 245,17 245,27 236,32 227,27 227,17" fill={SHADES.amber} />
      </Svg>
      {BUBBLES.map((b, i) => (
        <Animated.View
          key={b.icon}
          style={[s.bubble, {
            width: bubble, height: bubble, borderRadius: bubble / 2,
            // Centre each bubble on its point, clamped inside the column.
            left: Math.min(width - bubble, Math.max(0, b.x * k - bubble / 2 + 18 * k)),
            top: Math.min(height - bubble, Math.max(0, b.y * k - bubble / 2 + 18 * k)),
            backgroundColor: b.bg,
            transform: [
              { rotate: b.rot },
              { translateY: floats[i].interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 2 : -2] }) },
            ],
          }]}
        >
          <MaterialCommunityIcons name={b.icon} size={Math.round(bubble * 0.47)} color={b.fg} />
        </Animated.View>
      ))}
    </View>
  );
}

export interface AccountHeaderProps {
  firstName: string;
  initial: string;
  avatarUri: string | null;
  uploading: boolean;
  onAvatarPress: () => void;
  /** null for business / excluded accounts (no tier chip). */
  tierLabel: string | null;
  statusLabel: string;
  onStatusPress: () => void;
  /** Reports the header's height (the compact bar appears once scrolled past it). */
  onHeight?: (h: number) => void;
}

export function AccountHeader(p: AccountHeaderProps) {
  const { width: screenW } = useWindowDimensions();
  const hour = Math.floor(vteMinutesOfDay(Date.now()) / 60);
  const dw = decorWidth(screenW);
  return (
    <View style={s.header} onLayout={e => p.onHeight?.(e.nativeEvent.layout.height)}>
      <View style={s.row}>
        <TouchableOpacity onPress={p.onAvatarPress} activeOpacity={0.85} style={s.ring}>
          {p.uploading ? (
            <View style={s.avatar}><ActivityIndicator size="small" color={SHADES.carbon} /></View>
          ) : p.avatarUri ? (
            <Image source={{ uri: p.avatarUri }} style={s.avatar} contentFit="cover" />
          ) : (
            <View style={s.avatar}><Text style={s.initial}>{p.initial}</Text></View>
          )}
          <View style={s.camera}><Feather name="camera" size={10} color={SHADES.carbon} /></View>
        </TouchableOpacity>
        {/* Text column — never extends into the decor column (safe margin via gap). */}
        <View style={s.info}>
          <Text style={s.greeting} numberOfLines={1}>{ACCOUNT_COPY.greeting(hour)}</Text>
          <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{ACCOUNT_COPY.name(p.firstName)}</Text>
          <View style={s.chips}>
            {p.tierLabel && (
              <View style={[UI.chip, UI.chipCarbon, s.headerChip]}>
                <Feather name="award" size={12} color={SHADES.amber} />
                <Text style={[UI.chipText, s.headerChipText, { color: SHADES.cream }]}>{p.tierLabel}</Text>
              </View>
            )}
            <TouchableOpacity style={[UI.chip, UI.chipGrey, s.headerChip]} onPress={p.onStatusPress} activeOpacity={0.75}>
              <Text style={[UI.chipText, s.headerChipText]} numberOfLines={1}>{p.statusLabel}</Text>
              <Feather name="chevron-right" size={12} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
        </View>
        {/* Decor column (behind nothing — its own space on the right). */}
        <Decor width={dw} />
      </View>
    </View>
  );
}

/**
 * Compact sticky bar (pinned below the safe area) shown once the full header has scrolled
 * away: small avatar with amber ring, first name, tier chip. Opacity + slide driven by the
 * scroll position (native driver, no layout change); instant with "reduce motion".
 */
export function AccountCompactBar({
  scrollY, threshold, top, firstName, initial, avatarUri, tierLabel,
}: {
  scrollY: Animated.Value;
  threshold: number;
  top: number;
  firstName: string;
  initial: string;
  avatarUri: string | null;
  tierLabel: string | null;
}) {
  const reduce = useReduceMotion();
  const start = Math.max(0, threshold - (reduce ? 1 : 40));
  const opacity = scrollY.interpolate({ inputRange: [start, threshold], outputRange: [0, 1], extrapolate: 'clamp' });
  const translateY = reduce ? 0 : scrollY.interpolate({ inputRange: [start, threshold], outputRange: [-8, 0], extrapolate: 'clamp' });
  return (
    <Animated.View pointerEvents="none" style={[s.compact, { top, opacity, transform: [{ translateY }] }]}>
      <View style={s.compactRing}>
        {avatarUri
          ? <Image source={{ uri: avatarUri }} style={s.compactAvatar} contentFit="cover" />
          : <View style={s.compactAvatar}><Text style={s.compactInitial}>{initial}</Text></View>}
      </View>
      <Text style={s.compactName} numberOfLines={1}>{firstName}</Text>
      {tierLabel && (
        <View style={[UI.chip, UI.chipCarbon, s.compactChip]}>
          <Feather name="award" size={11} color={SHADES.amber} />
          <Text style={[UI.chipTextSmall, { color: SHADES.cream }]}>{tierLabel}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: SHADES.white, marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26,
    borderBottomWidth: 0.5, borderBottomColor: SHADES.border, overflow: 'hidden',
  },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: SHADES.amber, padding: 3 },
  avatar: { flex: 1, borderRadius: 33, backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontSize: 26, fontWeight: '600', color: SHADES.carbon },
  camera: {
    position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SHADES.white,
  },
  info: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted },
  name: { fontSize: 28, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.8, marginTop: 1 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  headerChip: { paddingHorizontal: 9, paddingVertical: 5 },
  headerChipText: { fontSize: 13 },
  compact: {
    position: 'absolute', left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  compactRing: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: SHADES.amber, padding: 2 },
  compactAvatar: { flex: 1, borderRadius: 12, backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  compactInitial: { fontSize: 12, fontWeight: '700', color: SHADES.carbon },
  compactName: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: SHADES.carbon },
  compactChip: { paddingHorizontal: 8, paddingVertical: 4 },
});
