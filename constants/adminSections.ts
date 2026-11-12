import type { Feather } from '@expo/vector-icons';

// Admin dashboard — the ONE list of entries (app/admin/index.tsx renders it group by
// group). Phase 2 will filter on `minRole`; today every entry is 'staff' = visible to
// every admin, exactly as before. Edit here only.

export type AdminRole = 'staff' | 'owner';
export type AdminGroup = 'operations' | 'customers' | 'catalogue' | 'marketing' | 'settings';
/** Live counter shown as a red pill on the card (computed by the dashboard). */
export type AdminBadge = 'late' | 'verifications' | 'claims' | 'requests';

export interface AdminSection {
  id: string;
  title: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
  /** An existing route under app/ (tests/unit/adminSections.test.ts checks the file). */
  route: string;
  group: AdminGroup;
  minRole: AdminRole;
  badge?: AdminBadge;
}

/** Display order of the groups. */
export const ADMIN_GROUPS: { id: AdminGroup; title: string }[] = [
  { id: 'operations', title: 'Operations' },
  { id: 'customers', title: 'Customers' },
  { id: 'catalogue', title: 'Catalogue' },
  { id: 'marketing', title: 'Marketing' },
  { id: 'settings', title: 'Settings' },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  // Operations
  { id: 'rentals', title: 'Rentals', sub: 'Today, calendar and every booking', icon: 'calendar', route: '/admin/rentals', group: 'operations', minRole: 'staff', badge: 'late' },
  { id: 'verifications', title: 'Verifications', sub: 'ID documents, residency and business accounts', icon: 'shield', route: '/admin/verifications', group: 'operations', minRole: 'staff', badge: 'verifications' },
  { id: 'claims', title: 'Claims', sub: 'Customer disputes and issues', icon: 'flag', route: '/admin/claims', group: 'operations', minRole: 'staff', badge: 'claims' },
  { id: 'stock', title: 'Stock', sub: 'Live stock overview by status, per product', icon: 'bar-chart-2', route: '/admin/inventory', group: 'operations', minRole: 'staff' },
  // Customers
  { id: 'requests', title: 'Item requests', sub: '"Ask for an item" from renters', icon: 'inbox', route: '/admin/requests', group: 'customers', minRole: 'staff', badge: 'requests' },
  { id: 'reviews', title: 'Reviews', sub: 'Read and moderate customer reviews', icon: 'star', route: '/admin/reviews', group: 'customers', minRole: 'staff' },
  // Catalogue
  { id: 'products', title: 'Products', sub: 'Your rental catalogue', icon: 'package', route: '/admin/products', group: 'catalogue', minRole: 'staff' },
  { id: 'collections', title: 'Packs and collections', sub: 'Bookable packs and Home "Got plans?" picks', icon: 'layers', route: '/admin/collections', group: 'catalogue', minRole: 'staff' },
  // Marketing
  { id: 'app-content', title: 'App content', sub: 'Home slides and onboarding', icon: 'image', route: '/admin/app-content', group: 'marketing', minRole: 'staff' },
  { id: 'promo-codes', title: 'Promo codes', sub: 'Discount codes for campaigns and partners', icon: 'tag', route: '/admin/promo-codes', group: 'marketing', minRole: 'staff' },
  { id: 'loyalty', title: 'Loyalty', sub: 'Tiers, points, coupons and referrals', icon: 'award', route: '/admin/loyalty', group: 'marketing', minRole: 'staff' },
  { id: 'broadcast', title: 'Broadcast', sub: 'Send news and announcements', icon: 'radio', route: '/admin/broadcast', group: 'marketing', minRole: 'staff' },
  // Settings
  { id: 'shop', title: 'Shop and exchange rate', sub: 'Address, hours, slots, late returns, rates and VAT', icon: 'shopping-bag', route: '/admin/shop-settings', group: 'settings', minRole: 'staff' },
  { id: 'tools', title: 'Tools', sub: 'Product thumbnails and search vocabulary', icon: 'tool', route: '/admin/tools', group: 'settings', minRole: 'staff' },
];

/** Tools screen (app/admin/tools.tsx) — same card shape. */
export const ADMIN_TOOLS: Omit<AdminSection, 'group' | 'minRole'>[] = [
  { id: 'product-thumbs', title: 'Product thumbnails', sub: 'Check and generate the small photo copies', icon: 'image', route: '/admin/product-thumbs' },
  { id: 'search-vocabulary', title: 'Search vocabulary', sub: 'Related words the app search understands', icon: 'search', route: '/admin/search-vocabulary' },
];
