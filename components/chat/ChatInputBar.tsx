import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Modal, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  onRecordVideo: () => void;
  onPickVideo: () => void;
  sending: boolean;
  uploading: boolean;
  /** Bottom padding the caller computes from safe-area insets + keyboard state. */
  bottomPadding: number;
}

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onPickImage,
  onRecordVideo,
  onPickVideo,
  sending,
  uploading,
  bottomPadding,
}: ChatInputBarProps) {
  const canSend = value.trim().length > 0 && !sending && !uploading;
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);

  const runAttachAction = (action: () => void) => {
    setAttachSheetVisible(false);
    action();
  };

  return (
    <View style={[styles.inputBar, { paddingBottom: bottomPadding }]}>
      <TouchableOpacity
        style={styles.attachBtn}
        onPress={() => setAttachSheetVisible(true)}
        disabled={uploading || sending}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={COLORS.fg3} />
        ) : (
          <Feather name="paperclip" size={22} color={COLORS.fg3} />
        )}
      </TouchableOpacity>

      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="Write your message…"
        placeholderTextColor={COLORS.fg3}
        multiline
        maxLength={2000}
        blurOnSubmit={false}
      />

      <TouchableOpacity
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        onPress={onSend}
        disabled={!canSend}
      >
        <Feather name="send" size={16} color={COLORS.carbon} />
      </TouchableOpacity>

      {/* Attach action sheet — photo / record video / video from library */}
      <Modal
        visible={attachSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachSheetVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => setAttachSheetVisible(false)}
        >
          <View style={styles.actionSheet}>
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => runAttachAction(onPickImage)}
              activeOpacity={0.7}
            >
              <Feather name="image" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Photo library</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => runAttachAction(onRecordVideo)}
              activeOpacity={0.7}
            >
              <Feather name="video" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Record video</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => runAttachAction(onPickVideo)}
              activeOpacity={0.7}
            >
              <Feather name="film" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Video from library</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.softGray,
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    backgroundColor: COLORS.softGray200,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 9 : 6,
    paddingBottom: Platform.OS === 'ios' ? 9 : 6,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.softGray,
  },

  // ── Attach action sheet ────────────────────────────────────────────────
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
  },
});
