import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo, ActivityIndicator,
  type LayoutChangeEvent,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, LinearGradient, Mask, Path, Polygon, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { vteMinutesOfDay } from '@/functions/src/shared/dates';
import { useMyLoyalty } from '@/lib/loyaltyUi';
import { buildFlightPath, type Pt } from '@/components/account/flightPath';

// My Account header (validated mockup): white band, avatar with a thin amber ring (photo
// button kept), greeting by Vientiane time + first name, tier chip + status chip, and a
// subtle decor (hand-drawn dashed "bee flight" drawing itself from the left edge, looping
// partly under the bike and the speaker, to a tiny amber hexagon — see flightPath.ts —,
// then its dashes slowly drift toward the hexagon; + 4 floating item bubbles on top of
// the path) behind the text; bubbles that would touch the measured text block are
// hidden (never overlap the greeting, name or chips). Brand shades only. Motion is
// skipped with "reduce motion".

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Decor box (top-right of the header): bubble + hexagon positions are in these coordinates.
const DECOR_W = 250;
const DECOR_RIGHT = -6;
const DECOR_TOP = 4;
const BUBBLE = 36;
// Background-only style: small round dots (round caps), amber ≤ 30% opacity, fading in
// from the left edge (3% → 30% just before the bike loop, a continuous gradient).
const DASH: [number, number] = [0.1, 7];
const DASH_PERIOD = DASH[0] + DASH[1];
const PATH_OPACITY_START = 0.03;
const PATH_OPACITY = 0.3;
// Hexagon centre in decor coordinates (top-right corner).
// ≈16px tall, light amber, ~20px of white space to the right edge of the screen
// (decor right edge = screen edge + 6 → centre at 244 − 20 − 7).
const HEX = { x: 217, y: 22 };
const HEX_PTS: [number, number][] = [[0, -8], [7, -4], [7, 4], [0, 8], [-7, 4], [-7, -4]];
const SPEAKER_LOOP_R = BUBBLE / 2 + 11;

// x / y in decor coordinates. The tent has none: it sits in the gap right of the stacked
// chips, between them and the bike (computed from the measured chips, see Decor).
const BUBBLES: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; x?: number; y?: number; bg: string; fg: string; rot: string }[] = [
  { icon: 'tent', bg: SHADES.amberLight, fg: SHADES.amberDeep, rot: '-8deg' },
  { icon: 'speaker', x: 92, y: 24, bg: SHADES.carbonLight, fg: SHADES.carbon, rot: '6deg' },
  // Same ~20px right margin as the hexagon (244 − 20 − 36).
  { icon: 'hammer-wrench', x: 188, y: 68, bg: SHADES.amberMid, fg: SHADES.carbon, rot: '-6deg' },
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

/** One text line (greeting, name, chips) in header coordinates, from onLayout. */
interface Box { left: number; top: number; right: number; bottom: number }
const MARGIN = 8;
const BIKE = BUBBLES.find(b => b.icon === 'bike');

type Rect = { x: number; y: number; w: number; h: number };
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const validRect = (r: Rect | null | undefined): r is Rect => !!r && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h);

/**
 * Text lines in header coordinates, or null until EVERY measurement exists (text column,
 * greeting, name, chips) — no bubbles and no overlap computation before that.
 */
function measureLines(col: { x: number; y: number } | null, rects: Record<string, Rect>): { lines: Box[]; chips: Box } | null {
  if (!col || !isNum(col.x) || !isNum(col.y)) return null;
  const { greeting, name, chips } = rects;
  if (!validRect(greeting) || !validRect(name) || !validRect(chips)) return null;
  const toBox = (r: Rect): Box => ({
    left: PAD_X + col.x + r.x, top: PAD_TOP + col.y + r.y,
    right: PAD_X + col.x + r.x + r.w, bottom: PAD_TOP + col.y + r.y + r.h,
  });
  return { lines: [greeting, name, chips].map(r => toBox(r)), chips: toBox(chips) };
}

/** Safety net: a decoration bug renders nothing instead of crashing My Account. */
class DecorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[AccountHeader] decor hidden after an error', e); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Previous decor (dashed path to the amber hexagon + 4 bubbles), drawn BEHIND the text.
 * Bubbles are laid out in header coordinates; any bubble whose box would touch a measured
 * text line (+ margin) is hidden — narrow screens lose bubbles rather than shrinking
 * everything. Bubbles wait for the measure.
 */
