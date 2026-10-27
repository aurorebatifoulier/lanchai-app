import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  showFilter?: boolean;
  onFilterPress?: () => void;
  filterActive?: boolean;
  /** 'account' = the My Account field look (Home): white, thin border, radius 14, h50. */
  variant?: 'default' | 'account';
}

export default function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search products…',
  style,
  showFilter = false,
  onFilterPress,
  filterActive = false,
  variant = 'default',
}: Props) {
  const field = (
    <View style={[styles.field, value.length > 0 && styles.fieldActive, showFilter && styles.fieldFlex]}>
      <Feather name="search" size={16} color={value ? COLORS.carbon : COLORS.fg3} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={COLORS.fg3}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={16} color={COLORS.fg3} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (showFilter) {
    return (
      <View style={[styles.row, style]}>
        {field}
        <TouchableOpacity
          style={[styles.filterBtn, filterActive && styles.filterBtnActive]}
          onPress={onFilterPress}
          activeOpacity={0.8}
        >
          <Feather
            name="sliders"
            size={16}
            color={filterActive ? COLORS.porcelain : COLORS.carbon}
          />
          {filterActive && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.field, variant === 'account' && styles.fieldAccount, value.length > 0 && styles.fieldActive, style]}>
      <Feather name="search" size={16} color={value ? COLORS.carbon : COLORS.fg3} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={COLORS.fg3}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={16} color={COLORS.fg3} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
  },
  fieldAccount: {
    height: 50,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: SHADES.border,
    paddingHorizontal: 16,
  },
  fieldFlex: {
    flex: 1,
  },
  fieldActive: {
    borderColor: COLORS.carbon,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.amber,
  },
});
