import React from 'react';
import Svg, { Polygon, Path } from 'react-native-svg';

interface LanchaiMarkProps {
  size?: number;
  color?: string;
  hexColor?: string;
}

export default function LanchaiMark({ size = 80, color = '#1E1E1E', hexColor = '#F4B400' }: LanchaiMarkProps) {
  const height = size * 0.78;
  return (
    <Svg width={size} height={height} viewBox="0 0 100 78" aria-label="LANCHAI">
      {/* Honeycomb hexagon head */}
      <Polygon points="50,2 60,8 60,20 50,26 40,20 40,8" fill={hexColor} />
      {/* Left wing loop */}
      <Path
        d="M50 32 C 28 12, 6 32, 16 50 C 22 62, 40 62, 50 52 Z"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right wing loop */}
      <Path
        d="M50 32 C 72 12, 94 32, 84 50 C 78 62, 60 62, 50 52 Z"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Descending tail */}
      <Path
        d="M50 50 C 50 62, 56 70, 48 76"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
