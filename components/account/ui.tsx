import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';

// My Account design language (validated mockup) — ONE place for the card, section title,
// row, chip and icon-circle styles used by the whole screen (top + everything below), so
// it reads as one continuous design. Brand shades only (constants/brandShades.ts).
//
// Icon-circle rule: AMBER (light amber circle + dark amber icon) for rows that are your
// main contact with us or need an action from you (chat / WhatsApp, a missing ID or
// business document, an invite code to enter); GREY (light grey circle + carbon icon)
// for everything else. Staff entries use CARBON (carbon circle + amber icon).
//
// Also used by the profile sub-screens (Loyalty, ID & residency, Personal info): same
// cards, section titles, text sizes and spacing (screen content padding 16). Buttons:
// primary = amber, secondary = white with a carbon outline, destructive = text only in
// COLORS.danger. Green / red only as SMALL status signals (<StatusChip>, a one-line
// error) — never banners or backgrounds; a success is a <CheckLine>.

export const UI = StyleSheet.create({
  card: {
    backgroundColor: SHADES.white, borderRadius: 18, borderWidth: 0.5, borderColor: SHADES.border,
  },
  cardPadded: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon, marginTop: 24, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  subtitle: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2, lineHeight: 17 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 6 },
  chipGrey: { backgroundColor: SHADES.carbonLight },
  chipCarbon: { backgroundColor: SHADES.carbon },
  chipText: { fontSize: 14, fontWeight: '700', color: SHADES.carbon },
  chipTextSmall: { fontSize: 12, fontWeight: '700', color: SHADES.carbonMuted },

  // Profile sub-screens
  screenContent: { paddingHorizontal: 16, paddingTop: 4 },
  body: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  small: { fontSize: 12, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 17 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: SHADES.carbon, marginBottom: 8 },
  input: {
    height: 50, borderRadius: 12, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.cream,
    paddingHorizontal: 14, fontSize: 15, fontWeight: '500', color: SHADES.carbon,
  },
  inputReadonly: { backgroundColor: SHADES.carbonLight, borderColor: SHADES.carbonLight, justifyContent: 'center' },
  inputReadonlyText: { fontSize: 15, fontWeight: '500', color: SHADES.carbonMuted },
  btnPrimary: {
    height: 50, borderRadius: 14, backgroundColor: SHADES.amber,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
  btnSecondary: {
    height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: SHADES.carbon, backgroundColor: SHADES.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '700', color: SHADES.carbon },
  btnDisabled: { opacity: 0.45 },
  dangerText: { fontSize: 14, fontWeight: '700', color: COLORS.danger },
  /** Destructive button: white, light border, label in UI.dangerText (never a red fill). */
  btnDestructive: {
    height: 50, borderRadius: 14, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  errorText: { fontSize: 12, fontWeight: '500', color: COLORS.danger, lineHeight: 17 },
  /** Choice chips (forms): grey, carbon when selected. */
  choice: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: SHADES.carbonLight },
  choiceOn: { backgroundColor: SHADES.carbon },
  choiceText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  choiceTextOn: { color: SHADES.cream },
  divider: { height: 0.5, backgroundColor: SHADES.border, marginVertical: 14 },
});

/** Gap under the last element of a stack screen's scroll content. */
export const SCREEN_BOTTOM_GAP = 24;

