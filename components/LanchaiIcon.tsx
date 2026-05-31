import React from 'react';
import { Feather, MaterialCommunityIcons, Ionicons, AntDesign } from '@expo/vector-icons';

type IconSet = 'Feather' | 'MaterialCommunityIcons' | 'Ionicons' | 'AntDesign';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  set?: IconSet;
}

const ICON_MAP: Record<string, { name: string; set: IconSet }> = {
  search: { name: 'search', set: 'Feather' },
  bell: { name: 'bell', set: 'Feather' },
  bell2: { name: 'bell', set: 'Feather' },
  heart: { name: 'heart', set: 'Feather' },
  user: { name: 'user', set: 'Feather' },
  home: { name: 'home', set: 'Feather' },
  grid: { name: 'grid', set: 'Feather' },
  package: { name: 'package', set: 'Feather' },
  mapPin: { name: 'map-pin', set: 'Feather' },
  arrowRight: { name: 'arrow-right', set: 'Feather' },
  arrowLeft: { name: 'arrow-left', set: 'Feather' },
  chevronRight: { name: 'chevron-right', set: 'Feather' },
  chevronLeft: { name: 'chevron-left', set: 'Feather' },
  chevronDown: { name: 'chevron-down', set: 'Feather' },
  plus: { name: 'plus', set: 'Feather' },
  minus: { name: 'minus', set: 'Feather' },
  check: { name: 'check', set: 'Feather' },
  x: { name: 'x', set: 'Feather' },
  star: { name: 'star', set: 'Feather' },
  starFilled: { name: 'star', set: 'AntDesign' },
  calendar: { name: 'calendar', set: 'Feather' },
  clock: { name: 'clock', set: 'Feather' },
  shield: { name: 'shield', set: 'Feather' },
  truck: { name: 'truck', set: 'Feather' },
  filter: { name: 'sliders', set: 'Feather' },
  list: { name: 'list', set: 'Feather' },
  settings: { name: 'settings', set: 'Feather' },
  globe: { name: 'globe', set: 'Feather' },
  fileText: { name: 'file-text', set: 'Feather' },
  users: { name: 'users', set: 'Feather' },
  zap: { name: 'zap', set: 'Feather' },
  refresh: { name: 'refresh-cw', set: 'Feather' },
  helpCircle: { name: 'help-circle', set: 'Feather' },
  lock: { name: 'lock', set: 'Feather' },
  moon: { name: 'moon', set: 'Feather' },
  download: { name: 'download', set: 'Feather' },
  share: { name: 'share', set: 'Feather' },
  message: { name: 'message-circle', set: 'Feather' },
  music: { name: 'music', set: 'Feather' },
  trendingUp: { name: 'trending-up', set: 'Feather' },
  trendingDown: { name: 'trending-down', set: 'Feather' },
  more: { name: 'more-horizontal', set: 'Feather' },
  hash: { name: 'hash', set: 'Feather' },
  card: { name: 'credit-card', set: 'Feather' },
  tool: { name: 'tool', set: 'Feather' },
  camera: { name: 'camera', set: 'Feather' },
  coffee: { name: 'coffee', set: 'Feather' },
  briefcase: { name: 'briefcase', set: 'Feather' },
  wind: { name: 'wind', set: 'Feather' },
  activity: { name: 'activity', set: 'Feather' },
  sun: { name: 'sun', set: 'Feather' },
  map: { name: 'map', set: 'Feather' },
  navigation: { name: 'navigation', set: 'Feather' },
  square: { name: 'square', set: 'Feather' },
  maximize: { name: 'maximize', set: 'Feather' },
  // MaterialCommunityIcons
  store: { name: 'store', set: 'MaterialCommunityIcons' },
  wallet: { name: 'wallet', set: 'MaterialCommunityIcons' },
  qr: { name: 'qrcode', set: 'MaterialCommunityIcons' },
  dumbbell: { name: 'dumbbell', set: 'MaterialCommunityIcons' },
  party: { name: 'party-popper', set: 'MaterialCommunityIcons' },
  airVent: { name: 'air-conditioner', set: 'MaterialCommunityIcons' },
  laptop: { name: 'laptop', set: 'MaterialCommunityIcons' },
  ruler: { name: 'ruler', set: 'MaterialCommunityIcons' },
  baby: { name: 'baby-face', set: 'MaterialCommunityIcons' },
  bath: { name: 'shower', set: 'MaterialCommunityIcons' },
  tent: { name: 'tent', set: 'MaterialCommunityIcons' },
  // Ionicons
  sparkles: { name: 'sparkles', set: 'Ionicons' },
  flame: { name: 'flame', set: 'Ionicons' },
};

export default function LanchaiIcon({ name, size = 20, color = '#1E1E1E', set }: IconProps) {
  const mapping = ICON_MAP[name];
  const iconSet = set ?? mapping?.set ?? 'Feather';
  const iconName = (mapping?.name ?? name) as never;

  if (iconSet === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
  }
  if (iconSet === 'Ionicons') {
    return <Ionicons name={iconName} size={size} color={color} />;
  }
  if (iconSet === 'AntDesign') {
    return <AntDesign name={iconName} size={size} color={color} />;
  }
  return <Feather name={iconName} size={size} color={color} />;
}
