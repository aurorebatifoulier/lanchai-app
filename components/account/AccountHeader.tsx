import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo, ActivityIndicator } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Defs, Mask, Path, Polygon } from 'react-native-svg';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { vteMinutesOfDay } from '@/functions/src/shared/dates';

// My Account header (validated mockup): white band, subtle decor on the right (a dashed
// "flight path" drawing itself to a tiny amber hexagon + 4 floating item bubbles),
// avatar with a thin amber ring (photo button kept), greeting by Vientiane time + first
// name, tier chip + status chip. Brand shades only. Animations are skipped when the
// system "reduce motion" setting is on.

const AnimatedPath = Animated.createAnimatedComponent(Path);
const PATH = 'M 18 150 C 60 150, 40 95, 80 82 S 120 30, 160 40 S 210 70, 236 22';
const PATH_LEN = 420; // ≥ the path's length — only drives the drawing speed

const BUBBLES: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; x: number; y: number; bg: string; fg: string; rot: string }[] = [
  { icon: 'tent', x: 60, y: 92, bg: SHADES.amberLight, fg: SHADES.amberDeep, rot: '-8deg' },
  { icon: 'speaker', x: 92, y: 24, bg: SHADES.carbonLight, fg: SHADES.carbon, rot: '6deg' },
  { icon: 'hammer-wrench', x: 198, y: 68, bg: SHADES.amberMid, fg: SHADES.carbon, rot: '-6deg' },
  { icon: 'bike', x: 184, y: 128, bg: SHADES.carbon, fg: SHADES.amber, rot: '5deg' },
];

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

function Decor() {
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

  return (
    <View pointerEvents="none" style={s.decor}>
      <Svg width={250} height={170} viewBox="0 0 250 170">
        <Defs>
          <Mask id="reveal">
            <AnimatedPath d={PATH} stroke="#fff" strokeWidth={8} fill="none" strokeDasharray={[PATH_LEN, PATH_LEN]} strokeDashoffset={draw} />
          </Mask>
        </Defs>
        <Path d={PATH} stroke={SHADES.amberMid} strokeWidth={2} strokeDasharray={[4, 6]} strokeLinecap="round" fill="none" mask="url(#reveal)" />
        <Polygon points="236,12 245,17 245,27 236,32 227,27 227,17" fill={SHADES.amber} />
      </Svg>
      {BUBBLES.map((b, i) => (
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
}

export function AccountHeader(p: AccountHeaderProps) {
  const hour = Math.floor(vteMinutesOfDay(Date.now()) / 60);
  return (
    <View style={s.header}>
      <Decor />
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
        <View style={s.info}>
          <Text style={s.greeting}>{ACCOUNT_COPY.greeting(hour)}</Text>
          <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit>{ACCOUNT_COPY.name(p.firstName)}</Text>
          <View style={s.chips}>
            {p.tierLabel && (
              <View style={[s.chip, s.chipTier]}>
                <Feather name="award" size={13} color={SHADES.amber} />
                <Text style={[s.chipText, s.chipTierText]}>{p.tierLabel}</Text>
              </View>
            )}
            <TouchableOpacity style={[s.chip, s.chipStatus]} onPress={p.onStatusPress} activeOpacity={0.75}>
              <Text style={s.chipText}>{p.statusLabel}</Text>
              <Feather name="chevron-right" size={13} color={SHADES.carbonMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: SHADES.white, marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26,
    borderBottomWidth: 1, borderBottomColor: SHADES.border, overflow: 'hidden', minHeight: 170,
  },
  decor: { position: 'absolute', right: -6, top: 4, width: 250, height: 170, opacity: 0.95 },
  bubble: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: SHADES.amber, padding: 4 },
  avatar: { flex: 1, borderRadius: 40, backgroundColor: SHADES.carbonLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontSize: 30, fontWeight: '600', color: SHADES.carbon },
  camera: {
    position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: SHADES.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SHADES.white,
  },
  info: { flex: 1 },
  greeting: { fontSize: 16, fontWeight: '500', color: SHADES.carbonMuted },
  name: { fontSize: 32, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.8, marginTop: 1 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  // Same chip tokens as the rest of the screen (components/account/ui.tsx).
  chip: UI.chip,
  chipTier: UI.chipCarbon,
  chipTierText: { color: SHADES.cream },
  chipStatus: UI.chipGrey,
  chipText: UI.chipText,
});
