import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/Colors';
import {
  DateFieldOption,
  DateFilterState,
  DEFAULT_DATE_FILTER,
} from '@/lib/dateFilterConfig';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface DateFilterSheetProps {
  visible: boolean;
  title?: string;
  fieldOptions: DateFieldOption[];
  pending: DateFilterState;
  onChange: (next: DateFilterState) => void;
  onClose: () => void;
  onApply: () => void;
}

export default function DateFilterSheet({
  visible,
  title = 'Sort & filter',
  fieldOptions,
  pending,
  onChange,
  onClose,
  onApply,
}: DateFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [sheetMounted, setSheetMounted] = useState(false);
  const mountedRef     = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      sheetTranslate.setValue(600);
      if (!mountedRef.current) {
        mountedRef.current = true;
        setSheetMounted(true);
      }
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(sheetTranslate, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else if (mountedRef.current) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(sheetTranslate, { toValue: 600, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        mountedRef.current = false;
        setSheetMounted(false);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLastNote = pending.field === 'returnedAt' && pending.sortDir != null;

  return (
    <Modal
      visible={sheetMounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <Animated.View style={[styles.dimOverlay, { opacity: overlayOpacity }]} pointerEvents="none" />
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
          >
            <Text style={styles.sectionLabel}>Date field</Text>
            <View style={styles.optionRow}>
              {fieldOptions.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optChip, pending.field === opt.id && styles.optChipActive]}
                  onPress={() => onChange({ ...pending, field: opt.id })}
                >
                  <Text style={[styles.optChipText, pending.field === opt.id && styles.optChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Sort by</Text>
            <View style={styles.optionRow}>
              {([
                { id: 'desc' as const, label: 'Newest first' },
                { id: 'asc' as const, label: 'Oldest first' },
              ]).map(opt => {
                const active = pending.sortDir === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.optChip, active && styles.optChipActive]}
                    onPress={() => onChange({ ...pending, sortDir: active ? null : opt.id })}
                  >
                    <Text style={[styles.optChipText, active && styles.optChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {showLastNote && (
              <Text style={styles.helperNote}>
                Reservations not yet returned appear last.
              </Text>
            )}
          </ScrollView>

          <View style={[styles.sheetActions, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.resetBtn} onPress={() => onChange(DEFAULT_DATE_FILTER)}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={onApply}>
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dimOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(30,30,30,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.porcelain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.softGray,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
    marginBottom: 20,
  },
  sheetBody: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  optChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optChipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  optChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  optChipTextActive: {
    color: COLORS.porcelain,
  },
  helperNote: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    marginTop: -12,
    marginBottom: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
  },
  resetBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  applyBtn: {
    flex: 2,
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
});
