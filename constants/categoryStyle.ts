import type React from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from './brandShades';
import { CATEGORY_CONFIG } from '@/functions/src/shared/categories';

// ONE look per category, used by the Home categories, the My Account stickers and the My
// Account header bubbles — a category always looks the same everywhere. Icons, shades and
// order live in functions/src/shared/categories.ts (the ONE category config).
export type CategoryIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface CategoryStyle {
  icon: CategoryIconName;
  bg: string;
  fg: string;
  /** Dark background — text / icons on it must be light. */
  dark?: boolean;
}

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  ...Object.fromEntries(CATEGORY_CONFIG.map(c => [c.id, {
    icon: c.icon as CategoryIconName, bg: SHADES[c.bg], fg: SHADES[c.fg], dark: c.dark,
  }])),
  // Explore's "All" filter circle (not a real category).
  all: { icon: 'view-grid-outline', bg: SHADES.carbonLight, fg: SHADES.carbon },
};

const FALLBACK: CategoryStyle = { icon: 'package-variant-closed', bg: SHADES.carbonLight, fg: SHADES.carbon };

export function categoryStyle(cat: string | null | undefined): CategoryStyle {
  return (cat && CATEGORY_STYLE[cat]) || FALLBACK;
}