/**
 * Safe-area handling for STACK screens (outside the tab bar), Android edge-to-edge:
 * `root` pads the screen top (status bar) AND bottom (3-button / gesture bar, iOS home
 * indicator), so scroll views stop ABOVE the system bar instead of scrolling under it;
 * scroll content then only adds `contentBottom`. `bottom` is for fixed bottom bars /
 * sheets. Falls back to the initial window metrics if the live inset reads 0.
 * Tab screens don't use this — the tab bar already sits above the system bar.
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  return {
    top: insets.top,
    bottom,
    root: { paddingTop: insets.top, paddingBottom: bottom },
    contentBottom: SCREEN_BOTTOM_GAP,
  };
}

export type IconTone = 'amber' | 'grey' | 'carbon';
const TONES: Record<IconTone, { bg: string; fg: string }> = {
  amber: { bg: SHADES.amberLight, fg: SHADES.amberDeep },
  grey: { bg: SHADES.carbonLight, fg: SHADES.carbon },
  carbon: { bg: SHADES.carbon, fg: SHADES.amber },
};

export type AnyIcon =
  | { set?: 'feather'; name: React.ComponentProps<typeof Feather>['name'] }
  | { set: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

export function IconCircle({ icon, tone = 'grey', size = 36 }: { icon: AnyIcon; tone?: IconTone; size?: number }) {
  const t = TONES[tone];
  const iconSize = Math.round(size * 0.47);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      {icon.set === 'mci'
        ? <MaterialCommunityIcons name={icon.name} size={iconSize + 1} color={t.fg} />
        : <Feather name={icon.name} size={iconSize} color={t.fg} />}
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[UI.sectionTitle, style as never]}>{children}</Text>;
}

export function Chip({ label, tone = 'grey', chevron, small }: { label: string; tone?: 'grey' | 'carbon'; chevron?: boolean; small?: boolean }) {
  return (
    <View style={[UI.chip, tone === 'carbon' ? UI.chipCarbon : UI.chipGrey, small && s.chipSmall]}>
      <Text style={[small ? UI.chipTextSmall : UI.chipText, tone === 'carbon' && { color: SHADES.cream }]}>{label}</Text>
      {chevron && <Feather name="chevron-right" size={13} color={SHADES.carbonMuted} />}
    </View>
  );
}

/** Small status signal — the ONLY place green / red appear on these screens. */
export function StatusChip({ label, tone }: { label: string; tone: 'success' | 'danger' | 'grey' | 'amber' }) {
  const t = STATUS_TONES[tone];
  return (
    <View style={[s.status, { backgroundColor: t.bg }]}>
      <Text style={[s.statusText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}
const STATUS_TONES = {
  success: { bg: '#E7F3EC', fg: COLORS.success },
  danger: { bg: '#F9E7E3', fg: COLORS.danger },
  grey: { bg: SHADES.carbonLight, fg: SHADES.carbonMuted },
  amber: { bg: SHADES.amberLight, fg: SHADES.amberDeep },
} as const;

/** Subtle success confirmation (replaces green banners): amber check + carbon text. */
export function CheckLine({ text }: { text: string }) {
  return (
    <View style={s.checkLine}>
      <Feather name="check-circle" size={15} color={SHADES.amber} />
      <Text style={s.checkLineText}>{text}</Text>
    </View>
  );
}

/** Status heading inside a card: icon circle + title (+ optional status chip), body below. */
export function StatusBlock({
  icon, tone = 'grey', title, chip, children,
}: {
  icon: AnyIcon;
  tone?: IconTone;
  title: string;
  chip?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View>
      <View style={s.statusHead}>
        <IconCircle icon={icon} tone={tone} />
        <Text style={[UI.title, { flex: 1 }]}>{title}</Text>
        {chip}
      </View>
      {children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </View>
  );
}

/** White card holding rows, with light separators between them (falsy children skipped). */
export function RowGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={UI.card}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={s.separator} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export function Row({
  icon, tone = 'grey', title, sub, subLines, onPress, soon, danger,
}: {
  icon?: AnyIcon;
  tone?: IconTone;
  title: string;
  sub?: string;
  /** Clamp the subtitle (e.g. 1 = one line with an ellipsis). */
  subLines?: number;
  onPress?: () => void;
  /** Not available yet: muted, no chevron, a "Soon" chip (same chip as "Tourist ›"). */
  soon?: boolean;
  /** Destructive action (text only in the app's destructive colour). */
  danger?: boolean;
}) {
  const content = (
    <>
      {icon && <IconCircle icon={icon} tone={soon ? 'grey' : tone} />}
      <View style={{ flex: 1 }}>
        <Text style={[UI.title, soon && { color: SHADES.carbonMuted }, danger && s.danger]}>{title}</Text>
        {!!sub && <Text style={UI.subtitle} numberOfLines={subLines}>{sub}</Text>}
      </View>
      {soon ? <Chip label="Soon" small /> : onPress ? <Feather name="chevron-right" size={16} color={SHADES.carbonFaint} /> : null}
    </>
  );
  if (soon || !onPress) return <View style={s.row}>{content}</View>;
  return <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
}

/** Row with a switch (same layout as <Row>): amber track when on. */
export function ToggleRow({
  icon, title, sub, value, onValueChange,
}: { icon?: AnyIcon; title: string; sub?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      {icon && <IconCircle icon={icon} />}
      <View style={{ flex: 1 }}>
        <Text style={UI.title}>{title}</Text>
        {!!sub && <Text style={UI.subtitle}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: SHADES.carbonLight, true: SHADES.amber }}
        thumbColor={SHADES.white}
        ios_backgroundColor={SHADES.carbonLight}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  separator: { height: 0.5, backgroundColor: SHADES.border, marginLeft: 62 },
  chipSmall: { paddingHorizontal: 9, paddingVertical: 4 },
  danger: { color: COLORS.danger }, // the app's existing destructive colour
  status: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkLineText: { flex: 1, fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
