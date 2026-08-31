import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/Colors';

// Inline replacement for Alert.alert — never fails silently on Android (Alert.alert is
// silently blocked inside Modal-tree screens on Android SDK 54). Originally duplicated
// across app/admin/reservations/[id].tsx and app/admin/business-accounts/[uid].tsx;
// extracted here so a third admin screen needing an inline confirm doesn't copy it again.
export interface ConfirmBoxProps {
  text: string;
  confirmLabel: string;
  /** Label on the dismiss/keep-as-is button. Default 'Keep'. */
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  // Secondary/resigned styling — for actions that resolve something without it being a
  // success (e.g. writing off an outstanding balance as uncollectible). Distinct from
  // destructive, which is for actions with irreversible/alarming consequences.
  muted?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}

export function ConfirmBox({
  text,
  confirmLabel,
  cancelLabel = 'Keep',
  onCancel,
  onConfirm,
  destructive = false,
  muted = false,
  confirmDisabled = false,
  children,
}: ConfirmBoxProps) {
  return (
    <View style={[cb.box, destructive && cb.boxDestructive]}>
      <Text style={cb.text}>{text}</Text>
      {children}
      <View style={cb.btnRow}>
        <TouchableOpacity style={cb.keepBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={cb.keepText}>{cancelLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            cb.confirmBtn,
            destructive && cb.confirmBtnDestructive,
            muted && cb.confirmBtnMuted,
            confirmDisabled && cb.confirmBtnDisabled,
          ]}
          onPress={onConfirm}
          activeOpacity={0.8}
          disabled={confirmDisabled}
        >
          <Text style={[
            cb.confirmText,
            destructive && cb.confirmTextDestructive,
            muted && cb.confirmTextMuted,
          ]}>
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cb = StyleSheet.create({
  box: {
    backgroundColor: COLORS.warmBeige,
    borderRadius: 10, padding: 14, gap: 12,
    borderWidth: 1, borderColor: COLORS.softGray200,
  },
  boxDestructive: {
    backgroundColor: '#FEF2F2', borderColor: '#FCA5A5',
  },
  text: { fontSize: 13, fontWeight: '500', color: COLORS.carbon, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: 10 },
  keepBtn: {
    flex: 1, height: 42, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  keepText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  confirmBtn: {
    flex: 1, height: 42, borderRadius: 8,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDestructive: { backgroundColor: COLORS.danger },
  confirmBtnMuted: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  confirmTextDestructive: { color: COLORS.white },
  confirmTextMuted: { color: COLORS.fg2 },
});
