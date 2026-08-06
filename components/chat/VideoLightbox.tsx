import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS } from '@/constants/Colors';

interface VideoLightboxProps {
  /** null = closed. Passing a new uri while already open swaps the playing video. */
  uri: string | null;
  onClose: () => void;
}

/** Fullscreen video playback modal, opened by tapping a video message bubble. */
export function VideoLightbox({ uri, onClose }: VideoLightboxProps) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.play();
  });

  return (
    <Modal
      visible={uri != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {uri != null && (
          <VideoView
            style={styles.video}
            player={player}
            nativeControls
            contentFit="contain"
          />
        )}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '70%',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
