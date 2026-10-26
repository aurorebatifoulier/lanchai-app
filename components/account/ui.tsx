import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
});

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

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  separator: { height: 0.5, backgroundColor: SHADES.border, marginLeft: 62 },
  chipSmall: { paddingHorizontal: 9, paddingVertical: 4 },
  danger: { color: COLORS.danger }, // the app's existing destructive colour
});
