import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { collection, getDocs, query, where, type Timestamp } from 'firebase/firestore';
import { Text } from '@/components/AppText';
import { UI } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { db } from '@/lib/firebase';
import { formatAuditNote } from '@/lib/auditNotes';

// Reservation detail "History": every staff / owner action on this booking (auditLog,
// written with each admin write — firestore.rules — and by the callables), plus the
// renter's ID actions (check, counter photo, decline, flag). Who · role · when · what.
// Two equality queries (no composite index), merged and sorted in memory.

interface Entry { id: string; action: string; byName: string; byRole: string; at?: Timestamp; note?: string }

const LABELS: Record<string, string> = {
  'status.confirmed': 'Payment confirmed',
  'status.active': 'Handed over',
  'status.returned': 'Returned',
  'status.cancelled': 'Cancelled',
  'status.no_show': 'Marked as no-show',
  'status.lost': 'Reported lost / stolen',
  'status.released': 'Force-released',
  'noshow.hold-lifted': 'No-show hold lifted',
  'return.settled': 'Returned and settled',
  'return.balance-open': 'Returned — balance open',
  'return.damage-review': 'Returned with damage — deposit held',
  'damage.confirmed': 'Damage charge confirmed',
  'damage.reduced': 'Damage charge reduced',
  'damage.waived': 'Damage charge waived',
  'settle.deposit-returned': 'Deposit returned',
  'settle.balance-paid': 'Balance paid',
  'settle.written-off': 'Balance written off',
  'pickup.refused': 'Pick-up refused',
  'pickup.refusal-closed': 'Refused pick-up closed',
  'agreement.signed': 'Rental agreement signed',
  'id.checked': 'ID checked in person',
  'id.photo-added': 'ID photo added at the counter',
  'id.declined': 'ID declined',
  'id.flagged': 'ID flagged for review',
  'id.flag-closed': 'ID flag closed',
  'renter.name-edited': 'Renter name edited',
  'incident.closed': 'Incident closed',
  'reservation.update': 'Updated',
  // State-machine actions (functions/src/shared/reservationMachine.ts) — audit action = lastAction.
  confirm_payment: 'Payment confirmed', // retired 2026-11-27 (old entries only)
  handover: 'Picked up',
  cancel: 'Cancelled',
  force_release: 'Force-released',
  no_show: 'Marked as no-show',
  lift_no_show: 'No-show hold lifted',
  refuse_pickup: 'Pick-up refused',
  close_refusal: 'Refused pick-up closed',
  return: 'Returned',
  report_lost: 'Reported lost / stolen',
  damage_confirm: 'Damage charge confirmed',
  damage_reduce: 'Damage charge reduced',
  damage_waive: 'Damage charge waived',
  undo_waiver: 'Waiver undone',
  refund_deposit: 'Deposit refunded',
  record_balance_paid: 'Balance paid',
  write_off: 'Balance written off',
  settle_lost: 'Lost item settled',
  archive: 'Archived',
  release_units: 'Held units released',
};
const labelOf = (a: string) => LABELS[a] ?? (a.startsWith('claim.') ? `Claim ${a.slice(6).replace('_', ' ')}` : a.startsWith('stock.') ? 'Stock adjusted' : a);
const when = (t?: Timestamp) => t ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function HistoryCard({ reservationId, renterId }: { reservationId: string; renterId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const map = (s: Awaited<ReturnType<typeof getDocs>>) => s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Entry, 'id'>) }));
    Promise.all([
      getDocs(query(collection(db, 'auditLog'), where('reservationId', '==', reservationId))).then(map).catch(() => []),
      getDocs(query(collection(db, 'auditLog'), where('renterId', '==', renterId))).then(map).catch(() => []),
    ]).then(([own, renter]) => {
      const byId = new Map<string, Entry>();
      for (const e of [...own, ...renter.filter(e => e.action.startsWith('id.') || e.action === 'renter.name-edited')]) byId.set(e.id, e);
      setEntries([...byId.values()].sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0)));
    });
  }, [reservationId, renterId]);

  if (!entries || entries.length === 0) return null;
  const shown = all ? entries : entries.slice(0, 6);
  return (
    <View style={[UI.card, UI.cardPadded, s.card]}>
      <Text style={UI.title}>History</Text>
      {shown.map(e => (
        <View key={e.id} style={s.row}>
          <View style={s.dot} />
          <View style={{ flex: 1 }}>
            <Text style={s.what}>{labelOf(e.action)}</Text>
            <Text style={UI.small}>{`${e.byName} · ${e.byRole === 'staff' ? 'Staff' : 'Owner'} · ${when(e.at)}`}</Text>
            {!!e.note && <Text style={UI.small} numberOfLines={2}>{formatAuditNote(e.note)}</Text>}
          </View>
        </View>
      ))}
      {entries.length > shown.length && (
        <TouchableOpacity onPress={() => setAll(true)} accessibilityRole="button">
          <Text style={UI.link}>{`Show all (${entries.length})`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: SHADES.amber, marginTop: 6 },
  what: { fontSize: 14, fontWeight: '600', color: SHADES.carbon },
});
