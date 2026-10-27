import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import PressScale from '@/components/PressScale';
import FavoriteHeart from '@/components/FavoriteHeart';
import { MOTION } from '@/constants/motion';
import BagButton from '@/components/home/BagButton';

// Product page photo gallery (validated mockup): full width on carbonLight, back (left),
// share + heart (right), "1 / 5" counter chip, amber active dot. Scrolls away with the
// page; tap → the fullscreen viewer.
export function ProductGallery({
  images, width, height, topInset, iconName, liked, onBack, onShare, onToggleFav, onOpen, onEdit, bagCount, onBag,
}: {
  images: string[];
  width: number;
  height: number;
  topInset: number;
  iconName?: string;
  liked: boolean;
  onBack: () => void;
  onShare: () => void;
  onToggleFav: () => void;
  onOpen: (index: number) => void;
  onEdit?: () => void;
  bagCount: number | null;
  onBag: () => void;
}) {
  const [active, setActive] = useState(0);
  return (
    <View style={{ width, height, backgroundColor: SHADES.carbonLight }}>
      {images.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setActive(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {images.map((uri, i) => (
            <Pressable key={uri} onPress={() => onOpen(i)}>
              <Image source={{ uri }} style={{ width, height }} contentFit="cover" transition={250} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={s.placeholder}>
          <Feather name={(iconName || 'package') as never} size={88} color={SHADES.carbonFaint} />
        </View>
      )}

      <View style={[s.topRow, { top: topInset + 8 }]} pointerEvents="box-none">
        <CircleBtn onPress={onBack} label="Back"><Feather name="arrow-left" size={20} color={SHADES.carbon} /></CircleBtn>
        {/* Left → right: share, heart, bag (+ Edit for admins). */}
        <View style={s.topRight}>
          <CircleBtn onPress={onShare} label="Share"><Feather name="share-2" size={18} color={SHADES.carbon} /></CircleBtn>
          <CircleBtn onPress={onToggleFav} label="Like"><FavoriteHeart liked={liked} size={20} /></CircleBtn>
          <BagButton count={bagCount} onPress={onBag} circle size={42} />
          {onEdit && (
            <PressScale style={s.editChip} onPress={onEdit}>
              <Feather name="edit-2" size={13} color={SHADES.cream} />
              <Text style={s.editText}>{PRODUCT_COPY.edit}</Text>
            </PressScale>
          )}
        </View>
      </View>

      {images.length > 1 && (
        <>
          <View style={s.dots} pointerEvents="none">
            {images.map((_, i) => <View key={i} style={[s.dot, i === active && s.dotOn]} />)}
          </View>
          <View style={s.counter} pointerEvents="none">
            <Text style={s.counterText}>{PRODUCT_COPY.counter(active + 1, images.length)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

export function CircleBtn({ onPress, children, label, size = 42 }: { onPress: () => void; children: React.ReactNode; label: string; size?: number }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} hitSlop={6} style={[s.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {children}
    </PressScale>
  );
}

/**
 * Compact sticky bar (back, name on one line, heart, admin Edit) — fades in once the
 * gallery has scrolled away (overlay, no layout jump). `showAt` = scroll offset; reduce
 * motion → instant.
 */
export function ProductStickyBar({
  scrollY, showAt, reduce, topInset, name, liked, onBack, onToggleFav, onEdit, visible, bagCount, onBag,
}: {
  scrollY: Animated.Value;
  showAt: number;
  reduce: boolean;
  topInset: number;
  name: string;
  liked: boolean;
  visible: boolean;
  onBack: () => void;
  onToggleFav: () => void;
  onEdit?: () => void;
  bagCount: number | null;
  onBag: () => void;
}) {
  const range = [showAt - (reduce ? 0.5 : 24), showAt];
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[s.bar, { paddingTop: topInset }, {
        opacity: scrollY.interpolate({ inputRange: range, outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: scrollY.interpolate({ inputRange: range, outputRange: [reduce ? 0 : -MOTION.riseY, 0], extrapolate: 'clamp' }) }],
      }]}
    >
      <View style={s.barRow}>
        <CircleBtn onPress={onBack} label="Back" size={36}><Feather name="arrow-left" size={18} color={SHADES.carbon} /></CircleBtn>
        <Text style={s.barName} numberOfLines={1}>{name}</Text>
        <CircleBtn onPress={onToggleFav} label="Like" size={36}><FavoriteHeart liked={liked} size={18} /></CircleBtn>
        <BagButton count={bagCount} onPress={onBag} circle size={36} />
        {onEdit && (
          <PressScale style={s.editChip} onPress={onEdit}>
            <Feather name="edit-2" size={13} color={SHADES.cream} />
            <Text style={s.editText}>{PRODUCT_COPY.edit}</Text>
          </PressScale>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circle: { backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: SHADES.carbon, borderRadius: 10, paddingHorizontal: 10, height: 32 },
  editText: { fontSize: 12.5, fontWeight: '700', color: SHADES.cream },
  dots: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SHADES.carbonFaint },
  dotOn: { width: 18, backgroundColor: SHADES.amber },
  counter: { position: 'absolute', right: 16, bottom: 12, backgroundColor: SHADES.carbon, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  counterText: { fontSize: 12, fontWeight: '700', color: SHADES.cream },
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: SHADES.white,
    borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  barName: { flex: 1, fontSize: 16, fontWeight: '800', color: SHADES.carbon },
});
