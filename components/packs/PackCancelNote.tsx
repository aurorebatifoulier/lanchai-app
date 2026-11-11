import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { PACK_COPY } from '@/constants/packCopy';
import { packCancelImpact } from '@/functions/src/shared/packs';
import type { RentalDoc } from '@/lib/firestore';

const n = (v: number) => Math.round(v).toLocaleString('en-US');

/** packCancelImpact on reservation docs (the SAME rule as removeBrokenPackDiscount). */
export function packImpactOf(orderLines: RentalDoc[], cancelIds: string[]) {
  return packCancelImpact(orderLines.map(r => ({
    id: r.id, status: r.status, total: r.total ?? 0, subtotal: r.subtotal ?? r.total ?? 0,
    packApplied: r.packApplied ?? null,
  })), cancelIds);
}

// Shown inside the cancel confirmation when cancelling these lines breaks a pack: the
// pack price is removed from the other items, with their new total (before → after).
// Neutral line, no alert colour. Renders nothing when the pack isn't affected.
export default function PackCancelNote({ orderLines, cancelIds, staff = false }: {
  orderLines: RentalDoc[];
  cancelIds: string[];
  staff?: boolean;
}) {
  const impact = packImpactOf(orderLines, cancelIds);
  if (!impact) return null;
  const count = impact.lineIds.length;
  return (
    <View style={s.box}>
      <Text style={UI.small}>{staff ? PACK_COPY.cancelNoteStaff(impact.packTitle, count) : PACK_COPY.cancelNote(impact.packTitle, count)}</Text>
      <Text style={[UI.small, s.amounts]}>
        <Text style={s.struck}>{n(impact.before)}</Text>
        {` → ${n(impact.after)} ${PACK_COPY.cancelAmounts}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { marginTop: 8, gap: 2 },
  amounts: { color: SHADES.carbon, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: SHADES.carbonMuted, fontWeight: '500' },
});
