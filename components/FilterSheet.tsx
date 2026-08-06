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
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import DualSlider from './DualSlider';
import {
  Filters,
  SortOption,
  MinRating,
  PRICE_CONFIG,
  SORT_LABELS,
  DEFAULT_FILTERS,
} from '@/lib/filterConfig';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatKip(value: number): string {
  return `₭${value.toLocaleString('en-US')}`;
}

// ── ActiveChip ────────────────────────────────────────────────────────────────

export function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={styles.activeChip}>
      <Text style={styles.activeChipText}>{label}</Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      >
        <Feather name="x" size={11} color={COLORS.carbon} />
      </TouchableOpacity>
    </View>
  );
}

// ── FilterSheet ───────────────────────────────────────────────────────────────

interface FilterSheetProps {
  visible: boolean;
  pendingFilters: Filters;
  onChange: (filters: Filters) => void;
  hasRatingData: boolean;
  onClose: () => void;
  onApply: () => void;
}

export default function FilterSheet({
  visible,
  pendingFilters,
  onChange,
  hasRatingData,
  onClose,
  onApply,
}: FilterSheetProps) {
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
          <Text style={styles.sheetTitle}>Sort & filter</Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
          >
            {/* Price range */}
            <Text style={styles.sectionLabel}>PRICE RANGE / DAY</Text>
            <Text style={styles.sliderRangeText}>
              {formatKip(pendingFilters.priceMin)} – {formatKip(pendingFilters.priceMax)} / day
            </Text>
            <DualSlider
              min={PRICE_CONFIG.min}
              max={PRICE_CONFIG.max}
              step={PRICE_CONFIG.step}
              valueMin={pendingFilters.priceMin}
              valueMax={pendingFilters.priceMax}
              onChangeMin={v => onChange({ ...pendingFilters, priceMin: v })}
              onChangeMax={v => onChange({ ...pendingFilters, priceMax: v })}
            />

            {/* Sort by */}
            <Text style={styles.sectionLabel}>SORT BY</Text>
            <View style={styles.optionRow}>
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([id, label]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.optChip, pendingFilters.sort === id && styles.optChipActive]}
                  onPress={() => onChange({ ...pendingFilters, sort: id })}
                >
                  <Text style={[styles.optChipText, pendingFilters.sort === id && styles.optChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Rating — only when rating data exists */}
            {hasRatingData && (
              <>
                <Text style={styles.sectionLabel}>RATING</Text>
                <View style={styles.optionRow}>
                  {([
                    { id: 0 as MinRating, label: 'All' },
                    { id: 4 as MinRating, label: '4+' },
                    { id: 3 as MinRating, label: '3+' },
                    { id: 2 as MinRating, label: '2+' },
                  ]).map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.optChip, pendingFilters.minRating === opt.id && styles.optChipActive]}
                      onPress={() => onChange({ ...pendingFilters, minRating: opt.id })}
                    >
                      <Text style={[styles.optChipText, pendingFilters.minRating === opt.id && styles.optChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Availability */}
            <Text style={styles.sectionLabel}>AVAILABILITY</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Available only</Text>
              <TouchableOpacity
                style={[styles.toggleTrack, pendingFilters.availableOnly && styles.toggleTrackOn]}
                onPress={() => onChange({ ...pendingFilters, availableOnly: !pendingFilters.availableOnly })}
                activeOpacity={0.85}
              >
                <View style={[styles.toggleThumb, pendingFilters.availableOnly && styles.toggleThumbOn]} />
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.sheetActions, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.resetBtn} onPress={() => onChange(DEFAULT_FILTERS)}>
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
  sliderRangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
    marginBottom: 8,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.softGray,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: COLORS.amber,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    transform: [{ translateX: 0 }],
  },
  toggleThumbOn: {
    transform: [{ translateX: 22 }],
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
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.warmBeige,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.carbon,
  },
});
