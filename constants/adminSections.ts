import type { Feather } from '@expo/vector-icons';

// Admin dashboard — the ONE list of entries (app/admin/index.tsx renders it group by
// group, filtered on `minRole`: staff see only 'staff' entries, owners see everything).
// ADMIN_ROUTE_ROLES classifies EVERY admin route: app/admin/_layout.tsx sends a staff
// member away from an owner route (deep links too). Server-side, firestore.rules /
// storage.rules / requireRole() enforce the same split — this file only mirrors it.
// Edit here only.

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
  { id: 'verifications', title: 'Verifications', sub: 'ID documents, residency and business accounts', icon: 'shield', route: '/admin/verifications', group: 'operations', minRole: 'owner', badge: 'verifications' },
  { id: 'claims', title: 'Claims', sub: 'Customer disputes and issues', icon: 'flag', route: '/admin/claims', group: 'operations', minRole: 'staff', badge: 'claims' },
  { id: 'stock', title: 'Stock', sub: 'Live stock overview by status, per product', icon: 'bar-chart-2', route: '/admin/inventory', group: 'operations', minRole: 'staff' },
  // Customers
  { id: 'requests', title: 'Item requests', sub: '"Ask for an item" from renters', icon: 'inbox', route: '/admin/requests', group: 'customers', minRole: 'staff', badge: 'requests' },
  { id: 'reviews', title: 'Reviews', sub: 'Read and moderate customer reviews', icon: 'star', route: '/admin/reviews', group: 'customers', minRole: 'owner' },
  // Catalogue
  { id: 'products', title: 'Products', sub: 'Your rental catalogue (staff: read only)', icon: 'package', route: '/admin/products', group: 'catalogue', minRole: 'staff' },
  { id: 'collections', title: 'Packs and collections', sub: 'Bookable packs and Home "Got plans?" picks', icon: 'layers', route: '/admin/collections', group: 'catalogue', minRole: 'owner' },
  // Marketing
  { id: 'app-content', title: 'App content', sub: 'Home slides and onboarding', icon: 'image', route: '/admin/app-content', group: 'marketing', minRole: 'owner' },
  { id: 'promo-codes', title: 'Promo codes', sub: 'Discount codes for campaigns and partners', icon: 'tag', route: '/admin/promo-codes', group: 'marketing', minRole: 'owner' },
  { id: 'loyalty', title: 'Loyalty', sub: 'Tiers, points, coupons and referrals', icon: 'award', route: '/admin/loyalty', group: 'marketing', minRole: 'owner' },
  { id: 'broadcast', title: 'Broadcast', sub: 'Send news and announcements', icon: 'radio', route: '/admin/broadcast', group: 'marketing', minRole: 'owner' },
  // Settings
  { id: 'shop', title: 'Shop and exchange rate', sub: 'Address, hours, slots, late returns, rates and VAT', icon: 'shopping-bag', route: '/admin/shop-settings', group: 'settings', minRole: 'owner' },
  { id: 'tools', title: 'Tools', sub: 'Product thumbnails and search vocabulary', icon: 'tool', route: '/admin/tools', group: 'settings', minRole: 'owner' },
  { id: 'team', title: 'Team', sub: 'Staff accounts, roles and access', icon: 'users', route: '/admin/team', group: 'settings', minRole: 'owner' },
];

/** Tools screen (app/admin/tools.tsx) — same card shape. */
export const ADMIN_TOOLS: Omit<AdminSection, 'group' | 'minRole'>[] = [
  { id: 'product-thumbs', title: 'Product thumbnails', sub: 'Check and generate the small photo copies', icon: 'image', route: '/admin/product-thumbs' },
  { id: 'search-vocabulary', title: 'Search vocabulary', sub: 'Related words the app search understands', icon: 'search', route: '/admin/search-vocabulary' },
];

/** Sections a role may see on the dashboard. */
export function sectionsFor(role: AdminRole): AdminSection[] {
  return role === 'owner' ? ADMIN_SECTIONS : ADMIN_SECTIONS.filter(x => x.minRole === 'staff');
}

/**
 * EVERY admin route (expo-router path, dynamic segments as written in the file name) →
 * the minimum role. A route missing here is OWNER-only (default deny for staff);
 * tests/unit/adminSections.test.ts fails while a file under app/admin isn't listed.
 */
export const ADMIN_ROUTE_ROLES: Record<string, AdminRole> = {
  // Staff: serve one customer at the counter.
  '/admin': 'staff',
  '/admin/rentals': 'staff',
  '/admin/reservations': 'staff',
  '/admin/reservations/[id]': 'staff',
  '/admin/reservations/[id]/checklist': 'staff',
  '/admin/checklist-summary': 'staff',
  '/admin/calendar': 'staff',
  '/admin/calendar/[date]': 'staff',
  '/admin/scan': 'staff',
  '/admin/claims': 'staff',
  '/admin/claims/[id]': 'staff',
  '/admin/inventory': 'staff',
  '/admin/inventory/[id]': 'staff',
  '/admin/products': 'staff',
  '/admin/requests': 'staff',
  '/admin/saved-replies': 'staff',
  // Owner only.
  '/admin/app-content': 'owner',
  '/admin/broadcast': 'owner',
  '/admin/business-accounts': 'owner',
  '/admin/business-accounts/[uid]': 'owner',
  '/admin/collection-form': 'owner',
  '/admin/collections': 'owner',
  '/admin/exchange-rate': 'owner',
  '/admin/home-slide-form': 'owner',
  '/admin/home-slides': 'owner',
  '/admin/identity/[uid]': 'owner',
  '/admin/loyalty': 'owner',
  '/admin/onboarding': 'owner',
  '/admin/product-form': 'owner',
  '/admin/product-thumbs': 'owner',
  '/admin/promo-code-form': 'owner',
  '/admin/promo-codes': 'owner',
  '/admin/residency/[uid]': 'owner',
  '/admin/reviews': 'owner',
  '/admin/search-vocabulary': 'owner',
  '/admin/shop-settings': 'owner',
  '/admin/team': 'owner',
  '/admin/tools': 'owner',
  '/admin/verifications': 'owner',
};

/** Can this role open this route? (`segments` = expo-router useSegments()). */
export function canOpenAdminRoute(role: AdminRole, segments: string[]): boolean {
  if (role === 'owner') return true;
  const route = '/' + segments.filter(x => !x.startsWith('(')).join('/');
  return ADMIN_ROUTE_ROLES[route] === 'staff';
}
