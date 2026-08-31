import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

const POINTS = [
  'Collected in cash at pick-up, alongside the rental fee.',
  'Fully refunded on the spot when the item is returned in good condition, once inspected (about 10 minutes).',
  'Part or all of the deposit may be kept if the item is returned late, damaged, or with missing accessories.',
];

export function DepositInfoAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
        <Text style={s.headerText}>How does the deposit work?</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.fg2} />
      </TouchableOpacity>
      {open && (
        <View style={s.body}>
          {POINTS.map((text, i) => (
            <View key={i} style={s.point}>
              <View style={s.dot} />
              <Text style={s.pointText}>{text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.fg3,
    marginTop: 6,
    flexShrink: 0,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 19,
  },
});
