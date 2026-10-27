import type React from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from './brandShades';

// ONE look per category (validated Home mockup), used by the Home categories, the My
// Account stickers and the My Account header bubbles — a category always looks the same
// everywhere. Icons are rentable objects, never abstract symbols. Palette shades only.
export type CategoryIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface CategoryStyle {
  icon: CategoryIconName;
  bg: string;
  fg: string;
  /** Dark background — text / icons on it must be light (category page header). */
  dark?: boolean;
}

// Every category has a UNIQUE background + icon combination:
// Fun mid-amber/carbon · Tools carbon/amber · Outdoor light-amber/dark-amber ·
// Sports dark-amber/light-amber · Kids carbon-soft/soft-amber · Home grey/carbon.
export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  outdoor: { icon: 'tent', bg: SHADES.amberLight, fg: SHADES.amberDeep },
  tools: { icon: 'hammer-wrench', bg: SHADES.carbon, fg: SHADES.amber, dark: true },
  fun: { icon: 'speaker', bg: SHADES.amberMid, fg: SHADES.carbon },
  kids: { icon: 'baby-carriage', bg: SHADES.carbonSoft, fg: SHADES.amberSoft, dark: true },
  sports: { icon: 'bike', bg: SHADES.amberDeep, fg: SHADES.amberLight, dark: true },
  home: { icon: 'sofa-outline', bg: SHADES.carbonLight, fg: SHADES.carbon },
  // Explore's "All" filter circle (not a real category).
  all: { icon: 'view-grid-outline', bg: SHADES.carbonLight, fg: SHADES.carbon },
};

const FALLBACK: CategoryStyle = { icon: 'package-variant-closed', bg: SHADES.carbonLight, fg: SHADES.carbon };

export function categoryStyle(cat: string): CategoryStyle {
  return CATEGORY_STYLE[cat] ?? FALLBACK;
}
