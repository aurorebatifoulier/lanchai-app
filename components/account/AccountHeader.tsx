import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo, ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Mask, Path, Polygon } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { vteMinutesOfDay } from '@/functions/src/shared/dates';
import { useMyLoyalty } from '@/lib/loyaltyUi';

// My Account header (validated mockup): white band, avatar with a thin amber ring (photo
// button kept), greeting by Vientiane time + first name, tier chip + status chip, and a
// subtle decor (dashed "flight path" drawing itself to a tiny amber hexagon + 4 floating
// item bubbles) behind the text; bubbles that would touch the measured text block are
// hidden (never overlap the greeting, name or chips). Brand shades only. Motion is
// skipped with "reduce motion".

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Decor box (top-right of the header, as in the validated mockup): 250 × 170.
const DECOR_W = 250;
const DECOR_H = 170;
const DECOR_RIGHT = -6;
const DECOR_TOP = 4;
const BUBBLE = 36;
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

/** Text block (greeting + name + chips) in header coordinates, from onLayout. */
interface Box { left: number; top: number; right: number; bottom: number }
const MARGIN = 8;

/**
 * Previous decor (dashed path to the amber hexagon + 4 bubbles), drawn BEHIND the text.
 * A bubble whose box would touch the measured text block (+ margin) is hidden — narrow
 * screens lose bubbles rather than shrinking everything. Bubbles wait for the measure.
 */