function Decor({ headerWidth, headerHeight, lines, chips }: { headerWidth: number; headerHeight: number; lines: Box[] | null; chips: Box | null }) {
  const reduce = useReduceMotion();
  // Dash offset as a 0→1 fraction (path length depends on the measured layout).
  const draw = useRef(new Animated.Value(1)).current;
  // Very slow dash drift toward the hexagon (one dash period every 2.4s).
  const drift = useRef(new Animated.Value(0)).current;
  const floats = useMemo(() => BUBBLES.map(() => new Animated.Value(0)), []);
  const ready = !!lines && headerWidth > 0 && headerHeight > 0;

  // Draw-on-mount once the layout is measured (from the left edge to the hexagon).
  useEffect(() => {
    if (!ready) return;
    if (reduce) { draw.setValue(0); drift.setValue(0); return; }
    draw.setValue(1);
    drift.setValue(0);
    const flow = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false }));
    const anim = Animated.timing(draw, { toValue: 0, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) flow.start(); });
    return () => { anim.stop(); flow.stop(); };
  }, [ready, reduce, draw, drift]);

  useEffect(() => {
    if (reduce) return;
    const loops = floats.map((v, i) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1800 + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1800 + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [reduce, floats]);

  const decorLeft = headerWidth - DECOR_W - DECOR_RIGHT;
  const place = (b: typeof BUBBLES[number]): { left: number; top: number } | null => {
    if (b.x != null && b.y != null) return { left: decorLeft + b.x, top: DECOR_TOP + b.y };
    if (!chips || BIKE?.x == null) return null;
    // Centred in the gap between the chips and the bike, level with the chips.
    const gapL = chips.right + MARGIN, gapR = decorLeft + BIKE.x - MARGIN;
    if (gapR - gapL < BUBBLE) return null;
    return { left: (gapL + gapR - BUBBLE) / 2, top: (chips.top + chips.bottom - BUBBLE) / 2 };
  };
  const clear = (pos: { left: number; top: number }) => {
    if (!lines) return false;
    const l = pos.left, t = pos.top, r = l + BUBBLE, btm = t + BUBBLE;
    return lines.every(x => r < x.left - MARGIN || l > x.right + MARGIN || btm < x.top - MARGIN || t > x.bottom + MARGIN);
  };
  // Visible bubbles (null = hidden by the anti-overlap rule or not measured yet).
  const placed = BUBBLES.map(b => {
    if (!ready) return null;
    const pos = place(b);
    return pos && clear(pos) ? pos : null;
  });
  const centre = (icon: string): Pt | null => {
    const pos = placed[BUBBLES.findIndex(b => b.icon === icon)];
    return pos ? { x: pos.left + BUBBLE / 2, y: pos.top + BUBBLE / 2 } : null;
  };
  const hex = { x: decorLeft + HEX.x, y: DECOR_TOP + HEX.y };
  const flight = ready ? buildFlightPath({
    width: headerWidth, height: headerHeight,
    bike: centre('bike'), speaker: centre('speaker'), hexagon: hex, speakerLoopRadius: SPEAKER_LOOP_R,
  }) : null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {headerWidth > 0 && headerHeight > 0 && (
        <Svg width={headerWidth} height={headerHeight} style={StyleSheet.absoluteFill}>
          {flight && (
            <>
              <Defs>
                <LinearGradient id="fade" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={Math.max(1, flight.fadeEndX)} y2={0}>
                  <Stop offset={0} stopColor={SHADES.amber} stopOpacity={PATH_OPACITY_START} />
                  <Stop offset={1} stopColor={SHADES.amber} stopOpacity={PATH_OPACITY} />
                </LinearGradient>
                <Mask id="reveal">
                  <AnimatedPath
                    d={flight.d} stroke="#fff" strokeWidth={8} fill="none"
                    strokeDasharray={[flight.length, flight.length]}
                    strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [0, flight.length] })}
                  />
                </Mask>
              </Defs>
              <AnimatedPath
                d={flight.d} stroke="url(#fade)" strokeWidth={2} strokeDasharray={DASH} strokeLinecap="round" fill="none" mask="url(#reveal)"
                // Decreasing offset → dashes move along the path, toward the hexagon.
                strokeDashoffset={drift.interpolate({ inputRange: [0, 1], outputRange: [0, -DASH_PERIOD] })}
              />
            </>
          )}
          <Polygon points={HEX_PTS.map(([dx, dy]) => `${hex.x + dx},${hex.y + dy}`).join(' ')} fill={SHADES.amberSoft} fillOpacity={0.55} />
        </Svg>
      )}
      {BUBBLES.map((b, i) => {
        const pos = placed[i];
        if (!pos) return null;
        return (
          <Animated.View
            key={b.icon}
            style={[s.bubble, {
              left: pos.left, top: pos.top, backgroundColor: b.bg,
              transform: [
                { rotate: b.rot },
                { translateY: floats[i].interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 3 : -3] }) },
              ],
            }]}
          >
            <MaterialCommunityIcons name={b.icon} size={17} color={b.fg} />
          </Animated.View>
        );
      })}
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
  const [headerHeight, setHeaderHeight] = useState(0);
  // Text column position (relative to the row) + each line's box inside it.
  const [col, setCol] = useState<{ x: number; y: number } | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const onLine = (key: string) => (e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    setRects(prev => {
      const o = prev[key];
      return o && o.x === x && o.y === y && o.w === w && o.h === h ? prev : { ...prev, [key]: { x, y, w, h } };
    });
  };
  const measured = measureLines(col, rects);

  return (
    <View
      style={s.header}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setHeaderWidth(width);
        setHeaderHeight(height);
        p.onHeight?.(height);
      }}
    >
      {/* Decor first → behind the text (and zIndex below it). */}
      <DecorBoundary>
        <Decor headerWidth={headerWidth} headerHeight={headerHeight} lines={measured?.lines ?? null} chips={measured?.chips ?? null} />
      </DecorBoundary>
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
        <View style={s.info} onLayout={e => { const { x, y } = e.nativeEvent.layout; setCol(c => (c && c.x === x && c.y === y ? c : { x, y })); }}>
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
    borderBottomWidth: 0.5, borderBottomColor: SHADES.border, overflow: 'hidden',
    // Room for the loop under the bike (bike bottom + loop clearance + bottom run).
    minHeight: DECOR_TOP + 128 + BUBBLE + 23,
  },
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
