import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

interface TrustFeature {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const FEATURES: TrustFeature[] = [
  { id: 'quality',  icon: 'shield', title: 'Quality checked',    description: 'Every item is inspected and maintained.' },
  { id: 'payment',  icon: 'shopping-bag', title: 'Pay at pick-up', description: 'Nothing to pay online — you pay in store.' },
  { id: 'support',  icon: 'message-circle', title: 'Local support',      description: 'Need help? We\'re just a message away.' },
  { id: 'deposit',  icon: 'rotate-ccw', title: 'Refundable deposit', description: 'Returned on the spot after a quick check.' },
];

export default function TrustSection() {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(100, withTiming(1, { duration: 700 }));
    translateY.value = withDelay(100, withTiming(0, { duration: 700 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.section, animStyle]}>
      <View style={styles.band}>
        <View style={styles.row}>
          <FeatureCell feature={FEATURES[0]} />
          <View style={styles.verticalDivider} />
          <FeatureCell feature={FEATURES[1]} />
          <View style={styles.verticalDivider} />
          <FeatureCell feature={FEATURES[2]} />
          <View style={styles.verticalDivider} />
          <FeatureCell feature={FEATURES[3]} />
        </View>
      </View>
    </Animated.View>
  );
}

function FeatureCell({ feature }: { feature: TrustFeature }) {
  return (
    <View style={styles.cell}>
      <View style={styles.iconContainer}>
        <Feather name={feature.icon as never} size={24} color="#1E1E1E" />
        <View style={styles.accentDot} />
      </View>
      <Text style={styles.cellTitle}>{feature.title}</Text>
      <Text style={styles.cellDesc}>{feature.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: -20,
    backgroundColor: '#FAFAF7',
  },
  band: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 8,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
  },
  iconContainer: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F4B400',
    marginTop: 4,
  },
  cellTitle: {
    height: 36,
    fontSize: 11,
    fontWeight: '600',
    color: '#1E1E1E',
    textAlign: 'center',
    textAlignVertical: 'center',
    marginTop: 4,
  },
  cellDesc: {
    fontSize: 10,
    color: '#888888',
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 14,
  },
});
