import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import { UI, useScreenInsets } from '@/components/account/ui';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { useShopInfo, getShopTimeSlots } from '@/lib/shop';
import type { Product } from '@/lib/mockData';
import {
  fetchOccupancy, computeAvailableUnits, effectiveStock, gridAvailability, type OccupancyRecord,
} from '@/utils/availability';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = 7;

// Real availability (product page): the same occupancy + full-day rule as Explore's
// cards and the booking calendar. Status line, a 7-day strip (free = light amber,
// booked = grey crossed) and "See calendar" → DateRangeCalendar in a sheet; once a
// range is picked, `onPickRange` (→ quick add on those dates).
export default function AvailabilityCard({ product, onPickRange }: {
  product: Product;
  onPickRange: (start: Date, end: Date) => void;
}) {
  const screen = useScreenInsets();
  const shop = useShopInfo();
  const slots = useMemo(() => getShopTimeSlots(shop), [shop]);
  const stock = effectiveStock(product);
  const [occ, setOcc] = useState<OccupancyRecord[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });

  useEffect(() => {
    fetchOccupancy(product.id).then(setOcc).catch(() => setOcc(null));
  }, [product.id]);

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1);
      const free = product.available !== false && occ != null && computeAvailableUnits(occ, start, end, stock) > 0;
      return { start, free };
    });
  }, [occ, stock, product.available]);

  const a = PRODUCT_COPY.availability;
  const grid = occ != null ? gridAvailability(product, occ) : undefined;
  const status = product.available === false ? { text: a.unavailable, free: false }
    : grid === undefined ? null
    : grid === null ? { text: a.freeToday, free: true }
    : grid.kind === 'backOn' ? { text: a.backOn(`${DOW[grid.date.getDay()]} ${grid.date.getDate()}`), free: false }
    : grid.kind === 'fullyBooked' ? { text: a.fullyBooked, free: false }
    : { text: a.unavailable, free: false };

  const close = () => { setSheet(false); setRange({ start: null, end: null }); };

  return (
    <View style={[UI.card, s.card]}>
      <View style={s.head}>
        <View style={s.statusRow}>
          {status && <View style={[s.dot, status.free ? s.dotFree : s.dotBusy]} />}
          <Text style={s.status}>{status?.text ?? ' '}</Text>
        </View>
        {product.available !== false && (
          <TouchableOpacity onPress={() => setSheet(true)} hitSlop={8}>
            <Text style={UI.link}>{a.seeCalendar}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={s.strip}>
        {days.map(d => (
          <View key={d.start.toISOString()} style={s.day}>
            <Text style={s.dow}>{DOW[d.start.getDay()]}</Text>
            <View style={[s.cell, d.free ? s.cellFree : s.cellBusy]}>
              <Text style={[s.num, d.free ? s.numFree : s.numBusy]}>{d.start.getDate()}</Text>
            </View>
          </View>
        ))}
      </View>

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <Pressable style={s.overlay} onPress={close}>
          <Pressable style={[s.sheet, { paddingBottom: screen.bottom + 16 }]} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>{a.calendarTitle}</Text>
            <Text style={[UI.small, { marginBottom: 10 }]}>{a.calendarHint}</Text>
            <DateRangeCalendar
              productId={product.id}
              totalStock={stock}
              startDate={range.start}
              endDate={range.end}
              timeSlots={slots}
              onChangeRange={(start, end) => {
                setRange({ start, end });
                if (start && end) { close(); onPickRange(start, end); }
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotFree: { backgroundColor: SHADES.amber },
  dotBusy: { backgroundColor: SHADES.carbonFaint },
  status: { fontSize: 16, fontWeight: '700', color: SHADES.carbon },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  dow: { fontSize: 11.5, fontWeight: '500', color: SHADES.carbonMuted },
  cell: { alignSelf: 'stretch', height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cellFree: { backgroundColor: SHADES.amberLight },
  cellBusy: { backgroundColor: SHADES.carbonLight },
  num: { fontSize: 14, fontWeight: '700' },
  numFree: { color: SHADES.amberDeep },
  numBusy: { color: SHADES.carbonFaint, textDecorationLine: 'line-through' },
  overlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: SHADES.carbon },
});
