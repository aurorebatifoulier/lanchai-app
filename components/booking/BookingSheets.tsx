import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { useScreenInsets } from '@/components/account/ui';
import DateRangeCalendar from '@/components/DateRangeCalendar';

// Booking sheets: the date range calendar and the pick-up / return slot lists (rules
// unchanged: shop slots every 30 min, today from now + 2h — callers pass the slots).

function Sheet({ visible, title, sub, onClose, children }: {
  visible: boolean; title: string; sub?: string; onClose: () => void; children: React.ReactNode;
}) {
  const screen = useScreenInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: screen.bottom + 16 }]} onPress={() => {}}>
          <View style={s.handle} />
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              {!!sub && <Text style={s.sub}>{sub}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={s.done}>Done</Text></TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DatesSheet({ visible, onClose, productId, totalStock, startDate, endDate, onChangeRange, timeSlots }: {
  visible: boolean; onClose: () => void; productId: string; totalStock: number;
  startDate: Date | null; endDate: Date | null; onChangeRange: (s: Date | null, e: Date | null) => void; timeSlots: string[];
}) {
  return (
    <Sheet visible={visible} title="Select dates" onClose={onClose}>
      <DateRangeCalendar
        productId={productId}
        totalStock={totalStock}
        startDate={startDate}
        endDate={endDate}
        onChangeRange={onChangeRange}
        timeSlots={timeSlots}
      />
    </Sheet>
  );
}

export function SlotSheet({ visible, title, sub, slots, selected, onSelect, onClose }: {
  visible: boolean; title: string; sub?: string; slots: string[]; selected: string | null;
  onSelect: (slot: string) => void; onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} sub={sub} onClose={onClose}>
      <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
        {slots.map(slot => {
          const on = slot === selected;
          return (
            <TouchableOpacity key={slot} style={[s.slot, on && s.slotOn]} onPress={() => { onSelect(slot); onClose(); }} activeOpacity={0.7}>
              <Text style={[s.slotText, on && s.slotTextOn]}>{slot}</Text>
              {on && <Feather name="check" size={16} color={SHADES.amber} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: SHADES.carbon },
  sub: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2 },
  done: { fontSize: 15, fontWeight: '700', color: SHADES.amberText },
  slot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12 },
  slotOn: { backgroundColor: SHADES.carbon },
  slotText: { fontSize: 16, fontWeight: '600', color: SHADES.carbon },
  slotTextOn: { color: SHADES.white },
});