function Decor({ headerWidth, text }: { headerWidth: number; text: Box | null }) {
  const reduce = useReduceMotion();
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

  const decorLeft = headerWidth - DECOR_W - DECOR_RIGHT;
  const clear = (b: { x: number; y: number }) => {
    if (!text || !headerWidth) return false;
    const l = decorLeft + b.x, t = DECOR_TOP + b.y, r = l + BUBBLE, btm = t + BUBBLE;
    return r < text.left - MARGIN || l > text.right + MARGIN || btm < text.top - MARGIN || t > text.bottom + MARGIN;
  };

  return (
    <View pointerEvents="none" style={s.decor}>
      <Svg width={DECOR_W} height={DECOR_H} viewBox={`0 0 ${DECOR_W} ${DECOR_H}`}>
        <Defs>
          <Mask id="reveal">
            <AnimatedPath d={PATH} stroke="#fff" strokeWidth={8} fill="none" strokeDasharray={[PATH_LEN, PATH_LEN]} strokeDashoffset={draw} />
          </Mask>
        </Defs>
        <Path d={PATH} stroke={SHADES.amberMid} strokeWidth={2} strokeDasharray={[4, 6]} strokeLinecap="round" fill="none" mask="url(#reveal)" />
        <Polygon points="236,12 245,17 245,27 236,32 227,27 227,17" fill={SHADES.amber} />
      </Svg>
      {BUBBLES.map((b, i) => clear(b) && (
        <Animated.View
          key={b.icon}
          style={[s.bubble, {
            left: b.x, top: b.y, backgroundColor: b.bg,
            transform: [
              { rotate: b.rot },
              { translateY: floats[i].interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 3 : -3] }) },
            ],
          }]}
        >
          <MaterialCommunityIcons name={b.icon} size={17} color={b.fg} />
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

const PAD_X = 20;
const PAD_TOP = 22;

export function AccountHeader(p: AccountHeaderProps) {
  const hour = Math.floor(vteMinutesOfDay(Date.now()) / 60);
  const [headerWidth, setHeaderWidth] = useState(0);
  // Text column position (relative to the row) + the widest of its lines.
  const [col, setCol] = useState<{ x: number; y: number; h: number } | null>(null);
  const [lineW, setLineW] = useState<Record<string, number>>({});
  const onLine = (key: string) => (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    setLineW(prev => (prev[key] === w ? prev : { ...prev, [key]: w }));
  };
  const maxW = Math.max(0, ...Object.values(lineW));
  const text: Box | null = col && maxW
    ? { left: PAD_X + col.x, top: PAD_TOP + col.y, right: PAD_X + col.x + maxW, bottom: PAD_TOP + col.y + col.h }
    : null;

  return (
    <View
      style={s.header}
      onLayout={e => { setHeaderWidth(e.nativeEvent.layout.width); p.onHeight?.(e.nativeEvent.layout.height); }}
    >
      {/* Decor first → behind the text (and zIndex below it). */}
      <Decor headerWidth={headerWidth} text={text} />
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
        <View style={s.info} onLayout={e => { const { x, y, height } = e.nativeEvent.layout; setCol({ x, y, h: height }); }}>
          <Text style={[s.greeting, s.fit]} numberOfLines={1} onLayout={onLine('greeting')}>{ACCOUNT_COPY.greeting(hour)}</Text>
          <Text style={[s.name, s.fit]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} onLayout={onLine('name')}>
            {ACCOUNT_COPY.name(p.firstName)}
          </Text>
          {/* Chips stacked: tier, then status below it. */}
          <View style={[s.chips, s.fit]} onLayout={onLine('chips')}>
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
      </View>
    </View>
  );
}

/**
 * Compact sticky bar (pinned below the safe area) shown once the full header has scrolled
 * away: small avatar with amber ring, first name, tier chip, and on the right the points
 * (amber) next to a small ring showing progress to the next tier (same tierProgress as the
 * loyalty card; full ring at the top tier) → Loyalty screen. Nothing on the right for
 * excluded / business accounts. Opacity + slide driven by the scroll position (native
 * driver, no layout change); instant with "reduce motion". Touchable only while visible.
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
  const router = useRouter();
  const loyalty = useMyLoyalty();
  const showPoints = !loyalty.loading && !loyalty.excluded && !!loyalty.progress;
  // Touches only once the bar is (mostly) shown — it sits over the header otherwise.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const v = value >= threshold - 10;
      setVisible(prev => (prev === v ? prev : v));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, threshold]);
  const C = 2 * Math.PI * RING_R;
  return (
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[s.compact, { top, opacity, transform: [{ translateY }] }]}>
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
      {showPoints && (
        <TouchableOpacity
          style={s.compactPoints}
          onPress={() => router.push('/profile/loyalty')}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${loyalty.points.toLocaleString('en-US')} points, open loyalty`}
        >
          <Text style={s.compactPointsText}>{loyalty.points.toLocaleString('en-US')} pts</Text>
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={SHADES.amberLight} strokeWidth={RING_STROKE} fill="none" />
            <Circle
              cx={RING / 2} cy={RING / 2} r={RING_R}
              stroke={SHADES.amber} strokeWidth={RING_STROKE} fill="none" strokeLinecap="round"
              strokeDasharray={[C, C]} strokeDashoffset={C * (1 - (loyalty.progress?.fraction ?? 0))}
              rotation={-90} origin={`${RING / 2}, ${RING / 2}`}
            />
          </Svg>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const RING = 26;
const RING_STROKE = 3;
const RING_R = (RING - RING_STROKE) / 2;

const s = StyleSheet.create({
  header: {
    backgroundColor: SHADES.white, marginHorizontal: -16, paddingHorizontal: PAD_X, paddingTop: PAD_TOP, paddingBottom: 26,
    borderBottomWidth: 0.5, borderBottomColor: SHADES.border, overflow: 'hidden', minHeight: DECOR_H,
  },
  decor: { position: 'absolute', right: DECOR_RIGHT, top: DECOR_TOP, width: DECOR_W, height: DECOR_H, zIndex: 0 },
  bubble: {
    position: 'absolute', width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  fit: { alignSelf: 'flex-start' }, // lines sized to their content (measured for the decor)
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 1 },
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
  chips: { alignItems: 'flex-start', gap: 6, marginTop: 8 },
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
  compactPoints: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8 },
  compactPointsText: { fontSize: 14, fontWeight: '800', color: SHADES.amber },
});
